import assert from 'node:assert/strict';
import fs from 'node:fs';

const apiPath = new URL('../supabase/functions/admin-whatsapp-ops-v1/index.ts', import.meta.url);
const uiPath = new URL('../vitrine/admin/atendimento/attendance-send.js', import.meta.url);
const api = fs.readFileSync(apiPath, 'utf8');
const ui = fs.readFileSync(uiPath, 'utf8');

assert.match(api, /whatsapp-meta-transport-v1\.mjs/);
assert.match(api, /sendTextViaMeta/);
assert.match(api, /MetaTransportError/);
assert.match(api, /META_WHATSAPP_ACCESS_TOKEN/);
assert.match(api, /META_WHATSAPP_GRAPH_VERSION/);
assert.match(api, /ops2_admin_attendance_enqueue_text_v3/);
assert.match(api, /ops2_admin_attendance_claim_outbox_v3/);
assert.match(api, /ops2_admin_attendance_accept_meta_outbound_v1/);
assert.doesNotMatch(api, /ops2_admin_attendance_enqueue_text_v2/);
assert.doesNotMatch(api, /ops2_admin_attendance_claim_outbox_v2/);
assert.match(api, /claim\.provider\s*===\s*["']meta["']/);
assert.match(api, /claim\.provider\s*===\s*["']papoai["']/);
assert.match(api, /phoneNumberId\s*:\s*claim\.phone_number_id/);
assert.match(api, /toE164\s*:\s*claim\.to_phone_e164/);
assert.match(api, /text\s*:\s*claim\.text/);
assert.match(api, /providerMessageId/);
assert.match(api, /meta_send_uncertain/);
assert.match(api, /meta_transport_not_configured/);
assert.match(api, /select\(["']send_enabled,human_send_enabled,homologated_at,outbound_provider["']\)/);
assert.match(api, /provider\s*===\s*["']meta["']/);
assert.match(api, /human_send_enabled/);
assert.match(api, /homologated_at/);
assert.doesNotMatch(api, /EAA[A-Za-z0-9_-]{30,}/, 'gateway não pode conter token literal');

// O browser autentica somente a sessão administrativa no backend compartilhado.
// Token/endpoint da Meta permanecem exclusivamente server-side.
assert.doesNotMatch(ui, /graph\.facebook\.com/i, 'browser nunca chama Graph diretamente');
assert.doesNotMatch(ui, /META_WHATSAPP_ACCESS_TOKEN/i, 'browser nunca conhece o secret Meta');
assert.doesNotMatch(ui, /EAA[A-Za-z0-9_-]{30,}/, 'browser não pode conter token Meta literal');
assert.match(ui, /attendanceJsonApi/, 'envio deve usar o cliente autenticado compartilhado');
assert.match(ui, /attendance-auth\.js\?v=auth-refresh-v2/, 'envio deve carregar a versão atual do auth compartilhado');
assert.doesNotMatch(ui, /sessionStorage\.getItem|Authorization:\s*`Bearer/, 'módulo de envio não deve gerenciar Bearer diretamente');
assert.match(ui, /currentCapability\.provider|send_capability/);
assert.match(ui, /meta_send_uncertain/);
assert.match(ui, /Meta|meta/i);
assert.doesNotMatch(ui, /PapoAI|papoai|openPapoAiBtn/i, 'interface não deve orientar o uso do PapoAI');
assert.match(ui, /finally[\s\S]{0,120}sending=false/, 'loading deve sempre destravar');

console.log('OK · gateway usa outbox v3/provider switch; UI usa auth Admin compartilhado, permanece sem segredo/Graph Meta e não exibe instruções do PapoAI.');
