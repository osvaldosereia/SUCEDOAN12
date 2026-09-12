import fs from 'node:fs';

const path = new URL('../supabase/migrations/20260912081500_whatsapp_flow_v61_address_guard_privilege_hardening.sql', import.meta.url);
const sql = fs.readFileSync(path, 'utf8');

const required = [
  'route_whatsapp_active_basket_address_guard_v52',
  'revoke all on function public.route_whatsapp_active_basket_address_guard_v52() from public',
  'revoke all on function public.route_whatsapp_active_basket_address_guard_v52() from anon',
  'revoke all on function public.route_whatsapp_active_basket_address_guard_v52() from authenticated',
  'grant execute on function public.route_whatsapp_active_basket_address_guard_v52() to service_role'
];

for (const token of required) {
  if (!sql.includes(token)) throw new Error(`V61 contract missing: ${token}`);
}

const forbidden = [
  'whatsapp_flow_send_enabled=true',
  'whatsapp_flow_data_exchange_enabled=true',
  'whatsapp_flow_commercial_write_enabled=true',
  'bling_order_sync_enabled=true',
  'grant execute on function public.route_whatsapp_active_basket_address_guard_v52() to anon',
  'grant execute on function public.route_whatsapp_active_basket_address_guard_v52() to authenticated'
];
for (const token of forbidden) {
  if (sql.includes(token)) throw new Error(`V61 contract contains forbidden token: ${token}`);
}

console.log('V61 address guard privilege contract: OK');
