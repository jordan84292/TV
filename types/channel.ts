export interface Channel {
  id: string;
  name: string;
  logoUrl: string | null;
  group: string;
  streamUrl: string;
  tvgId: string | null;
}

export interface ChannelGroup {
  name: string;
  count: number;
}
