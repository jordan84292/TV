import type { Channel } from "@/types/channel";
import type { PlaylistSource } from "@/lib/playlists";

const NOISE_PATTERNS = [
  /\(\s*\d{3,4}p\s*\)/gi, // (1080p), (720p)
  /\(\s*(sd|hd|fhd|uhd|4k)\s*\)/gi,
  /\[[^\]]*\]/g, // [Not 24/7], [Geo-blocked], etc.
  /\b(sd|hd|fhd|uhd|4k)\b/gi,
];

// A loose, format-agnostic key used to recognize "the same channel" across
// unrelated lists that name/tag it slightly differently.
export function normalizeChannelName(name: string): string {
  let n = name;
  for (const pattern of NOISE_PATTERNS) n = n.replace(pattern, " ");
  return n
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export interface ChannelSource {
  playlistId: string;
  playlistName: string;
  channel: Channel;
}

// Given the channel the user picked (and the playlist they picked it from),
// finds every other loaded playlist that also carries a channel with the
// same normalized name, ordered: a manual override first (if it has a
// match), then the playlist actually clicked, then the rest.
export function resolveChannelSources(
  selectedChannel: Channel,
  selectedPlaylistId: string,
  playlists: PlaylistSource[],
  channelsBySource: Record<string, Channel[]>,
  overridePlaylistId?: string | null
): ChannelSource[] {
  const key = normalizeChannelName(selectedChannel.name);
  const candidates: ChannelSource[] = [];

  for (const playlist of playlists) {
    const channels = channelsBySource[playlist.id];
    if (!channels) continue;
    const match = channels.find((c) => normalizeChannelName(c.name) === key);
    if (match) {
      candidates.push({ playlistId: playlist.id, playlistName: playlist.name, channel: match });
    }
  }

  candidates.sort((a, b) => rank(a, selectedPlaylistId, overridePlaylistId) - rank(b, selectedPlaylistId, overridePlaylistId));
  return candidates;
}

function rank(candidate: ChannelSource, selectedPlaylistId: string, overridePlaylistId?: string | null): number {
  if (overridePlaylistId && candidate.playlistId === overridePlaylistId) return 0;
  if (candidate.playlistId === selectedPlaylistId) return 1;
  return 2;
}
