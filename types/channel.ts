export interface Channel {
  id: string;
  name: string;
  logoUrl: string | null;
  group: string;
  streamUrl: string;
}

export interface ChannelGroup {
  name: string;
  count: number;
}
