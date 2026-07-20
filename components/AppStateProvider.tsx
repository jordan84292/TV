"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Channel } from "@/types/channel";
import {
  DEFAULT_PLAYLIST,
  loadActivePlaylistId,
  loadLocalChannels,
  loadStoredPlaylists,
  makePlaylistId,
  removeLocalChannels,
  saveActivePlaylistId,
  saveLocalChannels,
  saveStoredPlaylists,
  type PlaylistSource,
} from "@/lib/playlists";
import { loadFavorites, saveFavorites } from "@/lib/favorites";
import { parseM3U } from "@/lib/m3u";

const OVERRIDE_STORAGE_KEY = "m3u-player:channel-source-override";

interface State {
  playlists: PlaylistSource[];
  activePlaylistId: string;
  channelsBySource: Record<string, Channel[]>;
  loadingPlaylistId: string | null;
  playlistError: string | null;
  searchQuery: string;
  selectedGroup: string | null;
  channelSourceOverride: Record<string, string>;
  favorites: Set<string>;
}

type Action =
  | { type: "HYDRATE_PLAYLISTS"; playlists: PlaylistSource[] }
  | {
      type: "HYDRATE_EXTRAS";
      channelSourceOverride: Record<string, string>;
      favorites: Set<string>;
    }
  | { type: "SWITCH_PLAYLIST_START"; id: string }
  | { type: "SWITCH_PLAYLIST_DONE"; id: string; channels: Channel[] }
  | { type: "SWITCH_PLAYLIST_ERROR"; id: string; error: string }
  | { type: "ADD_PLAYLIST"; playlist: PlaylistSource; channels: Channel[] }
  | { type: "REMOVE_PLAYLIST"; id: string; fallbackId: string }
  | { type: "SET_SEARCH"; query: string }
  | { type: "SET_GROUP"; group: string | null }
  | { type: "SET_CHANNEL_SOURCE_OVERRIDE"; channelKey: string; playlistId: string | null }
  | { type: "TOGGLE_FAVORITE"; channelKey: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "HYDRATE_PLAYLISTS":
      return { ...state, playlists: action.playlists };
    case "HYDRATE_EXTRAS":
      return {
        ...state,
        channelSourceOverride: action.channelSourceOverride,
        favorites: action.favorites,
      };
    case "SET_CHANNEL_SOURCE_OVERRIDE": {
      const next = { ...state.channelSourceOverride };
      if (action.playlistId) next[action.channelKey] = action.playlistId;
      else delete next[action.channelKey];
      return { ...state, channelSourceOverride: next };
    }
    case "TOGGLE_FAVORITE": {
      const next = new Set(state.favorites);
      if (next.has(action.channelKey)) next.delete(action.channelKey);
      else next.add(action.channelKey);
      return { ...state, favorites: next };
    }
    case "SWITCH_PLAYLIST_START":
      return {
        ...state,
        loadingPlaylistId: state.channelsBySource[action.id] ? null : action.id,
        activePlaylistId: action.id,
        playlistError: null,
        selectedGroup: null,
        searchQuery: "",
      };
    case "SWITCH_PLAYLIST_DONE":
      return {
        ...state,
        loadingPlaylistId: null,
        channelsBySource: { ...state.channelsBySource, [action.id]: action.channels },
      };
    case "SWITCH_PLAYLIST_ERROR":
      return { ...state, loadingPlaylistId: null, playlistError: action.error };
    case "ADD_PLAYLIST": {
      const playlists = [...state.playlists, action.playlist];
      return {
        ...state,
        playlists,
        activePlaylistId: action.playlist.id,
        channelsBySource: { ...state.channelsBySource, [action.playlist.id]: action.channels },
        loadingPlaylistId: null,
        playlistError: null,
        selectedGroup: null,
        searchQuery: "",
      };
    }
    case "REMOVE_PLAYLIST": {
      const playlists = state.playlists.filter((p) => p.id !== action.id);
      const wasActive = state.activePlaylistId === action.id;
      const rest = { ...state.channelsBySource };
      delete rest[action.id];
      return {
        ...state,
        playlists,
        channelsBySource: rest,
        activePlaylistId: wasActive ? action.fallbackId : state.activePlaylistId,
      };
    }
    case "SET_SEARCH":
      return { ...state, searchQuery: action.query };
    case "SET_GROUP":
      return { ...state, selectedGroup: action.group };
    default:
      return state;
  }
}

interface AppStateValue {
  playlists: PlaylistSource[];
  activePlaylistId: string;
  activePlaylist: PlaylistSource | null;
  channels: Channel[];
  channelsBySource: Record<string, Channel[]>;
  isLoadingPlaylist: boolean;
  playlistError: string | null;

