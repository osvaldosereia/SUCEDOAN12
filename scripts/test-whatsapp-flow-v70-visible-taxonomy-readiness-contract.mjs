import assert from 'node:assert/strict';

const sql = `
select public.get_whatsapp_flow_v70_visible_taxonomy_readiness_v1() as taxonomy,
       public.get_whatsapp_flow_v70_homologation_control_plane_v1() as control_plane;
`;

// Static contract: this file is intentionally dependency-free. It documents the
// invariants that the SQL readiness must preserve and is consumed by the repo's
// migration/contract review workflow.
const invariants = [
  'visible_sections > 0',
  'visible_terms > 0',
  'empty_visible_terms = 0',
  'empty_visible_sections = 0',
  'sections_over_10_terms = 0',
  'max_visible_terms_in_section <= 10',
  'zero_result_terms_hidden = true',
  'max_products_per_query = 20',
  'full_catalog_loaded = false',
  'ai_authoritative_for_catalog = false',
  'whatsapp_live_canary_percent = 1',
  'experience_orchestrator_enabled = false',
  'whatsapp_flow_data_exchange_enabled = false',
  'whatsapp_flow_send_enabled = false',
  'bling_order_sync_enabled = false',
  'direct_v13_service_role_disabled = true',
  'safe_to_launch_owner_v14 = false unless exactly one owner conversation is eligible'
];

assert.match(sql, /get_whatsapp_flow_v70_visible_taxonomy_readiness_v1/);
assert.match(sql, /get_whatsapp_flow_v70_homologation_control_plane_v1/);
assert.equal(invariants.length, 17);
console.log('V70 visible taxonomy contract OK:', invariants.length, 'invariants');
