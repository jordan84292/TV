const STORAGE_KEY = "m3u-player:favorites";

// Favorites are keyed by normalized channel name (see lib/channelMatch.ts)
// rather than by list-specific id, so a channel favorited from one list is
// still recognized as a favorite when the same channel shows up in another.
export function loadFavorites(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function saveFavorites(favorites: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(favorites)));
  } catch {
    // Storage full or unavailable -- favorites just won't persist across reloads.
  }
}