  searchQuery: string;
  selectedGroup: string | null;

  switchPlaylist: (id: string) => void;
  addPlaylist: (name: string, url: string) => Promise<void>;
  addLocalPlaylist: (name: string, m3uText: string) => Promise<void>;
  removePlaylist: (id: string) => void;
  setSearchQuery: (q: string) => void;
  setSelectedGroup: (g: string | null) => void;

  channelSourceOverride: Record<string, string>;
  setChannelSourceOverride: (channelKey: string, playlistId: string | null) => void;

  favorites: Set<string>;
  toggleFavorite: (channelKey: string) => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

async function fetchPlaylistChannels(url: string): Promise<Channel[]> {
  const res = await fetch(`/api/playlist?url=${encodeURIComponent(url)}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "No se pudo cargar la lista.");
  }
  return data.channels as Channel[];
}

function loadOverrideCache(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(OVERRIDE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function AppStateProvider({
  initialChannels,
  children,
}: {
  initialChannels: Channel[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [state, dispatch] = useReducer(reducer, {
    playlists: [DEFAULT_PLAYLIST],
    activePlaylistId: DEFAULT_PLAYLIST.id,
    channelsBySource: { [DEFAULT_PLAYLIST.id]: initialChannels },
    loadingPlaylistId: null,
    playlistError: null,
    searchQuery: "",
    selectedGroup: null,
    // Start empty (matching the server, which has no access to
    // localStorage) and hydrate for real in the mount effect below --
    // reading localStorage in the initial state would make the client's
    // first render disagree with the server-rendered HTML and break
    // hydration.
    channelSourceOverride: {},
    favorites: new Set<string>(),
  });

  // Guards the two persistence effects below so they don't fire with the
  // still-empty initial state before the mount effect has read the real
  // values from localStorage -- without this, that first (empty) write
  // would clobber whatever was already saved from a previous visit.
  const hydratedRef = useRef(false);

  // Keep localStorage in sync with these two any time they change --
  // synchronizing an external system with React state is exactly what
  // effects are for.
  useEffect(() => {
    if (!hydratedRef.current || typeof window === "undefined") return;
    window.localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(state.channelSourceOverride));
  }, [state.channelSourceOverride]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    saveFavorites(state.favorites);
  }, [state.favorites]);

  const switchPlaylistInternal = useCallback(async (source: PlaylistSource) => {
    dispatch({ type: "SWITCH_PLAYLIST_START", id: source.id });
    if (source.origin === "local") {
      // No URL to (re)fetch -- the channels were parsed once at add-time
      // and live in localStorage instead.
      dispatch({ type: "SWITCH_PLAYLIST_DONE", id: source.id, channels: loadLocalChannels<Channel>(source.id) });
      return;
    }
    try {
      const channels = await fetchPlaylistChannels(source.url);
      dispatch({ type: "SWITCH_PLAYLIST_DONE", id: source.id, channels });
    } catch (err) {
      dispatch({
        type: "SWITCH_PLAYLIST_ERROR",
        id: source.id,
        error: err instanceof Error ? err.message : "No se pudo cargar la lista.",
      });
    }
  }, []);

  // Hydrate saved playlists / active list / overrides / favorites from
  // localStorage/URL once on mount (client-only, after the first paint
  // matches the server).
  useEffect(() => {
    const playlists = loadStoredPlaylists();
    dispatch({ type: "HYDRATE_PLAYLISTS", playlists });
    dispatch({
      type: "HYDRATE_EXTRAS",
      channelSourceOverride: loadOverrideCache(),
      favorites: loadFavorites(),
    });
    hydratedRef.current = true;

    const listParam = searchParams.get("list");
    const targetId = listParam || loadActivePlaylistId();
    const target = playlists.find((p) => p.id === targetId);

    if (target && target.id !== DEFAULT_PLAYLIST.id) {
      switchPlaylistInternal(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchPlaylist = useCallback(
    (id: string) => {
      const source = state.playlists.find((p) => p.id === id);
      if (!source) return;
      saveActivePlaylistId(id);
      if (state.channelsBySource[id]) {
        dispatch({ type: "SWITCH_PLAYLIST_START", id });
        dispatch({ type: "SWITCH_PLAYLIST_DONE", id, channels: state.channelsBySource[id] });
      } else {
        switchPlaylistInternal(source);
      }
      const params = new URLSearchParams(searchParams.toString());
      params.delete("channel");
      if (id === DEFAULT_PLAYLIST.id) {
        params.delete("list");
      } else {
        params.set("list", id);
      }
      router.push(`/?${params.toString()}`, { scroll: false });
    },
    [state.playlists, state.channelsBySource, switchPlaylistInternal, router, searchParams]
  );

  const addPlaylist = useCallback(
    async (name: string, url: string) => {
      const trimmedName = name.trim() || url;
      const id = makePlaylistId(trimmedName);
      const source: PlaylistSource = { id, name: trimmedName, url: url.trim() };
      dispatch({ type: "SWITCH_PLAYLIST_START", id });
      try {
        const channels = await fetchPlaylistChannels(source.url);
        dispatch({ type: "ADD_PLAYLIST", playlist: source, channels });
        const next = [...loadStoredPlaylists().filter((p) => !p.isDefault), source];
        saveStoredPlaylists(next);
        saveActivePlaylistId(id);
        const params = new URLSearchParams(searchParams.toString());
        params.delete("channel");
        params.set("list", id);
        router.push(`/?${params.toString()}`, { scroll: false });
      } catch (err) {
        dispatch({
          type: "SWITCH_PLAYLIST_ERROR",
          id,
          error: err instanceof Error ? err.message : "No se pudo cargar la lista.",
        });
        throw err;
      }
    },
    [router, searchParams]
  );

  // For playlists pasted/uploaded as raw M3U text instead of a URL: parsed
  // once here, then persisted to localStorage since there's nothing to
  // re-fetch from later.
  const addLocalPlaylist = useCallback(
    async (name: string, m3uText: string) => {
      const channels = parseM3U(m3uText);
      if (channels.length === 0) {
        throw new Error("No se encontraron canales válidos en el texto pegado.");
      }
      const trimmedName = name.trim() || "Lista pegada";
      const id = makePlaylistId(trimmedName);
      const source: PlaylistSource = {
        id,
        name: trimmedName,
        url: "",
        origin: "local",
      };
      dispatch({ type: "ADD_PLAYLIST", playlist: source, channels });
      saveLocalChannels(id, channels);
      const next = [...loadStoredPlaylists().filter((p) => !p.isDefault), source];
      saveStoredPlaylists(next);
      saveActivePlaylistId(id);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("channel");
      params.set("list", id);
      router.push(`/?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const removePlaylist = useCallback(
    (id: string) => {
      const removed = state.playlists.find((p) => p.id === id);
      if (removed?.origin === "local") removeLocalChannels(id);

      dispatch({ type: "REMOVE_PLAYLIST", id, fallbackId: DEFAULT_PLAYLIST.id });

      const remaining = loadStoredPlaylists().filter((p) => p.id !== id);
      saveStoredPlaylists(remaining);
      saveActivePlaylistId(DEFAULT_PLAYLIST.id);
    },
    [state.playlists]
  );

  const setSearchQuery = useCallback((query: string) => {
    dispatch({ type: "SET_SEARCH", query });
  }, []);

  const setSelectedGroup = useCallback((group: string | null) => {
    dispatch({ type: "SET_GROUP", group });
  }, []);

  const setChannelSourceOverride = useCallback((channelKey: string, playlistId: string | null) => {
    dispatch({ type: "SET_CHANNEL_SOURCE_OVERRIDE", channelKey, playlistId });
  }, []);

  const toggleFavorite = useCallback((channelKey: string) => {
    dispatch({ type: "TOGGLE_FAVORITE", channelKey });
  }, []);

  const value = useMemo<AppStateValue>(() => {
    const activePlaylist = state.playlists.find((p) => p.id === state.activePlaylistId) ?? null;
    return {
      playlists: state.playlists,
      activePlaylistId: state.activePlaylistId,
      activePlaylist,
      channels: state.channelsBySource[state.activePlaylistId] || [],
      channelsBySource: state.channelsBySource,
      isLoadingPlaylist: state.loadingPlaylistId === state.activePlaylistId,
      playlistError: state.playlistError,
      searchQuery: state.searchQuery,
      selectedGroup: state.selectedGroup,
      switchPlaylist,
      addPlaylist,
      addLocalPlaylist,
      removePlaylist,
      setSearchQuery,
      setSelectedGroup,
      channelSourceOverride: state.channelSourceOverride,
      setChannelSourceOverride,
      favorites: state.favorites,
      toggleFavorite,
    };
  }, [
    state,
    switchPlaylist,
    addPlaylist,
    addLocalPlaylist,
    removePlaylist,
    setSearchQuery,
    setSelectedGroup,
    setChannelSourceOverride,
    toggleFavorite,
  ]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
