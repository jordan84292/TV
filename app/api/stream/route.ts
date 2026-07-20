import { NextRequest, NextResponse } from "next/server";

// Proxies HLS manifests and segments through our own (https://) origin in
// two cases where the browser can't play them directly:
//   1. http:// on an https:// page -- blocked outright as mixed content.
//   2. The channel requires a specific Referer header (anti-hotlinking) --
//      browsers refuse to let JS set that on a direct request, but our
//      server-side fetch can set anything.
// Everything else is left as a direct, unproxied URL (see
// resolveForPlayback below), so most playback still goes straight
// browser-to-origin and only the channels that actually need it cost us
// bandwidth.

function resolveForPlayback(uri: string, base: string, ref: string | null): string {
  const absolute = new URL(uri, base).toString();
  if (ref || absolute.startsWith("http://")) {
    const params = new URLSearchParams({ url: absolute });
    if (ref) params.set("ref", ref);
    return `/api/stream?${params.toString()}`;
  }
  return absolute;
}

function rewriteManifest(text: string, manifestUrl: string, ref: string | null): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (line.startsWith("#")) {
        if (line.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/, (_m, uri) => `URI="${resolveForPlayback(uri, manifestUrl, ref)}"`);
        }
        return line;
      }
      if (line.trim() === "") return line;
      return resolveForPlayback(line.trim(), manifestUrl, ref);
    })
    .join("\n");
}

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("url");
  const ref = request.nextUrl.searchParams.get("ref");
  if (!target) {
    return new NextResponse("Falta el parámetro 'url'.", { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new NextResponse("URL inválida.", { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return new NextResponse("Solo se permiten URLs http/https.", { status: 400 });
  }

  const range = request.headers.get("range");

  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString(), {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; M3UPlayer/1.0)",
        ...(range ? { Range: range } : {}),
        ...(ref ? { Referer: ref } : {}),
      },
    });
  } catch {
    return new NextResponse("No se pudo conectar con el stream.", { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new NextResponse(`El stream respondió con error (${upstream.status}).`, {
      status: 502,
    });
  }

  const contentType = upstream.headers.get("content-type") || "";
  const isManifest = parsed.pathname.toLowerCase().endsWith(".m3u8") || contentType.includes("mpegurl");

  if (isManifest) {
    const text = await upstream.text();
    const rewritten = rewriteManifest(text, parsed.toString(), ref);
    return new NextResponse(rewritten, {
      headers: {
        "content-type": "application/vnd.apple.mpegurl",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      },
    });
  }

  const headers: Record<string, string> = {
    "content-type": contentType || "video/mp2t",
    "cache-control": "public, max-age=31536000, immutable",
    "access-control-allow-origin": "*",
    "accept-ranges": "bytes",
  };
  const contentLength = upstream.headers.get("content-length");
  const contentRange = upstream.headers.get("content-range");
  if (contentLength) headers["content-length"] = contentLength;
  if (contentRange) headers["content-range"] = contentRange;

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
