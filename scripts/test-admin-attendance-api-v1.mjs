import assert from 'node:assert/strict';
import fs from 'node:fs';

const domainUrl=new URL('../supabase/functions/_shared/admin-attendance-domain-v1.mjs',import.meta.url);
const apiPath=new URL('../supabase/functions/admin-attendance-v1/index.ts',import.meta.url);
const configPath=new URL('../supabase/config.toml',import.meta.url);

const domain=await import(domainUrl);
const {validUuid,attendanceFilter,serviceWindowState,maskDocument,normalizeProductQuery}=domain;

const good='308660df-72a0-4e23-b3e9-b36d7307bb20';
assert.equal(validUuid(good),good);
assert.equal(validUuid('+5565998150975'),null);
assert.equal(validUuid('not-a-uuid'),null);
assert.equal(attendanceFilter('unread'),'unread');
assert.equal(attendanceFilter('human'),'human');
assert.equal(attendanceFilter('anything'),'all');
assert.equal(serviceWindowState('2026-10-01T10:00:00Z','2026-10-02T09:59:59Z').open,true);
assert.equal(serviceWindowState('2026-10-01T10:00:00Z','2026-10-02T10:00:00Z').open,false);
assert.equal(serviceWindowState(null,'2026-10-01T10:00:00Z').open,false);
assert.equal(maskDocument('12345678901'),'*******8901');
assert.equal(maskDocument('12'),null);
assert.equal(normalizeProductQuery(' a '),null);
assert.equal(normalizeProductQuery(' Omo '),'Omo');

const api=fs.readFileSync(apiPath,'utf8');
assert.match(api,/const\s+READ_ACTIONS\s*=\s*new Set\(\["accounts","queue","conversation","context","products"\]\)/);
assert.match(api,/const\s+SAFE_POST_ACTIONS\s*=\s*new Set\(\["mark_read","follow_up","issue_catalog"\]\)/);
assert.doesNotMatch(api,/send_message|takeover|human_send/i);
assert.match(api,/admin_users/);
assert.match(api,/ops2_admin_attendance_queue_v1/);
assert.match(api,/ops2_admin_attendance_conversation_v1/);
assert.match(api,/ops2_admin_attendance_context_v1/);
assert.match(api,/ops2_issue_papoai_catalog_link_v1/);

const config=fs.readFileSync(configPath,'utf8');
assert.match(config,/\[functions\.admin-attendance-v1\][\s\S]*?verify_jwt\s*=\s*false/);
console.log('OK · gateway read-only da Central de Atendimento está fechado e testável.');
