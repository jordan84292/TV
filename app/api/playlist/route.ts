import { NextRequest, NextResponse } from "next/server";
import { fetchAndParseM3U } from "@/lib/m3u";

// Fetches an arbitrary .m3u/.m3u8 playlist server-side and returns parsed
// channels as JSON. Running this on the server (instead of fetching from the
// browser) sidesteps CORS restrictions most IPTV playlist hosts impose.
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Falta el parámetro 'url'." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "URL de lista inválida." }, { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Solo se permiten URLs http/https." }, { status: 400 });
  }

  try {
    const channels = await fetchAndParseM3U(parsed.toString());

    if (channels.length === 0) {
      return NextResponse.json(
        { error: "La lista se cargó pero no contiene canales válidos." },
        { status: 422 }
      );
    }

    return NextResponse.json({ channels });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo conectar con la lista.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
