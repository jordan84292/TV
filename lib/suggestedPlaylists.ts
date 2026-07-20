export interface SuggestedPlaylist {
  name: string;
  url: string;
}

const IPTV_ORG = "https://iptv-org.github.io/iptv";

// Curated from iptv-org (a public, openly-licensed catalog of freely
// distributed IPTV streams) -- one-click adds for common Latin American
// countries.
export const SUGGESTED_PLAYLISTS: SuggestedPlaylist[] = [
  { name: "Costa Rica", url: `${IPTV_ORG}/countries/cr.m3u` },
  { name: "México", url: `${IPTV_ORG}/countries/mx.m3u` },
  { name: "Argentina", url: `${IPTV_ORG}/countries/ar.m3u` },
  { name: "Colombia", url: `${IPTV_ORG}/countries/co.m3u` },
  { name: "Perú", url: `${IPTV_ORG}/countries/pe.m3u` },
  { name: "Venezuela", url: `${IPTV_ORG}/countries/ve.m3u` },
  { name: "Ecuador", url: `${IPTV_ORG}/countries/ec.m3u` },
  { name: "Guatemala", url: `${IPTV_ORG}/countries/gt.m3u` },
  { name: "Honduras", url: `${IPTV_ORG}/countries/hn.m3u` },
  { name: "Nicaragua", url: `${IPTV_ORG}/countries/ni.m3u` },
  { name: "Panamá", url: `${IPTV_ORG}/countries/pa.m3u` },
  { name: "El Salvador", url: `${IPTV_ORG}/countries/sv.m3u` },
  { name: "República Dominicana", url: `${IPTV_ORG}/countries/do.m3u` },
  { name: "Bolivia", url: `${IPTV_ORG}/countries/bo.m3u` },
  { name: "Paraguay", url: `${IPTV_ORG}/countries/py.m3u` },
  { name: "Uruguay", url: `${IPTV_ORG}/countries/uy.m3u` },
  { name: "Chile", url: `${IPTV_ORG}/countries/cl.m3u` },
];
