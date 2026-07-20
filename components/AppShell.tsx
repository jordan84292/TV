"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppState } from "./AppStateProvider";
import { DEFAULT_PLAYLIST } from "@/lib/playlists";
import type { Channel } from "@/types/channel";
import Sidebar from "./Sidebar";
import ChannelGrid from "./ChannelGrid";
import VideoPlayer from "./VideoPlayer";
import PlaylistSelector from "./PlaylistSelector";

export default function AppShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    channels,
    activePlaylistId,
    searchQuery,
    setSearchQuery,
    selectedGroup,
    setSelectedGroup,
    isLoadingPlaylist,
  } = useAppState();

  // The URL is the single source of truth for the selected channel -- no
  // local state to keep in sync. If it doesn't match a channel in the
  // currently loaded list, `activeChannel` below simply resolves to null.
  const activeChannelId = searchParams.get("channel");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [onlyWorking, setOnlyWorking] = useState(false);

  const activeChannel: Channel | null = useMemo(
    () => channels.find((c) => c.id === activeChannelId) || null,
    [channels, activeChannelId]
  );

  const filteredChannels = useMemo(() => {
    let list = channels;
    if (selectedGroup) list = list.filter((c) => c.group === selectedGroup);
    const q = searchQuery.trim().toLowerCase();
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
    return list;
  }, [channels, selectedGroup, searchQuery]);

  const selectChannel = useCallback(
    (channel: Channel) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("channel", channel.id);
      if (activePlaylistId === DEFAULT_PLAYLIST.id) params.delete("list");
      else params.set("list", activePlaylistId);
      router.push(`/?${params.toString()}`, { scroll: false });
    },
    [router, searchParams, activePlaylistId]
  );

  const pickAnother = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("channel");
    router.push(`/?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-950 px-4 py-2.5">
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          aria-label="Mostrar/ocultar categorías"
          className="rounded-full p-2 text-neutral-300 hover:bg-neutral-800"
        >
          <MenuIcon />
        </button>
        <div className="flex items-center gap-1.5 text-lg font-bold tracking-tight text-white">
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-sm">M3U</span>
          <span>Player</span>
        </div>

        <div className="mx-auto w-full max-w-xl">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar canales…"
            className="w-full rounded-full border border-neutral-700 bg-neutral-900 px-4 py-1.5 text-sm text-white placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
          />
        </div>

        <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={onlyWorking}
            onChange={(e) => setOnlyWorking(e.target.checked)}
            className="h-4 w-4 accent-red-600"
          />
          Solo funcionales
        </label>

        <PlaylistSelector />
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar
          channels={channels}
          selectedGroup={selectedGroup}
          onSelectGroup={setSelectedGroup}
          open={sidebarOpen}
        />

        <main className="flex-1 overflow-y-auto p-4">
          <div className="mx-auto mb-6 max-w-5xl">
            <VideoPlayer channel={activeChannel} onPickAnother={pickAnother} />
          </div>

          {isLoadingPlaylist ? (
            <GridSkeleton />
          ) : (
            <ChannelGrid
              key={`${activePlaylistId}:${selectedGroup ?? "all"}:${searchQuery}:${onlyWorking}`}
              channels={filteredChannels}
              activeChannelId={activeChannelId}
              onSelect={selectChannel}
              onlyWorking={onlyWorking}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 18 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-lg bg-neutral-900">
          <div className="aspect-video animate-pulse bg-neutral-800" />
          <div className="space-y-1 p-2">
            <div className="h-3 w-3/4 animate-pulse rounded bg-neutral-800" />
            <div className="h-2 w-1/2 animate-pulse rounded bg-neutral-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z" />
    </svg>
  );
}
