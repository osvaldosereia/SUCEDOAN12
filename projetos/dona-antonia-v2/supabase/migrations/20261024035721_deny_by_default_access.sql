-- R02 security baseline. RBAC policies are added in R03 after the actor model exists.
-- This schema is deliberately not exposed to anon/authenticated or the Supabase Data API.
alter table da_next.products enable row level security;
alter table da_next.product_types enable row level security;
alter table da_next.product_type_products enable row level security;
alter table da_next.basket_sizes enable row level security;
alter table da_next.basket_size_types enable row level security;
alter table da_next.customers enable row level security;
alter table da_next.customer_addresses enable row level security;
alter table da_next.orders enable row level security;
alter table da_next.order_basket_snapshots enable row level security;
alter table da_next.order_basket_snapshot_types enable row level security;
alter table da_next.order_items enable row level security;
alter table da_next.inventory_reservations enable row level security;
alter table da_next.order_commands enable row level security;
alter table da_next.bling_product_profiles enable row level security;
alter table da_next.product_stock_movements enable row level security;
alter table da_next.order_events enable row level security;
alter table da_next.integration_outbox enable row level security;
alter table da_next.audit_log enable row level security;
alter table da_next.conversations enable row level security;
alter table da_next.conversation_messages enable row level security;
alter table da_next.fiscal_documents enable row level security;

revoke all on schema da_next from public, anon, authenticated;
revoke all on all tables in schema da_next from public, anon, authenticated;
revoke all on all sequences in schema da_next from public, anon, authenticated;
revoke all on all functions in schema da_next from public, anon, authenticated;

grant usage on schema da_next to service_role;
grant all on all tables in schema da_next to service_role;
grant usage, select on all sequences in schema da_next to service_role;
grant execute on all functions in schema da_next to service_role;

alter default privileges in schema da_next
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema da_next
  grant all on tables to service_role;
alter default privileges in schema da_next
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema da_next
  grant usage, select on sequences to service_role;

comment on schema da_next is
  'Private V2 schema. RLS is enabled and access is deny-by-default until R03 provisions backend RBAC.';
