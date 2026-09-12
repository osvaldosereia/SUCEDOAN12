import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20260912151812_whatsapp_flow_v69_visual_product_card_readiness.sql', import.meta.url), 'utf8').toLowerCase();

const required = [
  'get_whatsapp_flow_v69_visual_product_card_readiness_v1',
  'get_whatsapp_flow_owner_homologation_preflight_v10',
  'queue_and_dispatch_whatsapp_flow_owner_homologation_v13',
  'get_whatsapp_flow_v69_homologation_control_plane_v1',
  "'product_cards_checked'",
  "'missing_image_count'",
  "'missing_or_zero_price_count'",
  "'non_https_image_count'",
  "'max_products_per_query',20",
  "'full_catalog_loaded',false",
  "'extras_price_visible',true",
  "'component_prices_visible',false",
  "revoke execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v12(uuid,text,text) from service_role",
  "grant execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v13(uuid,text,text) to service_role",
  "'safe_to_launch_owner_v13',safe_v13",
  "'v13-v69-visual-readiness-runtime-v26-edge49'"
];

for (const token of required) assert.ok(sql.includes(token), `missing contract token: ${token}`);
assert.ok(sql.includes("lower(p->>'image_url') !~ '^https://'"), 'must reject non-HTTPS product images');
assert.ok(sql.includes('v_count>20'), 'must fail closed above 20 products per query');

console.log('V69 visual product card readiness contract OK');
