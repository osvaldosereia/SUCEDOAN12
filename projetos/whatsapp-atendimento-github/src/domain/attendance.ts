export type AttendanceChannel = "0975" | "1018";
export type AttendanceMode = "ai" | "human" | "human_copilot" | "paused" | string;

export interface AttendanceAccount {
  id: string;
  display_name: string;
  phone_e164: string;
  is_active: boolean;
}

export type AttendanceQueueItem = Record<string, unknown> & {
  conversation_id?: string;
  id?: string;
  mode?: AttendanceMode;
};

export type AttendanceConversationSnapshot = Record<string, unknown> & {
  ok?: boolean;
  conversation?: Record<string, unknown>;
  messages?: Array<Record<string, unknown>>;
  send_capability?: { enabled?: boolean; reason?: string | null };
  service_window?: { open?: boolean; closes_at?: string | null };
};

export interface AnaChannelStatus {
  id: string;
  phone_last4: string;
  name: string;
  ana_enabled: boolean;
  send_enabled: boolean;
  human_send_enabled: boolean;
  homologated_at: string | null;
}

export interface AnaAdminSnapshot {
  ok: boolean;
  role: string;
  channels: AnaChannelStatus[];
}

export function attendanceChannelFromPhone(value: unknown): AttendanceChannel | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.endsWith("0975")) return "0975";
  if (digits.endsWith("1018")) return "1018";
  return null;
}

export function attendanceQueueItems(value: unknown): AttendanceQueueItem[] {
  if (!value || typeof value !== "object") return [];
  const payload = value as Record<string, unknown>;
  const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.queue) ? payload.queue : [];
  return items.filter((item): item is AttendanceQueueItem => Boolean(item && typeof item === "object" && !Array.isArray(item)));
}
