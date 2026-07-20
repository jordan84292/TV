import type { ContentType } from "@/lib/playlists";

export interface SuggestedPlaylist {
  name: string;
  url: string;
  contentType: ContentType;
}

const IPTV_ORG = "https://iptv-org.github.io/iptv";

// Curated from iptv-org (a public, openly-licensed catalog of freely
// distributed IPTV streams) -- one-click adds for common Latin American
// countries plus the movies/series categories for the VOD section.
export const SUGGESTED_PLAYLISTS: SuggestedPlaylist[] = [
  { name: "Costa Rica", url: `${IPTV_ORG}/countries/cr.m3u`, contentType: "tv" },
  { name: "México", url: `${IPTV_ORG}/countries/mx.m3u`, contentType: "tv" },
  { name: "Argentina", url: `${IPTV_ORG}/countries/ar.m3u`, contentType: "tv" },
  { name: "Colombia", url: `${IPTV_ORG}/countries/co.m3u`, contentType: "tv" },
  { name: "Perú", url: `${IPTV_ORG}/countries/pe.m3u`, contentType: "tv" },
  { name: "Venezuela", url: `${IPTV_ORG}/countries/ve.m3u`, contentType: "tv" },
  { name: "Ecuador", url: `${IPTV_ORG}/countries/ec.m3u`, contentType: "tv" },
  { name: "Guatemala", url: `${IPTV_ORG}/countries/gt.m3u`, contentType: "tv" },
  { name: "Honduras", url: `${IPTV_ORG}/countries/hn.m3u`, contentType: "tv" },
  { name: "Nicaragua", url: `${IPTV_ORG}/countries/ni.m3u`, contentType: "tv" },
  { name: "Panamá", url: `${IPTV_ORG}/countries/pa.m3u`, contentType: "tv" },
  { name: "El Salvador", url: `${IPTV_ORG}/countries/sv.m3u`, contentType: "tv" },
  { name: "República Dominicana", url: `${IPTV_ORG}/countries/do.m3u`, contentType: "tv" },
  { name: "Bolivia", url: `${IPTV_ORG}/countries/bo.m3u`, contentType: "tv" },
  { name: "Paraguay", url: `${IPTV_ORG}/countries/py.m3u`, contentType: "tv" },
  { name: "Uruguay", url: `${IPTV_ORG}/countries/uy.m3u`, contentType: "tv" },
  { name: "Chile", url: `${IPTV_ORG}/countries/cl.m3u`, contentType: "tv" },
  { name: "Películas (iptv-org)", url: `${IPTV_ORG}/categories/movies.m3u`, contentType: "vod" },
  { name: "Series (iptv-org)", url: `${IPTV_ORG}/categories/series.m3u`, contentType: "vod" },
];
