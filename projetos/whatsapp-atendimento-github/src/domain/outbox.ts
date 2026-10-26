export type OutboxStatus = "pending" | "sent" | "failed" | "cancelled";
export type OutboxProviderStatus = "accepted" | "sent" | "delivered" | "read" | "failed";

export type OutboxMessageType =
  | "basket_menu"
  | "flow_launch"
  | "order_summary"
  | "order_adjustment"
  | "order_cancelled";

export interface OutboxMessageSummary {
  id: string;
  channel: "0975" | "1018";
  messageType: OutboxMessageType;
  status: OutboxStatus;
  availableAt: string;
  createdAt: string;
  sentAt: string | null;
  lastErrorCode: string | null;
  providerStatus: OutboxProviderStatus | null;
  providerStatusAt: string | null;
  providerErrorCode: string | null;
}

export interface OutboxQueueSnapshot {
  messages: OutboxMessageSummary[];
  counts: Record<OutboxStatus, number>;
  senderEnabled: boolean;
  limit: number;
}
