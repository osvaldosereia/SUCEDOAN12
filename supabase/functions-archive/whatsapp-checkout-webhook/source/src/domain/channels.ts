export const WHATSAPP_CHANNELS = ["0975", "1018"] as const;
export const WHATSAPP_CHANNEL_PATTERN = WHATSAPP_CHANNELS.join("|");

export type WhatsAppChannel = typeof WHATSAPP_CHANNELS[number];

export function isWhatsAppChannel(value: unknown): value is WhatsAppChannel {
  return typeof value === "string" && WHATSAPP_CHANNELS.includes(value as WhatsAppChannel);
}

export function whatsappChannelFromPhone(value: unknown): WhatsAppChannel | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return WHATSAPP_CHANNELS.find((channel) => digits.endsWith(channel)) ?? null;
}

export function whatsappChannelFromAccountSlug(value: unknown): WhatsAppChannel | null {
  if (typeof value !== "string" || !value.startsWith("dona-antonia-")) return null;
  const suffix = value.slice("dona-antonia-".length);
  return isWhatsAppChannel(suffix) ? suffix : null;
}
