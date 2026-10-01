import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as domain from '../supabase/functions/_shared/admin-attendance-domain-v1.mjs';

assert.equal(typeof domain.normalizeOutboundText,'function','helper normalizeOutboundText deve existir');
assert.equal(typeof domain.normalizeIdempotencyKey,'function','helper normalizeIdempotencyKey deve existir');
assert.deepEqual(domain.normalizeOutboundText('  oi  '),{ok:true,text:'oi'});
assert.equal(domain.normalizeOutboundText('   ').error,'message_empty');
assert.equal(domain.normalizeOutboundText('a'.repeat(4001)).error,'message_too_long');
assert.equal(domain.normalizeOutboundText('😀'.repeat(4000)).ok,true,'limite deve contar caracteres Unicode, não bytes');
assert.equal(domain.normalizeOutboundText('😀'.repeat(4001)).error,'message_too_long');
assert.equal(domain.normalizeIdempotencyKey('x'),null);
assert.equal(domain.normalizeIdempotencyKey('attendance-test-123'),'attendance-test-123');

const sql=fs.readFileSync('supabase/sql/20261001_admin_attendance_v1.sql','utf8');
assert.match(sql,/create or replace function public\.ops2_admin_attendance_enqueue_text_v1\s*\(/i);
assert.match(sql,/char_length\s*\(\s*v_text\s*\)\s*>\s*4000/i);
assert.match(sql,/service_window_closed/i);
assert.match(sql,/human_send_not_homologated/i);
assert.match(sql,/human_send_enabled\s*=\s*true/i);
assert.match(sql,/homologated_at\s+is\s+not\s+null/i);
assert.match(sql,/outbound_provider\s*=\s*'papoai'/i);
assert.match(sql,/purpose[^\n]*'human_attendance'/i);
assert.match(sql,/sender_kind[^\n]*'human'/i);
assert.match(sql,/status_current[^\n]*'queued'/i);
assert.match(sql,/status[^\n]*'queued'/i);
assert.match(sql,/created_at\s*>\s*now\(\)\s*-\s*interval\s*'60 seconds'/i);
assert.match(sql,/v_recent_count\s*>=\s*20/i);
assert.match(sql,/pg_advisory_xact_lock/i);
assert.match(sql,/idempotency_conflict/i);

const api=fs.readFileSync('supabase/functions/admin-whatsapp-ops-v1/index.ts','utf8');
assert.match(api,/SAFE_POST_ACTIONS[^\n]*send_text/);
assert.match(api,/action===['"]send_text['"]/);
assert.match(api,/destination_fields_not_allowed/);
assert.match(api,/ops2_admin_attendance_enqueue_text_v1/);
assert.doesNotMatch(api,/body\?\.to_phone_e164\s*[,)]/,'destino nunca pode ser usado como parâmetro de envio');

const ui=fs.readFileSync('vitrine/admin/atendimento/index.html','utf8');
assert.match(ui,/id="sendBtn"[^>]*disabled/,'produção deve manter envio bloqueado antes da homologação');

console.log('OK · outbound humano fica atômico, idempotente e fechado por runtime/24h.');
