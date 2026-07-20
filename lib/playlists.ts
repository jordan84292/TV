export type ContentType = "tv" | "vod";
export type PlaylistOrigin = "remote" | "local";

export interface PlaylistSource {
  id: string;
  name: string;
  url: string;
  contentType: ContentType;
  isDefault?: boolean;
  // "local" lists came from pasted/uploaded M3U text rather than a URL we
  // can re-fetch -- their channels live in localStorage instead (see
  // saveLocalChannels/loadLocalChannels below).
  origin?: PlaylistOrigin;
}

export const DEFAULT_PLAYLIST: PlaylistSource = {
  id: "iptv-org-spanish",
  name: "IPTV-ORG (global)",
  url: "https://iptv-org.github.io/iptv/languages/spa.m3u",
  contentType: "tv",
  isDefault: true,
};

const STORAGE_KEY = "m3u-player:playlists";
const ACTIVE_KEY_PREFIX = "m3u-player:active-playlist:";

export function loadStoredPlaylists(): PlaylistSource[] {
  if (typeof window === "undefined") return [DEFAULT_PLAYLIST];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const extra: (Omit<PlaylistSource, "contentType"> & { contentType?: ContentType })[] = raw
      ? JSON.parse(raw)
      : [];
    // Older saved entries predate contentType -- treat them as TV.
    const normalized: PlaylistSource[] = extra.map((p) => ({ ...p, contentType: p.contentType ?? "tv" }));
    return [DEFAULT_PLAYLIST, ...normalized.filter((p) => p.id !== DEFAULT_PLAYLIST.id)];
  } catch {
    return [DEFAULT_PLAYLIST];
  }
}

export function saveStoredPlaylists(playlists: PlaylistSource[]): void {
  if (typeof window === "undefined") return;
  const extra = playlists.filter((p) => !p.isDefault);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(extra));
}

export function loadActivePlaylistId(section: ContentType): string | null {
  if (typeof window === "undefined") {
    return section === "tv" ? DEFAULT_PLAYLIST.id : null;
  }
  const stored = window.localStorage.getItem(ACTIVE_KEY_PREFIX + section);
  if (stored) return stored;
  return section === "tv" ? DEFAULT_PLAYLIST.id : null;
}

export function saveActivePlaylistId(section: ContentType, id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_KEY_PREFIX + section, id);
}

export function makePlaylistId(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${slug || "lista"}-${Date.now().toString(36)}`;
}

const LOCAL_CHANNELS_KEY_PREFIX = "m3u-player:local-channels:";

export function saveLocalChannels<T>(playlistId: string, channels: T[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_CHANNELS_KEY_PREFIX + playlistId, JSON.stringify(channels));
  } catch {
    // Storage full -- the list just won't survive a reload.
  }
}

export function loadLocalChannels<T>(playlistId: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_CHANNELS_KEY_PREFIX + playlistId);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

export function removeLocalChannels(playlistId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LOCAL_CHANNELS_KEY_PREFIX + playlistId);
}
