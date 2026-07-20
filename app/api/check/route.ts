import { NextRequest, NextResponse } from "next/server";

const TIMEOUT_MS = 4500;
const MAX_DEPTH = 3; // master playlist -> variant playlist -> segment
const USER_AGENT = "Mozilla/5.0 (compatible; M3UPlayer/1.0)";

interface ProbeResult {
  reachable: boolean;
  corsOk: boolean;
  body?: string;
}

function isCorsPermitted(res: Response, origin: string): boolean {
  const acao = res.headers.get("access-control-allow-origin");
  return acao === "*" || acao === origin;
}

function looksLikeManifest(url: string): boolean {
  return url.toLowerCase().split("?")[0].endsWith(".m3u8");
}

async function probe(url: string, origin: string, wantBody: boolean): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        // Node's fetch lets us set Origin explicitly (browsers forbid this) so
        // we can check the exact CORS response a real browser tab would get.
        Origin: origin,
        ...(wantBody ? {} : { Range: "bytes=0-1024" }),
      },
    });
    const reachable = res.ok || res.status === 206;
    const corsOk = isCorsPermitted(res, origin);
    const body = wantBody && reachable ? await res.text() : undefined;
    return { reachable, corsOk, body };
  } catch {
    return { reachable: false, corsOk: false };
  } finally {
    clearTimeout(timer);
  }
}

function firstResourceUri(manifestText: string, manifestUrl: string): string | null {
  const line = manifestText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
  if (!line) return null;
  try {
    return new URL(line, manifestUrl).toString();
  } catch {
    return null;
  }
}

// There's no proxy in front of playback anymore, so a channel only actually
// plays if every hop hls.js would fetch -- master playlist, variant
// playlist, and the first media segment -- is reachable, sends a permissive
// Access-Control-Allow-Origin header, and isn't http:// on an https:// page
// (mixed content, which browsers block outright regardless of CORS).
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ ok: false, error: "Falta el parámetro 'url'." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ ok: false, error: "URL inválida." }, { status: 400 });
  }

  const origin = request.nextUrl.origin;
  const pageIsSecure = request.nextUrl.protocol === "https:";

  let currentUrl = parsed.toString();

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    if (pageIsSecure && new URL(currentUrl).protocol === "http:") {
      return NextResponse.json({ ok: false, reason: "mixed-content" });
    }

    const wantBody = looksLikeManifest(currentUrl);
    const result = await probe(currentUrl, origin, wantBody);

    if (!result.reachable || !result.corsOk) {
      return NextResponse.json({ ok: false });
    }

    const body = result.body?.trim() ?? "";
    if (!wantBody || !body.startsWith("#EXTM3U")) {
      // Reached an actual media segment (or a manifest URL that didn't turn
      // out to be one) that's reachable and CORS-permitted -- good enough.
      return NextResponse.json({ ok: true });
    }

    const nextUri = firstResourceUri(body, currentUrl);
    if (!nextUri) {
      // Manifest parsed but listed nothing playable -- treat what we've
      // verified so far as the best available signal.
      return NextResponse.json({ ok: true });
    }
    currentUrl = nextUri;
  }

  return NextResponse.json({ ok: true });
}
