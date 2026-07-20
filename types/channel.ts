export interface Channel {
  id: string;
  name: string;
  logoUrl: string | null;
  group: string;
  streamUrl: string;
  tvgId: string | null;
  // Some origins require the request to carry a specific Referer header
  // (anti-hotlinking) -- browsers won't let JS set that on a direct
  // request, so a channel with this set must be played through our proxy.
  referrer: string | null;
}

export interface ChannelGroup {
  name: string;
  count: number;
}
