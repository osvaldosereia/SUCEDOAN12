import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('../vitrine/admin/atendimento/attendance-human-ai.js',import.meta.url),'utf8');
assert.match(s,/ops2_admin_attendance_resume_ai_v1/);
assert.match(s,/ops2_admin_attendance_takeover_v1/);
assert.doesNotMatch(s,/channel\s*!==\s*['"]1018['"]\s*&&\s*rpc\s*===\s*['"]ops2_admin_attendance_resume_ai_v1/);
assert.match(s,/conversation\.mode/);
console.log('PASS attendance AI resume remains available to both 0975 and 1018');
