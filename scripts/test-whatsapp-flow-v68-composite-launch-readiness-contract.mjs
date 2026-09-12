import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20260912141800_whatsapp_flow_v68_composite_launch_readiness.sql', import.meta.url), 'utf8').toLowerCase();

const required = [
  'get_whatsapp_flow_v68_launch_readiness_v1',
  'get_whatsapp_flow_v60_terminal_commercial_readiness_v1',
  'get_whatsapp_flow_v65_payment_rules_readiness_v1',
  'get_whatsapp_flow_v67_terminal_handoff_readiness_v1',
  'get_whatsapp_flow_owner_homologation_preflight_v9',
  'queue_and_dispatch_whatsapp_flow_owner_homologation_v12',
  'get_whatsapp_flow_v68_homologation_control_plane_v1',
  "revoke execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v11(uuid,text,text) from service_role",
  "grant execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v12(uuid,text,text) to service_role",
  "'safe_to_launch_owner_v12', safe_v12",
  "'terminal_commercial_ready'",
  "'payment_rules_ready'",
  "'atomic_terminal_handoff_ready'",
  "'v12-v68-composite-readiness-runtime-v26-edge49'"
];

for (const token of required) assert.ok(sql.includes(token), `missing contract token: ${token}`);
assert.ok(sql.includes("'max_products_per_query'"), 'must retain bounded catalog contract');
assert.ok(sql.includes("'full_catalog_loaded'"), 'must expose full-catalog guard');
assert.ok(sql.includes("'ai_authoritative_for_catalog'"), 'must expose deterministic catalog authority');
assert.ok(sql.includes("'component_prices_visible'"), 'must expose basket component price guard');
assert.ok(sql.includes("'payment_on_delivery_only'"), 'must retain payment-on-delivery contract');

console.log('V68 composite launch readiness contract OK');
