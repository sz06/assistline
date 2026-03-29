export const CHANNEL_TYPES = [
  "whatsapp",
  "telegram",
  "facebook",
  "instagram",
] as const;

export type ChannelType = (typeof CHANNEL_TYPES)[number];
export type ChannelStatus = "disconnected" | "pairing" | "connected" | "error";

export const CHANNEL_TYPE_OPTIONS: { value: ChannelType; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "facebook", label: "Facebook Messenger" },
  { value: "instagram", label: "Instagram DMs" },
];
