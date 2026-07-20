"use client";

import { useState } from "react";
import type { Channel } from "@/types/channel";
import { translateGroup } from "@/lib/categories";

interface ChannelCardProps {
  channel: Channel;
  active: boolean;
  onSelect: (channel: Channel) => void;
}

export default function ChannelCard({ channel, active, onSelect }: ChannelCardProps) {
  const [imgState, setImgState] = useState<"loading" | "loaded" | "error">(
    channel.logoUrl ? "loading" : "error"
  );

  return (
    <button
      onClick={() => onSelect(channel)}
      className={`group flex flex-col overflow-hidden rounded-lg border text-left transition-colors ${
        active
          ? "border-red-600 bg-neutral-900"
          : "border-transparent bg-neutral-900/60 hover:bg-neutral-800"
      }`}
    >
      <div className="relative flex aspect-video items-center justify-center bg-neutral-950">
        {imgState === "loading" && channel.logoUrl && (
          <div className="absolute inset-0 animate-pulse bg-neutral-800" />
        )}
        {channel.logoUrl && imgState !== "error" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={channel.logoUrl}
            alt=""
            loading="lazy"
            onLoad={() => setImgState("loaded")}
            onError={() => setImgState("error")}
            className={`h-full w-full object-contain p-3 transition-opacity duration-200 ${
              imgState === "loaded" ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : (
          <span className="px-2 text-center text-xs font-medium text-neutral-500">
            {channel.name}
          </span>
        )}
        {active && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white" /> AL AIRE
          </span>
        )}
      </div>
      <div className="px-2 py-2">
        <p className="truncate text-sm font-medium text-neutral-100">{channel.name}</p>
        <p className="truncate text-xs text-neutral-500">{translateGroup(channel.group)}</p>
      </div>
    </button>
  );
}
