import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/sql/20261003_admin_attendance_unsupported_display_v1.sql';
assert.equal(fs.existsSync(migrationPath),true,'migration do fallback neutro deve existir');
const sql=fs.readFileSync(migrationPath,'utf8');

assert.match(sql,/create or replace function public\.ops2_admin_attendance_conversation_v1/i);
assert.match(sql,/metadata\s*->>\s*'raw_type'/i,'read model deve consultar raw_type sem alterar a tabela');
assert.match(sql,/unsupported/i,'read model deve tratar unsupported explicitamente');
assert.match(sql,/Mensagem recebida, mas o provedor não disponibilizou o conteúdo/i,'texto exibido deve ser neutro ao provedor');
assert.match(sql,/else\s+m\.text_body/i,'mensagens normais devem preservar o texto original');
assert.doesNotMatch(sql,/update\s+public\.whatsapp_messages_v1|delete\s+from\s+public\.whatsapp_messages_v1/i,'hotfix não pode reescrever histórico canônico');

console.log('PASS test-admin-attendance-unsupported-display-v1');
