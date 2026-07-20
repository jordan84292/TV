"use client";

import { useMemo } from "react";
import type { Channel } from "@/types/channel";
import { groupChannels } from "@/lib/m3u";
import { translateGroup } from "@/lib/categories";

interface SidebarProps {
  channels: Channel[];
  selectedGroup: string | null;
  onSelectGroup: (group: string | null) => void;
  open: boolean;
}

export default function Sidebar({ channels, selectedGroup, onSelectGroup, open }: SidebarProps) {
  const groups = useMemo(() => groupChannels(channels), [channels]);

  return (
    <aside
      className={`shrink-0 overflow-y-auto border-r border-neutral-800 bg-neutral-950 transition-all duration-200 ${
        open ? "w-56 px-2 py-3" : "w-0 px-0 py-3 overflow-hidden"
      }`}
    >
      <nav className="flex flex-col gap-0.5">
        <SidebarItem
          label="Todos los canales"
          count={channels.length}
          active={selectedGroup === null}
          onClick={() => onSelectGroup(null)}
        />
        {groups.map((g) => (
          <SidebarItem
            key={g.name}
            label={translateGroup(g.name)}
            count={g.count}
            active={selectedGroup === g.name}
            onClick={() => onSelectGroup(g.name)}
          />
        ))}
      </nav>
    </aside>
  );
}

function SidebarItem({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        active ? "bg-neutral-800 font-semibold text-white" : "text-neutral-300 hover:bg-neutral-900"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="ml-2 shrink-0 text-xs text-neutral-500">{count}</span>
    </button>
  );
}
