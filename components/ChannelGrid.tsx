"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Channel } from "@/types/channel";
import ChannelCard from "./ChannelCard";
import { checkMany } from "@/lib/channelHealth";

const PAGE_SIZE = 60;
const SCAN_BATCH = 30;

interface ChannelGridProps {
  channels: Channel[];
  activeChannelId: string | null;
  onSelect: (channel: Channel) => void;
  onlyWorking: boolean;
}

// Pagination/scan state resets automatically because the parent remounts
// this component (via a `key` tied to the active playlist/filters/toggle)
// whenever the source channel list changes -- see AppShell.
export default function ChannelGrid({
  channels,
  activeChannelId,
  onSelect,
  onlyWorking,
}: ChannelGridProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Plain "show next page" mode.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // "Only working" mode: scan channels in batches, keep the ones that
  // respond, and reveal them as results come in instead of blocking on the
  // whole list. Cursor/target/working-count live in refs because they're
  // only ever touched from effects and event callbacks, never read during
  // render -- `checkedCount` (state) is the render-safe mirror of the cursor.
  const [workingChannels, setWorkingChannels] = useState<Channel[]>([]);
  const [checking, setChecking] = useState(false);
  const [checkedCount, setCheckedCount] = useState(0);
  const [scanGeneration, setScanGeneration] = useState(0);
  const scanCursorRef = useRef(0);
  const scanTargetRef = useRef(PAGE_SIZE);
  const workingCountRef = useRef(0);

  useEffect(() => {
    if (!onlyWorking) return;
    let cancelled = false;

    async function scan() {
      setChecking(true);
      while (
        !cancelled &&
        scanCursorRef.current < channels.length &&
        workingCountRef.current < scanTargetRef.current
      ) {
        const batch = channels.slice(scanCursorRef.current, scanCursorRef.current + SCAN_BATCH);
        scanCursorRef.current += batch.length;

        await checkMany(
          batch.map((c) => c.streamUrl),
          (streamUrl, ok) => {
            if (cancelled || !ok) return;
            const found = batch.find((c) => c.streamUrl === streamUrl);
            if (!found) return;
            workingCountRef.current += 1;
            setWorkingChannels((prev) => [...prev, found]);
          }
        );

        if (!cancelled) setCheckedCount(scanCursorRef.current);
      }
      if (!cancelled) setChecking(false);
    }

    scan();
    return () => {
      cancelled = true;
    };
  }, [onlyWorking, channels, scanGeneration]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (onlyWorking) {
          scanTargetRef.current += PAGE_SIZE;
          setScanGeneration((g) => g + 1);
        } else {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, channels.length));
        }
      },
      { rootMargin: "600px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [channels.length, onlyWorking]);

  const visible = useMemo(
    () => (onlyWorking ? workingChannels : channels.slice(0, visibleCount)),
    [onlyWorking, workingChannels, channels, visibleCount]
  );

  const scanExhausted = checkedCount >= channels.length;
  const hasMore = onlyWorking ? !scanExhausted || checking : visibleCount < channels.length;

  if (channels.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-20 text-neutral-500">
        No se encontraron canales con esos filtros.
      </div>
    );
  }

  return (
    <div>
      {onlyWorking && (
        <p className="mb-3 text-sm text-neutral-500">
          {checking
            ? `Verificando canales… ${checkedCount}/${channels.length} revisados, ${workingChannels.length} funcionando`
            : `${workingChannels.length} canales funcionando de ${checkedCount} revisados`}
        </p>
      )}

      {visible.length === 0 && checking ? (
        <GridSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {visible.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              active={channel.id === activeChannelId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-6 text-sm text-neutral-500">
          {onlyWorking ? "Buscando más canales que funcionen…" : "Cargando más canales…"}
        </div>
      )}

      {onlyWorking && scanExhausted && !checking && workingChannels.length === 0 && (
        <p className="py-10 text-center text-neutral-500">
          Ninguno de estos canales respondió. Prueba con otra lista u otra categoría.
        </p>
      )}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
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
