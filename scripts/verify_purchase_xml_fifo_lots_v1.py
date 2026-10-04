#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
errors = []

def need(text: str, needle: str, label: str):
    if needle not in text:
        errors.append(f"{label}: missing {needle!r}")

def load(path: str) -> str:
    p = ROOT / path
    if not p.exists():
        errors.append(f"missing file: {path}")
        return ""
    return p.read_text(encoding="utf-8")

migration_path = "supabase/migrations/20261004033000_purchase_xml_fifo_lots_v1.sql"
migration = load(migration_path)

for needle in [
    "alter column expiration_date drop not null",
    "lot_expiration_date date",
    "inventory_lot_id uuid",
    "create table if not exists public.vitrine_stock_reservation_lots",
    "alter table public.vitrine_stock_reservation_lots enable row level security",
    "purchase_xml_sync_inventory_lot_v1",
    "activate_purchase_xml_inventory_lots_v1",
    "purchase_xml_activate_inventory_lots_trigger_v1",
    "vitrine_stock_allocate_fifo_v1",
    "vitrine_stock_reservation_lot_sync_v1",
    "fifo-baseline:",
    "purchase-xml-item:",
    "reconcile-vitrine-reservation:",
    "order by coalesce(l.received_at,l.created_at),l.created_at,l.id",
    "create index if not exists purchase_xml_items_inventory_lot_idx",
    "create index if not exists vitrine_stock_reservation_lots_lot_idx",
    "count(*) filter(where e.status='review_required')",
]:
    need(migration.lower(), needle.lower(), migration_path)

activation_fix_path = "supabase/migrations/20261004033500_purchase_xml_fifo_lots_activation_fix_v1.sql"
activation_fix = load(activation_fix_path)
for needle in [
    "set processing_status=processing_status",
    "after insert or update on public.purchase_stock_receipts",
    "perform public.activate_purchase_xml_inventory_lots_v1",
    "where product_id is not null and coalesce(converted_quantity,0)>0",
]:
    need(activation_fix.lower(), needle.lower(), activation_fix_path)

for path in [
    "supabase/functions/purchase-xml-v1/index.ts",
    "supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts",
]:
    text = load(path)
    for needle in [
        "async function purchaseLotState",
        "async function setPurchaseLotExpiration",
        'if(action==="lot_state")',
        'if(action==="set_lot_expiration")',
        "human_action_required",
        "lot_expiration_date",
        "inventory_lot_id",
    ]:
        need(text, needle, path)

admin = load("vitrine/admin/index.html")
for needle in [
    "PURCHASE_XML_FIFO_LOTS_V1",
    "Validade desta entrada (opcional)",
    "data-purchase-lot-expiration",
    "purchaseApi('lot_state'",
    "purchaseApi('set_lot_expiration'",
    "Buscar produto existente",
    "purchaseApi('resolve_item_identity'",
]:
    need(admin, needle, "vitrine/admin/index.html")

if errors:
    print("PURCHASE_XML_FIFO_LOTS_V1: FAIL")
    for err in errors:
        print(" -", err)
    sys.exit(1)

print("PURCHASE_XML_FIFO_LOTS_V1: PASS")
