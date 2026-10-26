import type { BlingCommercialTotals } from "./bling";

export type OrderStatus =
  | "received"
  | "packing"
  | "awaiting_invoice"
  | "invoice_authorized"
  | "out_for_delivery"
  | "completed"
  | "attention"
  | "cancelled";

export type PickingStatus = "pending" | "separated" | "missing" | "partial";

export interface OrderListEntry {
  id: string;
  status: OrderStatus;
  totalCents: number;
  basketName: string;
  customerName: string;
  city: string;
  channel: "0975" | "1018";
  itemCount: number;
  revision: number;
  createdAt: string;
}

export interface OrderItemRecord {
  id: number;
  groupId: string;
  productId: string;
  name: string;
  brand: string;
  presentation: string;
  sku: string;
  blingProductId: string;
  quantity: number;
  pickedQuantity: number;
  pickingStatus: PickingStatus;
  replacementProductId: string | null;
  replacementOptions: Array<{ id: string; name: string; brand: string }>;
}

export interface OrderDetailRecord extends OrderListEntry {
  snapshot: Record<string, unknown>;
  items: OrderItemRecord[];
  assignedOperatorId: string | null;
  customerAcceptanceStatus: "not_required" | "pending" | "accepted" | "rejected";
  invoiceStatus: "not_requested" | "pending" | "authorized" | "rejected" | "unknown";
  invoiceId: number | null;
  attentionCode: string | null;
  integrationJob: {
    operation: string;
    status: string;
    errorCode: string | null;
    blockers: string[];
    commercialTotals: BlingCommercialTotals | null;
  } | null;
}

export interface OrderPickingInput {
  revision: number;
  itemId: number;
  pickedQuantity: number;
  replacementProductId?: string;
}
