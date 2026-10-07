import assert from 'node:assert/strict';
import fs from 'node:fs';

const endpoint=fs.readFileSync('supabase/functions/admin-whatsapp-ana-preview-v1/index.ts','utf8');
const historyStart=endpoint.indexOf('if(action==="admin_history")');
const historyEnd=endpoint.indexOf('const runtime=',historyStart);
assert.ok(historyStart>=0&&historyEnd>historyStart,'admin_history block must exist');
const history=endpoint.slice(historyStart,historyEnd);

assert.match(history,/select\("status,decision,reason,created_at,metadata"\)/,'metrics query must use a privacy-minimized field set');
assert.match(history,/eq\("dry_run",false\)/);
assert.match(history,/gte\("created_at",since\)/);
assert.match(history,/limit\(1000\)/,'metrics query must be bounded');
assert.match(history,/other_or_needs_review/,'free-text reasons must be collapsed to a safe bucket');
assert.match(history,/metadata\?\.trigger_key/,'only automation key metadata may be aggregated');
assert.doesNotMatch(history,/text_body|customer_id|conversation_id|wa_contact_e164|suggestion_text|p_text/,'history metrics must not read message text or customer/conversation identifiers');
assert.match(history,/metrics=\{window_days:7/);

const ui=fs.readFileSync('vitrine/admin/ana/ana-admin.js','utf8');
assert.match(ui,/metrics:null/,'metrics must not load with initial ANA state');
assert.match(ui,/async function loadHistory\(\).*state\.metrics=data\.metrics\|\|null/,'metrics must load only through admin_history');
assert.match(ui,/Carregadas somente quando você clicar em “Atualizar histórico”/);
assert.match(ui,/Resumo operacional sem conteúdo de conversa ou identificação de cliente/);
assert.match(ui,/Automações acionadas/);

console.log('PASS: ANA history metrics are lazy, bounded and privacy-minimized');
