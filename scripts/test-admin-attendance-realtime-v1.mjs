import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('vitrine/admin/atendimento/index.html','utf8');
const js=fs.readFileSync('vitrine/admin/atendimento/attendance.js','utf8');
const api=fs.readFileSync('supabase/functions/admin-whatsapp-ops-v1/index.ts','utf8');
const sqlPath='supabase/sql/20261001_admin_attendance_marketing_optout_v1.sql';

for(const label of ['Enviar catálogo','Respostas rápidas','Criar orçamento','Nova venda','Marcar retorno','Não receber ofertas']){
  assert.match(html,new RegExp(label),`ferramenta rápida ausente: ${label}`);
}
assert.doesNotMatch(html,/campanha|pipeline|kanban/i,'Atendimento v1 não deve incluir CRM/campanhas');

assert.match(html,/id="messageDraft"(?![^>]*\sdisabled)/,'rascunho deve ser editável mesmo com envio bloqueado');
assert.match(html,/id="sendBtn"[^>]*\sdisabled/,'botão Enviar deve continuar bloqueado');
assert.match(html,/id="quickRepliesMenu"[^>]*hidden/,'respostas rápidas devem abrir em painel discreto');
assert.match(html,/id="followUpPanel"[^>]*hidden/,'retorno deve usar painel discreto');
assert.match(html,/id="optOutBtn"[^>]*disabled/,'opt-out deve nascer bloqueado até haver cliente vinculado');

assert.match(js,/const\s+QUEUE_REFRESH_MS\s*=\s*15000/,'fallback deve atualizar no máximo a cada 15 segundos');
assert.match(js,/document\.addEventListener\(['"]visibilitychange['"]/,'refresh deve reagir à visibilidade da aba');
assert.match(js,/document\.hidden/,'refresh deve pausar quando a aba não está visível');
assert.match(js,/api\(['"]issue_catalog['"]/,'catálogo deve usar o gateway seguro');
assert.match(js,/api\(['"]follow_up['"]/,'lembrete deve usar o estado canônico');
assert.match(js,/api\(['"]marketing_opt_out['"]/,'opt-out deve usar gateway autenticado');
assert.match(js,/QUICK_REPLIES/,'respostas rápidas devem ser configuração pequena no cliente');
assert.match(js,/emitParent\(['"]open_quote['"]/,'orçamento deve reaproveitar ferramenta do Admin');
assert.match(js,/emitParent\(['"]new_sale['"]/,'nova venda deve reaproveitar ferramenta do Admin');
assert.doesNotMatch(js,/supabase\.channel|postgres_changes/i,'Task 4 não deve abrir assinatura direta às tabelas protegidas');

assert.ok(fs.existsSync(sqlPath),'RPC estreita de opt-out deve existir');
const sql=fs.readFileSync(sqlPath,'utf8');
assert.match(sql,/create or replace function public\.ops2_admin_attendance_marketing_optout_v1\s*\(/i);
assert.match(sql,/update\s+public\.customers[\s\S]*marketing_opt_in\s*=\s*false/i);
assert.match(sql,/marketing_consent_updated_at\s*=\s*now\(\)/i);
assert.match(sql,/marketing_repurchase_recalc_v1/i);
assert.match(sql,/revoke all on function public\.ops2_admin_attendance_marketing_optout_v1/i);
assert.match(sql,/grant execute on function public\.ops2_admin_attendance_marketing_optout_v1[^;]*service_role/i);
assert.match(api,/SAFE_POST_ACTIONS[^\n]*marketing_opt_out/);
assert.match(api,/action===['"]marketing_opt_out['"]/);
assert.match(api,/ops2_admin_attendance_marketing_optout_v1/);

console.log('OK · refresh leve e ferramentas operacionais seguras, sem liberar transporte humano.');
