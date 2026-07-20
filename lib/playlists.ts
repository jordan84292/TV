export interface PlaylistSource {
  id: string;
  name: string;
  url: string;
  isDefault?: boolean;
}

export const DEFAULT_PLAYLIST: PlaylistSource = {
  id: "iptv-org-spanish",
  name: "IPTV-ORG (Español)",
  url: "https://iptv-org.github.io/iptv/languages/spa.m3u",
  isDefault: true,
};

const STORAGE_KEY = "m3u-player:playlists";
const ACTIVE_KEY = "m3u-player:active-playlist";

export function loadStoredPlaylists(): PlaylistSource[] {
  if (typeof window === "undefined") return [DEFAULT_PLAYLIST];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const extra: PlaylistSource[] = raw ? JSON.parse(raw) : [];
    return [DEFAULT_PLAYLIST, ...extra.filter((p) => p.id !== DEFAULT_PLAYLIST.id)];
  } catch {
    return [DEFAULT_PLAYLIST];
  }
}

export function saveStoredPlaylists(playlists: PlaylistSource[]): void {
  if (typeof window === "undefined") return;
  const extra = playlists.filter((p) => !p.isDefault);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(extra));
}

export function loadActivePlaylistId(): string {
  if (typeof window === "undefined") return DEFAULT_PLAYLIST.id;
  return window.localStorage.getItem(ACTIVE_KEY) || DEFAULT_PLAYLIST.id;
}

export function saveActivePlaylistId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_KEY, id);
}

export function makePlaylistId(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${slug || "lista"}-${Date.now().toString(36)}`;
}
