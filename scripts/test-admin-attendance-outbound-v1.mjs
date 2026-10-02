import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as domain from '../supabase/functions/_shared/admin-attendance-domain-v1.mjs';

assert.equal(typeof domain.normalizeOutboundText,'function','helper normalizeOutboundText deve continuar disponível para transporte futuro');
assert.equal(typeof domain.normalizeIdempotencyKey,'function','helper normalizeIdempotencyKey deve continuar disponível para transporte futuro');
assert.deepEqual(domain.normalizeOutboundText('  oi  '),{ok:true,text:'oi'});
assert.equal(domain.normalizeOutboundText('   ').error,'message_empty');
assert.equal(domain.normalizeOutboundText('a'.repeat(4001)).error,'message_too_long');
assert.equal(domain.normalizeIdempotencyKey('attendance-test-123'),'attendance-test-123');

const sql=fs.readFileSync('supabase/sql/20261001_admin_attendance_outbound_v1.sql','utf8');
assert.match(sql,/human_send_not_homologated/i);
assert.match(sql,/human_send_enabled\s*=\s*true/i);
assert.match(sql,/homologated_at\s+is\s+not\s+null/i);
assert.match(sql,/idempotency_conflict/i);

const api=fs.readFileSync('supabase/functions/admin-whatsapp-ops-v1/index.ts','utf8');
assert.doesNotMatch(api,/SAFE_POST_ACTIONS[^\n]*send_text/,'send_text deve ficar fora da superfície ativa');
assert.doesNotMatch(api,/action===['"]send_text['"]/,'gateway não deve tentar enviar enquanto PapoAI não fornecer transporte homologado');

const ui=fs.readFileSync('vitrine/admin/atendimento/index.html','utf8');
const js=fs.readFileSync('vitrine/admin/atendimento/attendance.js','utf8');
assert.match(ui,/id="sendBtn"[^>]*disabled/,'envio automático deve permanecer bloqueado');
assert.match(ui,/id="copyReplyBtn"/,'fallback deve permitir copiar a resposta');
assert.match(ui,/id="openPapoAiBtn"/,'fallback deve permitir abrir o PapoAI');
assert.match(js,/navigator\.clipboard|execCommand\(['"]copy['"]\)/,'cópia deve ter implementação real');
assert.match(js,/https:\/\/app\.papoai\.net\//,'atalho deve apontar apenas para a aplicação oficial do PapoAI');

console.log('OK · outbound humano permanece fechado e a UI oferece fallback manual seguro.');