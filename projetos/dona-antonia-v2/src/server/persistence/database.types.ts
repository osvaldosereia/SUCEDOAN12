/**
 * SQL row contracts for the private da_next schema.
 * These types describe planned persistence; no Supabase adapter is connected in R02.
 */
export type IsoTimestamp = string;
export type JsonObject = Readonly<Record<string, unknown>>;
export type PaymentMethod =
  'PIX' | 'DINHEIRO' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'VALE_ALIMENTACAO' | 'VALE_REFEICAO';
export type OrderStatus = 'NOVO' | 'EM_SEPARACAO' | 'PRONTO' | 'ENTREGUE';
export type OrderItemKind = 'BASKET_COMPONENT' | 'EXTRA';
export type SeparationStatus = 'PENDENTE' | 'SEPARADO' | 'FALTOU';
export type ReservationStatus = 'RESERVADA' | 'CONSUMIDA' | 'LIBERADA' | 'EXPIRADA';

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  gtin: string | null;
  price_cents: number;
  stock_units: number;
  active: boolean;
  photo_url: string | null;
  valid_until: string | null;
  revision: number;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface ProductTypeRow {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  revision: number;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface ProductTypeProductRow {
  product_type_id: string;
  product_id: string;
  sort_order: number;
  created_at: IsoTimestamp;
}

export interface BasketSizeRow {
  id: string;
  code: string;
  name: string;
  active: boolean;
  sort_order: number;
  private_adjustment_cents: number;
  revision: number;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface BasketSizeTypeRow {
  basket_size_id: string;
  product_type_id: string;
  default_quantity: number;
  sort_order: number;
  created_at: IsoTimestamp;
}

export interface CustomerRow {
  id: string;
  display_name: string;
  phone_digits: string;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface CustomerAddressRow {
  id: string;
  customer_id: string;
  label: string;
  recipient_name: string;
  postal_code: string;
  street: string;
  street_number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state_code: string;
  reference_note: string | null;
  is_default: boolean;
  revision: number;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface OrderRow {
  id: string;
  order_number: string;
  customer_id: string | null;
  customer_name_snapshot: string;
  customer_phone_snapshot: string;
  address_snapshot: JsonObject;
  payment_method: PaymentMethod;
  status: OrderStatus;
  payment_status: 'PENDENTE' | 'RECEBIDO' | 'CANCELADO';
  delivery_status: 'AGUARDANDO' | 'CONCLUIDA' | 'PROBLEMA';
  fiscal_status: 'PENDENTE' | 'EMITINDO' | 'EMITIDA' | 'ERRO' | 'CANCELADA';
  subtotal_cents: number;
  delivery_cents: number;
  total_cents: number;
  request_idempotency_key: string;
  request_fingerprint: string;
  version: number;
  assigned_to: string | null;
  cancelled_at: IsoTimestamp | null;
  cancellation_reason: string | null;
  confirmed_at: IsoTimestamp;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface OrderBasketSnapshotRow {
  id: string;
  order_id: string;
  line_number: number;
  basket_size_id: string;
  basket_code_snapshot: string;
  basket_name_snapshot: string;
  quantity: number;
  public_unit_price_cents: number;
  private_adjustment_cents: number;
  line_total_cents: number;
  created_at: IsoTimestamp;
}

export interface OrderBasketSnapshotTypeRow {
  order_basket_snapshot_id: string;
  product_type_id: string;
  type_name_snapshot: string;
  selected_quantity: number;
  created_at: IsoTimestamp;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  order_basket_snapshot_id: string | null;
  line_number: number;
  item_kind: OrderItemKind;
  product_id: string;
  product_type_id: string;
  sku_snapshot: string;
  product_name_snapshot: string;
  product_type_name_snapshot: string;
  quantity: number;
  fulfilled_quantity: number;
  separation_status: SeparationStatus;
  unit_price_cents: number | null;
  line_total_cents: number | null;
  created_at: IsoTimestamp;
}

export interface InventoryReservationRow {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  status: ReservationStatus;
  expires_at: IsoTimestamp;
  created_at: IsoTimestamp;
  resolved_at: IsoTimestamp | null;
}

export interface OrderCommandRow {
  order_id: string;
  command_id: string;
  request_fingerprint: string;
  command_type: 'START' | 'MARK' | 'FINISH' | 'DELIVER' | 'CANCEL';
  actor_id: string | null;
  expected_version: number;
  result_version: number;
  created_at: IsoTimestamp;
}

export interface BlingProductProfileRow {
  sku: string;
  bling_product_id: string | null;
  unit: 'UN';
  origin_code: string | null;
  ncm: string | null;
  cest: string | null;
  packaging_gtin: string | null;
  units_per_case: number | null;
  supplier_name: string | null;
  supplier_code: string | null;
  purchase_cost_cents: number;
  original_import_fields: JsonObject;
  synced_at: IsoTimestamp | null;
  sync_error: string | null;
  revision: number;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface ProductStockMovementRow {
  id: string;
  product_id: string;
  delta_units: number;
  reason: 'IMPORTACAO' | 'AJUSTE_MANUAL' | 'VENDA' | 'DEVOLUCAO' | 'CORRECAO';
  idempotency_key: string;
  reference_order_id: string | null;
  actor_id: string | null;
  note: string | null;
  created_at: IsoTimestamp;
}

export interface OrderEventRow {
  id: string;
  order_id: string;
  version: number;
  event_type: string;
  actor_id: string | null;
  event_data: JsonObject;
  created_at: IsoTimestamp;
}

export interface IntegrationOutboxRow {
  id: string;
  aggregate_type: 'ORDER' | 'PRODUCT' | 'CONVERSATION' | 'FISCAL_DOCUMENT';
  aggregate_id: string;
  aggregate_version: number;
  event_type: string;
  idempotency_key: string;
  payload: JsonObject;
  status: 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDO' | 'ERRO_FINAL';
  attempts: number;
  available_at: IsoTimestamp;
  locked_until: IsoTimestamp | null;
  lock_token: string | null;
  last_error_code: string | null;
  completed_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
}

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  request_id: string | null;
  changed_fields: JsonObject;
  created_at: IsoTimestamp;
}

export interface ConversationRow {
  id: string;
  customer_id: string | null;
  order_id: string | null;
  provider: 'WHATSAPP';
  provider_account: '0975' | '1018';
  external_contact_id: string;
  customer_phone_snapshot: string;
  status: 'ABERTA' | 'PENDENTE' | 'CONCLUIDA';
  assigned_to: string | null;
  version: number;
  last_message_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface ConversationMessageRow {
  id: string;
  conversation_id: string;
  provider_account: '0975' | '1018';
  provider_message_id: string | null;
  direction: 'ENTRADA' | 'SAIDA';
  content_text: string | null;
  media_metadata: readonly JsonObject[];
  delivery_status: 'RECEBIDA' | 'NA_FILA' | 'ENVIADA' | 'ENTREGUE' | 'LIDA' | 'FALHA';
  idempotency_key: string;
  occurred_at: IsoTimestamp;
  created_at: IsoTimestamp;
}

export interface FiscalDocumentRow {
  id: string;
  order_id: string;
  provider: 'BLING';
  provider_document_id: string | null;
  access_key: string | null;
  document_number: string | null;
  series: string | null;
  status: 'PENDENTE' | 'ENVIANDO' | 'EMITIDA' | 'ERRO' | 'CANCELADA';
  idempotency_key: string;
  error_code: string | null;
  issued_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface DaNextRows {
  products: ProductRow;
  product_types: ProductTypeRow;
  product_type_products: ProductTypeProductRow;
  basket_sizes: BasketSizeRow;
  basket_size_types: BasketSizeTypeRow;
  customers: CustomerRow;
  customer_addresses: CustomerAddressRow;
  orders: OrderRow;
  order_basket_snapshots: OrderBasketSnapshotRow;
  order_basket_snapshot_types: OrderBasketSnapshotTypeRow;
  order_items: OrderItemRow;
  inventory_reservations: InventoryReservationRow;
  order_commands: OrderCommandRow;
  bling_product_profiles: BlingProductProfileRow;
  product_stock_movements: ProductStockMovementRow;
  order_events: OrderEventRow;
  integration_outbox: IntegrationOutboxRow;
  audit_log: AuditLogRow;
  conversations: ConversationRow;
  conversation_messages: ConversationMessageRow;
  fiscal_documents: FiscalDocumentRow;
}

export type DaNextTableName = keyof DaNextRows;
export type TableRow<Name extends DaNextTableName> = DaNextRows[Name];
