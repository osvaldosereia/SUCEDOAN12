import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const main = fs.readFileSync(path.join(root,'supabase/migrations/20260912182226_whatsapp_flow_v72_basket_personalization_integrity_readiness.sql'),'utf8');
const fix = fs.readFileSync(path.join(root,'supabase/migrations/20260912182309_whatsapp_flow_v72_basket_personalization_integrity_readiness_fix.sql'),'utf8');
const sql = `${main}\n${fix}`;

const needles = [
  'get_whatsapp_flow_v72_basket_personalization_integrity_readiness_v1',
  'get_whatsapp_flow_owner_homologation_preflight_v13',
  'queue_and_dispatch_whatsapp_flow_owner_homologation_v16',
  'get_whatsapp_flow_v72_homologation_control_plane_v1',
  "'basket_personalization_contract','basket_personalization_v3'",
  "'component_prices_visible',false",
  "'stock_limits_increases',true",
  "'backend_validation_required',true",
  "array['price','unit_price','line_total','commercial_delta','base_price','remove_unit_delta','add_unit_delta','delta']",
  "revoke execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v15(uuid,text,text) from service_role",
  "'safe_to_launch_owner_v16',safe_v16",
  "'writes_performed',false"
];

for (const needle of needles) {
  if (!sql.includes(needle)) throw new Error(`missing contract fragment: ${needle}`);
}

for (const forbidden of [
  'whatsapp_live_canary_percent=100',
  'whatsapp_flow_data_exchange_enabled=true',
  'whatsapp_flow_send_enabled=true',
  'whatsapp_flow_commercial_write_enabled=true',
  'bling_order_sync_enabled=true'
]) {
  if (sql.includes(forbidden)) throw new Error(`forbidden gate activation found: ${forbidden}`);
}

console.log('PASS v72 basket personalization integrity contract');
