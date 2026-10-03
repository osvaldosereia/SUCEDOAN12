import assert from 'node:assert/strict';
import fs from 'node:fs';

const sqlPath='supabase/sql/20261003_attendance_human_ai_state_v1.sql';
assert.equal(fs.existsSync(sqlPath),true,'migration da Task 10 deve existir');
const sql=fs.readFileSync(sqlPath,'utf8');

assert.match(sql,/create table if not exists public\.attendance_human_ai_audit_v1/i,'deve existir auditoria de estado humano/IA');
assert.match(sql,/ops2_admin_attendance_takeover_v1/i,'deve existir operação explícita de takeover');
assert.match(sql,/set mode='human'[\s\S]*human_required=true[\s\S]*human_takeover_at/i,'takeover deve bloquear IA e registrar instante');
assert.match(sql,/assigned_admin_user_id=v_user/i,'takeover explícito deve atribuir o admin autenticado');
assert.match(sql,/ops2_admin_attendance_resume_ai_v1/i,'deve existir operação explícita para voltar à IA');
assert.match(sql,/set mode='ai'[\s\S]*human_required=false[\s\S]*ai_resume_at=now\(\)/i,'retorno à IA deve ser explícito e auditável');
assert.match(sql,/ops2_attendance_ai_gate_v1/i,'worker futuro deve consultar gate central');
assert.match(sql,/allowed['"],v_conversation\.mode='ai' and v_conversation\.human_required=false/i,'gate só libera IA em modo ai sem exigência humana');
assert.match(sql,/new\.purpose='human_attendance'[\s\S]*set mode='human'/i,'qualquer outbound humano deve tomar controle antes do envio');
assert.match(sql,/new\.purpose='ai_attendance'[\s\S]*old\.status='queued' and new\.status='claimed'/i,'claim da IA deve revalidar o estado para fechar corrida');
assert.match(sql,/raise exception 'ai_blocked_by_human_takeover'/i,'IA deve falhar fechado após takeover');
assert.match(sql,/for update/i,'transições devem serializar a conversa');
assert.match(sql,/auth\.uid\(\)/i,'operações administrativas devem identificar o admin autenticado');
assert.match(sql,/admin_users[\s\S]*is_active=true/i,'takeover/resume devem validar admin ativo');
assert.match(sql,/revoke all on function public\.ops2_attendance_ai_gate_v1\(uuid\) from public,anon,authenticated/i,'gate interno da IA não pode ficar exposto ao browser');

console.log('PASS test-attendance-human-ai-state-v1');
