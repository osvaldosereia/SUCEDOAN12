import assert from 'node:assert/strict';
import fs from 'node:fs';

const fixPath='supabase/sql/20261002_admin_attendance_meta_template_send_fix_v2.sql';
assert.equal(fs.existsSync(fixPath),true,'hotfix PL/pgSQL do enqueue de template deve existir');
const sql=fs.readFileSync(fixPath,'utf8');

assert.match(sql,/create or replace function public\.ops2_admin_attendance_enqueue_template_v1/i);
assert.doesNotMatch(sql,/\br\s+record\s*;/i,'variável genérica r não pode colidir com alias SQL');
assert.match(sql,/\bv_param\s+record\s*;/i);
assert.match(sql,/for\s+v_param\s+in\s+select\s+value\s*,\s*ordinality/i);
assert.match(sql,/select\s+rt\.\*\s+into\s+v_runtime/i,'runtime deve usar alias inequívoco');

console.log('PASS test-attendance-meta-template-plpgsql-v1');
