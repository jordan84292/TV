import type { Channel } from "@/types/channel";
import { DEFAULT_PLAYLIST } from "@/lib/playlists";

const ATTR_RE = /([a-zA-Z0-9_-]+)="([^"]*)"/g;

function parseAttributes(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let match: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((match = ATTR_RE.exec(line)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function parseDisplayName(line: string): string {
  const commaIndex = line.lastIndexOf(",");
  return commaIndex === -1 ? "Sin nombre" : line.slice(commaIndex + 1).trim();
}

export function parseM3U(raw: string): Channel[] {
  const lines = raw.split(/\r?\n/);
  const channels: Channel[] = [];

  let pendingName = "";
  let pendingLogo: string | null = null;
  let pendingGroup = "Sin categoría";
  let pendingId = "";
  let pendingReferrer: string | null = null;
  let seq = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF")) {
      const attrs = parseAttributes(line);
      pendingName = parseDisplayName(line) || attrs["tvg-name"] || "Sin nombre";
      pendingLogo = attrs["tvg-logo"] || null;
      pendingGroup = attrs["group-title"] || "Sin categoría";
      pendingId = attrs["tvg-id"] || "";
      pendingReferrer = attrs["http-referrer"] || attrs["referrer"] || null;
      continue;
    }

    // Some lists specify the referrer as a VLC option line instead of (or
    // in addition to) an #EXTINF attribute.
    if (line.startsWith("#EXTVLCOPT:")) {
      const opt = line.slice("#EXTVLCOPT:".length);
      const eq = opt.indexOf("=");
      if (eq !== -1) {
        const key = opt.slice(0, eq).trim().toLowerCase();
        if (key === "http-referrer" && !pendingReferrer) {
          pendingReferrer = opt.slice(eq + 1).trim();
        }
      }
      continue;
    }

    if (line.startsWith("#")) continue;

    // Any non-comment, non-empty line following an #EXTINF is the stream URL.
    const streamUrl = line;
    seq += 1;
    const id = pendingId ? `${pendingId}-${seq}` : `channel-${seq}`;

    channels.push({
      id,
      name: pendingName || "Sin nombre",
      logoUrl: pendingLogo,
      group: pendingGroup,
      streamUrl,
      tvgId: pendingId || null,
      referrer: pendingReferrer,
    });

    pendingName = "";
    pendingLogo = null;
    pendingGroup = "Sin categoría";
    pendingId = "";
    pendingReferrer = null;
  }

  return channels;
}

const REVALIDATE_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  channels: Channel[];
  expiresAt: number;
}

// Next.js's built-in fetch cache refuses to store responses over 2MB, and the
// iptv-org playlist is ~4MB, so ISR via `next: { revalidate }` silently
// no-ops for it. Do our own time-based in-memory cache instead, shared by
// every m3u/m3u8 URL we fetch (the default list and any user-added ones).
const cache = new Map<string, CacheEntry>();

export async function fetchAndParseM3U(url: string): Promise<Channel[]> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.channels;
  }

  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; M3UPlayer/1.0)" },
  });

  if (!res.ok) {
    throw new Error(`No se pudo cargar la lista de canales (${res.status})`);
  }

  const raw = await res.text();
  const channels = parseM3U(raw);
  cache.set(url, { channels, expiresAt: Date.now() + REVALIDATE_MS });
  return channels;
}

export async function fetchChannels(): Promise<Channel[]> {
  return fetchAndParseM3U(DEFAULT_PLAYLIST.url);
}

export function groupChannels(channels: Channel[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const channel of channels) {
    counts.set(channel.group, (counts.get(channel.group) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
