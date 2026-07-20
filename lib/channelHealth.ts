const STORAGE_KEY = "m3u-player:channel-health";
const TTL_MS = 20 * 60 * 1000; // 20 minutes -- streams go up/down often

interface HealthEntry {
  ok: boolean;
  checkedAt: number;
}

type HealthCache = Record<string, HealthEntry>;

function loadCache(): HealthCache {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HealthCache) : {};
  } catch {
    return {};
  }
}

function saveCache(cache: HealthCache): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full or unavailable -- health checks just won't be cached across reloads.
  }
}

export function getCachedHealth(streamUrl: string): boolean | null {
  const entry = loadCache()[streamUrl];
  if (!entry || Date.now() - entry.checkedAt > TTL_MS) return null;
  return entry.ok;
}

async function checkOne(streamUrl: string): Promise<boolean> {
  const cached = getCachedHealth(streamUrl);
  if (cached !== null) return cached;

  let ok = false;
  try {
    const res = await fetch(`/api/check?url=${encodeURIComponent(streamUrl)}`);
    const data = await res.json();
    ok = Boolean(data.ok);
  } catch {
    ok = false;
  }

  const cache = loadCache();
  cache[streamUrl] = { ok, checkedAt: Date.now() };
  saveCache(cache);
  return ok;
}

// Checks many URLs with bounded concurrency, reporting progress as results
// land so the UI can reveal working channels incrementally instead of
// blocking on the whole batch.
export async function checkMany(
  streamUrls: string[],
  onResult: (streamUrl: string, ok: boolean) => void,
  concurrency = 10
): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < streamUrls.length) {
      const url = streamUrls[cursor++];
      const ok = await checkOne(url);
      onResult(url, ok);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, streamUrls.length) }, worker)
  );
}
