"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Channel } from "@/types/channel";
import {
  DEFAULT_PLAYLIST,
  loadActivePlaylistId,
  loadStoredPlaylists,
  makePlaylistId,
  saveActivePlaylistId,
  saveStoredPlaylists,
  type PlaylistSource,
} from "@/lib/playlists";

interface State {
  playlists: PlaylistSource[];
  activePlaylistId: string;
  channelsBySource: Record<string, Channel[]>;
  loadingPlaylistId: string | null;
  playlistError: string | null;
  searchQuery: string;
  selectedGroup: string | null;
}

type Action =
  | { type: "HYDRATE_PLAYLISTS"; playlists: PlaylistSource[]; activeId: string }
  | { type: "SWITCH_PLAYLIST_START"; id: string }
  | { type: "SWITCH_PLAYLIST_DONE"; id: string; channels: Channel[]; cached?: boolean }
  | { type: "SWITCH_PLAYLIST_ERROR"; id: string; error: string }
  | { type: "ADD_PLAYLIST"; playlist: PlaylistSource; channels: Channel[] }
  | { type: "REMOVE_PLAYLIST"; id: string }
  | { type: "SET_SEARCH"; query: string }
  | { type: "SET_GROUP"; group: string | null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "HYDRATE_PLAYLISTS":
      return { ...state, playlists: action.playlists, activePlaylistId: action.activeId };
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
        activePlaylistId: wasActive ? DEFAULT_PLAYLIST.id : state.activePlaylistId,
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
  activePlaylist: PlaylistSource;
  channels: Channel[];
  isLoadingPlaylist: boolean;
  playlistError: string | null;
  searchQuery: string;
  selectedGroup: string | null;
  switchPlaylist: (id: string) => void;
  addPlaylist: (name: string, url: string) => Promise<void>;
  removePlaylist: (id: string) => void;
  setSearchQuery: (q: string) => void;
  setSelectedGroup: (g: string | null) => void;
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
  });

  const switchPlaylistInternal = useCallback(async (source: PlaylistSource) => {
    dispatch({ type: "SWITCH_PLAYLIST_START", id: source.id });
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

  // Hydrate saved playlists / active selection from localStorage once on mount.
  useEffect(() => {
    const playlists = loadStoredPlaylists();
    const activeId = loadActivePlaylistId();
    dispatch({ type: "HYDRATE_PLAYLISTS", playlists, activeId });

    const listParam = searchParams.get("list");
    const targetId = listParam || activeId;
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

  const addPlaylist = useCallback(async (name: string, url: string) => {
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
  }, [router, searchParams]);

  const removePlaylist = useCallback(
    (id: string) => {
      dispatch({ type: "REMOVE_PLAYLIST", id });
      const remaining = loadStoredPlaylists().filter((p) => p.id !== id);
      saveStoredPlaylists(remaining);
      saveActivePlaylistId(DEFAULT_PLAYLIST.id);
    },
    []
  );

  const setSearchQuery = useCallback((query: string) => {
    dispatch({ type: "SET_SEARCH", query });
  }, []);

  const setSelectedGroup = useCallback((group: string | null) => {
    dispatch({ type: "SET_GROUP", group });
  }, []);

  const value = useMemo<AppStateValue>(() => {
    const activePlaylist =
      state.playlists.find((p) => p.id === state.activePlaylistId) || DEFAULT_PLAYLIST;
    return {
      playlists: state.playlists,
      activePlaylistId: state.activePlaylistId,
      activePlaylist,
      channels: state.channelsBySource[state.activePlaylistId] || [],
      isLoadingPlaylist: state.loadingPlaylistId === state.activePlaylistId,
      playlistError: state.playlistError,
      searchQuery: state.searchQuery,
      selectedGroup: state.selectedGroup,
      switchPlaylist,
      addPlaylist,
      removePlaylist,
      setSearchQuery,
      setSelectedGroup,
    };
  }, [state, switchPlaylist, addPlaylist, removePlaylist, setSearchQuery, setSelectedGroup]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
