import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync('supabase/migrations/20260910225200_whatsapp_flow_v31_live_session_audit_v1.sql', 'utf8');

assert.match(sql, /get_whatsapp_flow_v31_live_session_audit_v1/);
assert.match(sql, /flow-cestas-comercial-v8-stable/);
assert.match(sql, /whatsapp_flow_exchange_events/);
assert.match(sql, /flow_pending_addons/);
assert.match(sql, /format_whatsapp_flow_session_preview_v2/);
assert.match(sql, /pending_addon_duplicate_free/);
assert.match(sql, /pending_addon_quantities_valid/);
assert.match(sql, /pending_addon_stock_valid/);
assert.match(sql, /SECTION_TERM_DIRECT_SEARCH_OR_FINISH/);
assert.match(sql, /NFM_REPLY_OR_LOCATION/);
assert.match(sql, /pii_returned[^\n]*false/);
assert.match(sql, /writes_executed[^\n]*false/);
assert.match(sql, /revoke all on function public\.get_whatsapp_flow_v31_live_session_audit_v1\(uuid\) from public,anon,authenticated/);
assert.match(sql, /grant execute on function public\.get_whatsapp_flow_v31_live_session_audit_v1\(uuid\) to service_role/);
assert.doesNotMatch(sql, /\binsert\s+into\b/i);
assert.doesNotMatch(sql, /\bupdate\s+public\./i);
assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
assert.doesNotMatch(sql, /customer_name|phone|street|address_summary|locator_value/i);

const requiredScreens = [
  'CESTAS','PERSONALIZAR_A','AJUSTAR_ITEM_A','SECOES_A','TERMOS_A','PRODUTOS_A','PRODUTO_A',
  'SECOES_B','TERMOS_B','PRODUTOS_B','PRODUTO_B','SECOES_C','TERMOS_C','PRODUTOS_C','PRODUTO_C',
  'UPSELL','REVISAO','CLIENTE_EXISTENTE','CLIENTE_NOVO','FINALIZAR'
];
for (const screen of requiredScreens) assert.ok(sql.includes(`'${screen}'`), `missing allowed screen ${screen}`);

console.log('V31 live session audit contract: ok');
