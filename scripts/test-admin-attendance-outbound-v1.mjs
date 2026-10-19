import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as domain from '../supabase/functions/_shared/admin-attendance-domain-v1.mjs';

assert.equal(typeof domain.normalizeOutboundText,'function');
assert.equal(typeof domain.normalizeIdempotencyKey,'function');
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
assert.match(api,/SAFE_POST_ACTIONS=new Set\(\[[^\]]*"send_text"/,'send_text must be explicitly allowlisted');
assert.match(api,/action===["']send_text["']/);
assert.match(api,/ops2_admin_attendance_enqueue_text_v3/,'text must enter the gated canonical outbox');
assert.match(api,/human_send_not_homologated/,'unhomologated transport must fail closed');
assert.match(api,/destination_fields_not_allowed/,'client may not choose the send destination');

const ui=fs.readFileSync('vitrine/admin/atendimento/index.html','utf8');
const js=fs.readFileSync('vitrine/admin/atendimento/attendance-app.js','utf8');
assert.match(ui,/id="sendBtn"[^>]*disabled/,'message sending remains disabled in the current UI');
assert.match(ui,/id="copyReplyBtn"/,'manual copy fallback remains available');
assert.doesNotMatch(ui,/openPapoAiBtn|app\.papoai\.net/i,'attendance UI must not direct operators to PapoAI');
assert.match(js,/navigator\.clipboard\.writeText\(text\)/,'copy fallback must have an implementation');

console.log('Attendance outbound remains fail-closed in UI and gated through the canonical backend outbox.');
