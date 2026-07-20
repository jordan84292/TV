"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
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
  type ContentType,
  type PlaylistSource,
} from "@/lib/playlists";

const OVERRIDE_STORAGE_KEY = "m3u-player:channel-source-override";

interface State {
  playlists: PlaylistSource[];
  section: ContentType;
  activePlaylistId: string | null;
  channelsBySource: Record<string, Channel[]>;
  loadingPlaylistId: string | null;
  playlistError: string | null;
  searchQuery: string;
  selectedGroup: string | null;
}

type Action =
  | { type: "HYDRATE_PLAYLISTS"; playlists: PlaylistSource[] }
  | { type: "SET_SECTION"; section: ContentType; activeId: string | null }
  | { type: "SWITCH_PLAYLIST_START"; id: string }
  | { type: "SWITCH_PLAYLIST_DONE"; id: string; channels: Channel[] }
  | { type: "SWITCH_PLAYLIST_ERROR"; id: string; error: string }
  | { type: "ADD_PLAYLIST"; playlist: PlaylistSource; channels: Channel[] }
  | { type: "REMOVE_PLAYLIST"; id: string; fallbackId: string | null }
  | { type: "SET_SEARCH"; query: string }
  | { type: "SET_GROUP"; group: string | null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "HYDRATE_PLAYLISTS":
      return { ...state, playlists: action.playlists };
    case "SET_SECTION":
      return {
        ...state,
        section: action.section,
        activePlaylistId: action.activeId,
        loadingPlaylistId:
          action.activeId && !state.channelsBySource[action.activeId] ? action.activeId : null,
        playlistError: null,
        selectedGroup: null,
        searchQuery: "",
      };
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
        section: action.playlist.contentType,
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
  section: ContentType;
  setSection: (section: ContentType) => void;

  playlists: PlaylistSource[];
  sectionPlaylists: PlaylistSource[];
  activePlaylistId: string | null;
  activePlaylist: PlaylistSource | null;
  channels: Channel[];
  channelsBySource: Record<string, Channel[]>;
  isLoadingPlaylist: boolean;
  playlistError: string | null;

  searchQuery: string;
  selectedGroup: string | null;

  switchPlaylist: (id: string) => void;
  addPlaylist: (name: string, url: string, contentType: ContentType) => Promise<void>;
  removePlaylist: (id: string) => void;
  setSearchQuery: (q: string) => void;
  setSelectedGroup: (g: string | null) => void;

  channelSourceOverride: Record<string, string>;
  setChannelSourceOverride: (channelKey: string, playlistId: string | null) => void;
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
    section: "tv",
    activePlaylistId: DEFAULT_PLAYLIST.id,
    channelsBySource: { [DEFAULT_PLAYLIST.id]: initialChannels },
    loadingPlaylistId: null,
    playlistError: null,
    searchQuery: "",
    selectedGroup: null,
  });

  const [channelSourceOverride, setChannelSourceOverrideState] = useState<Record<string, string>>(
    loadOverrideCache
  );

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

  // Hydrate saved playlists / active section+list from localStorage/URL once on mount.
  useEffect(() => {
    const playlists = loadStoredPlaylists();
    dispatch({ type: "HYDRATE_PLAYLISTS", playlists });

    const section = (searchParams.get("section") as ContentType) || "tv";
    const listParam = searchParams.get("list");
    const storedActiveId = loadActivePlaylistId(section);
    const targetId = listParam || storedActiveId;
    const target = targetId
      ? playlists.find((p) => p.id === targetId && p.contentType === section)
      : undefined;

    dispatch({
      type: "SET_SECTION",
      section,
      activeId: target ? target.id : section === "tv" ? DEFAULT_PLAYLIST.id : null,
    });

    if (target && target.id !== DEFAULT_PLAYLIST.id) {
      switchPlaylistInternal(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSection = useCallback(
    (section: ContentType) => {
      const storedActiveId = loadActivePlaylistId(section);
      const candidate = state.playlists.find(
        (p) => p.id === storedActiveId && p.contentType === section
      );
      const fallback = state.playlists.find((p) => p.contentType === section) ?? null;
      const target = candidate ?? fallback;

      dispatch({ type: "SET_SECTION", section, activeId: target ? target.id : null });

      const params = new URLSearchParams(searchParams.toString());
      params.delete("channel");
      if (section === "tv") params.delete("section");
      else params.set("section", section);
      if (target && target.id !== DEFAULT_PLAYLIST.id) params.set("list", target.id);
      else params.delete("list");
      router.push(`/?${params.toString()}`, { scroll: false });

      if (target && !state.channelsBySource[target.id]) {
        switchPlaylistInternal(target);
      }
    },
    [state.playlists, state.channelsBySource, searchParams, router, switchPlaylistInternal]
  );

  const switchPlaylist = useCallback(
    (id: string) => {
      const source = state.playlists.find((p) => p.id === id);
      if (!source) return;
      saveActivePlaylistId(source.contentType, id);
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
    async (name: string, url: string, contentType: ContentType) => {
      const trimmedName = name.trim() || url;
      const id = makePlaylistId(trimmedName);
      const source: PlaylistSource = { id, name: trimmedName, url: url.trim(), contentType };
      dispatch({ type: "SWITCH_PLAYLIST_START", id });
      try {
        const channels = await fetchPlaylistChannels(source.url);
        dispatch({ type: "ADD_PLAYLIST", playlist: source, channels });
        const next = [...loadStoredPlaylists().filter((p) => !p.isDefault), source];
        saveStoredPlaylists(next);
        saveActivePlaylistId(contentType, id);
        const params = new URLSearchParams(searchParams.toString());
        params.delete("channel");
        params.set("list", id);
        if (contentType === "tv") params.delete("section");
        else params.set("section", contentType);
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

  const removePlaylist = useCallback(
    (id: string) => {
      const removed = state.playlists.find((p) => p.id === id);
      const section = removed?.contentType ?? state.section;
      const remainingInSection = state.playlists.filter(
        (p) => p.id !== id && p.contentType === section
      );
      const fallback = section === "tv" ? DEFAULT_PLAYLIST : (remainingInSection[0] ?? null);

      dispatch({ type: "REMOVE_PLAYLIST", id, fallbackId: fallback ? fallback.id : null });

      const remaining = loadStoredPlaylists().filter((p) => p.id !== id);
      saveStoredPlaylists(remaining);
      if (fallback) saveActivePlaylistId(section, fallback.id);
    },
    [state.playlists, state.section]
  );

  const setSearchQuery = useCallback((query: string) => {
    dispatch({ type: "SET_SEARCH", query });
  }, []);

  const setSelectedGroup = useCallback((group: string | null) => {
    dispatch({ type: "SET_GROUP", group });
  }, []);

  const setChannelSourceOverride = useCallback((channelKey: string, playlistId: string | null) => {
    setChannelSourceOverrideState((prev) => {
      const next = { ...prev };
      if (playlistId) next[channelKey] = playlistId;
      else delete next[channelKey];
      if (typeof window !== "undefined") {
        window.localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const value = useMemo<AppStateValue>(() => {
    const activePlaylist =
      state.playlists.find((p) => p.id === state.activePlaylistId) ?? null;
    const sectionPlaylists = state.playlists.filter((p) => p.contentType === state.section);
    return {
      section: state.section,
      setSection,
      playlists: state.playlists,
      sectionPlaylists,
      activePlaylistId: state.activePlaylistId,
      activePlaylist,
      channels: state.activePlaylistId ? state.channelsBySource[state.activePlaylistId] || [] : [],
      channelsBySource: state.channelsBySource,
      isLoadingPlaylist: Boolean(state.activePlaylistId) && state.loadingPlaylistId === state.activePlaylistId,
      playlistError: state.playlistError,
      searchQuery: state.searchQuery,
      selectedGroup: state.selectedGroup,
      switchPlaylist,
      addPlaylist,
      removePlaylist,
      setSearchQuery,
      setSelectedGroup,
      channelSourceOverride,
      setChannelSourceOverride,
    };
  }, [
    state,
    setSection,
    switchPlaylist,
    addPlaylist,
    removePlaylist,
    setSearchQuery,
    setSelectedGroup,
    channelSourceOverride,
    setChannelSourceOverride,
  ]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
