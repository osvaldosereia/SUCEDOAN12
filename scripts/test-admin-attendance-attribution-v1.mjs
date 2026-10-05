import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath = new URL('../supabase/migrations/20261005173000_meta_whatsapp_referral_attribution_v1.sql', import.meta.url);
const uiPath = new URL('../vitrine/admin/atendimento/attendance-app.js', import.meta.url);
assert.ok(fs.existsSync(migrationPath), 'migration deve expor a atribuição no contexto seguro');
const migration = fs.readFileSync(migrationPath, 'utf8');
const ui = fs.readFileSync(uiPath, 'utf8');

for (const field of ['source','referral','service_window_expires_at','free_entry_window_expires_at']) {
  assert.match(migration, new RegExp(`'${field}'\\s*,\\s*v_conversation\\.${field}`, 'i'), `RPC deve devolver ${field}`);
}
assert.match(migration, /revoke all on function public\.ops2_admin_attendance_context_v1\(uuid\) from public, anon, authenticated[\s\S]*grant execute on function public\.ops2_admin_attendance_context_v1\(uuid\) to service_role/i);

assert.match(ui, /Origem do contato/);
assert.match(ui, /Origem não identificada/);
assert.match(ui, /Janela gratuita não confirmada/);
assert.match(ui, /free_entry_window_expires_at/);
assert.match(ui, /service_window_expires_at/);
assert.match(ui, /textContent\s*=/, 'atribuição deve ser renderizada com texto escapado pelo DOM');
assert.doesNotMatch(ui, /source\s*===?\s*['"]meta_ad['"][\s\S]{0,160}72\s*h/i, 'meta_ad sozinho não pode confirmar janela gratuita');
assert.match(ui, /renderAttribution\(box\)/, 'cartão deve aparecer na visão geral da conversa');
const attributionRenderer = ui.split('function renderAttribution')[1]?.split('function renderOverview')[0] || '';
assert.ok(attributionRenderer, 'renderizador do cartão de atribuição deve existir');
assert.doesNotMatch(attributionRenderer, /\b(api|fetch|send|dispatch)\s*\(/i, 'cartão de atribuição não pode chamar envio ou API');

console.log('OK · contexto Admin apresenta origem e janelas sem criar ação de envio.');

