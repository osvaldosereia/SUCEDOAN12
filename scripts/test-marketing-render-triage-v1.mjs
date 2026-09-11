import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const base=read('supabase/migrations/20260911044000_marketing_render_triage_v16.sql');
const hard=read('supabase/migrations/20260911044100_marketing_render_triage_v16_hardening.sql');
const priv=read('supabase/migrations/20260911044200_marketing_render_triage_v16_privilege_hardening.sql');
const edge=read('supabase/functions/admin-marketing-render-triage-v1/index.ts');
const ui=read('admin-v3/marketing-render-observability-v1.js');
const config=read('supabase/config.toml');
const must=(cond,msg)=>{if(!cond)throw new Error(msg)};
const all=base+'\n'+hard+'\n'+priv;

for(const gate of ['render_triage_enabled boolean not null default false','render_requeue_enabled boolean not null default false','render_triage_kill_switch boolean not null default true'])must(base.includes(gate),`V16 precisa nascer segura: ${gate}`);
must(base.includes('marketing_render_triage_requests'),'V16 precisa persistir solicitações de triagem');
must(base.includes("status in ('pending_review','approved')"),'V16 deve impedir duas triagens abertas para o mesmo job');
must(base.includes('enable row level security'),'Tabela de triagem precisa de RLS');
must(base.includes('revoke all on table public.marketing_render_triage_requests from public,anon,authenticated'),'Tabela de triagem deve ser server-only');
must(priv.includes('revoke delete on table public.marketing_render_triage_requests from service_role'),'service_role não pode apagar auditoria de triagem');
must(priv.includes('guard_marketing_render_triage_request_v1'),'Triagem precisa de trigger de imutabilidade');
for(const guard of ['marketing_render_triage_delete_forbidden','marketing_render_triage_identity_immutable','invalid_triage_status_transition','terminal_triage_status_immutable'])must(priv.includes(guard),`Guard deve proteger ${guard}`);
for(const fn of ['preview_marketing_render_requeue_v1','request_marketing_render_requeue_v1','approve_marketing_render_requeue_v1','execute_marketing_render_requeue_v1','marketing_render_requeue_eligibility_v1'])must(all.includes(fn),`Contrato precisa de ${fn}`);
for(const block of ['active_lease','terminal_status','asset_version_mismatch','attempt_limit_reached','job_not_stuck_or_failed'])must(hard.includes(block),`Elegibilidade deve bloquear ${block}`);
for(const eligible of ['expired_lease','processing_without_lease','queued_over_threshold','failed','review_required'])must(hard.includes(eligible),`Elegibilidade deve reconhecer ${eligible}`);
must(hard.includes("execution_mode not in ('homologation','canary','live')"),'Requeue deve exigir execution_mode explícito');
must(hard.includes('render_requeue_enabled')&&hard.includes('render_triage_kill_switch'),'Requeue deve ter gate e kill switch próprios');
must(hard.includes("v_job.render_kind in ('deterministic_image','economical_video')")&&hard.includes('ai_image_enabled')&&hard.includes('ai_video_enabled'),'Requeue deve respeitar gates do tipo de render');
must(all.includes("'external_side_effect',false"),'Toda resposta/auditoria deve declarar ausência de efeito externo');
for(const fnSig of ['preview_marketing_render_requeue_v1(uuid,integer)','request_marketing_render_requeue_v1(uuid,text,text,uuid,integer)','approve_marketing_render_requeue_v1(uuid,uuid,integer)','execute_marketing_render_requeue_v1(uuid,uuid,integer)'])must(all.includes(`revoke all on function public.${fnSig} from public,anon,authenticated`),`${fnSig} deve ser server-only`);

must(edge.includes('["owner","operator"].includes(admin.role)'),'Edge precisa exigir RBAC de Admin');
must(edge.includes('admin.role!=="owner"'),'Approve/execute devem exigir owner');
for(const action of ['list','preview','request','approve','execute'])must(edge.includes(`action===\"${action}\"`)||edge.includes(`action==="${action}"`)||edge.includes('action==="approve"||action==="execute"'),`Edge precisa tratar ${action}`);
for(const rpc of ['preview_marketing_render_requeue_v1','request_marketing_render_requeue_v1','approve_marketing_render_requeue_v1','execute_marketing_render_requeue_v1'])must(edge.includes(rpc)||edge.includes('const rpc=action==='),`Edge precisa alcançar ${rpc}`);
must(edge.includes('external_side_effect!==false'),'Edge deve falhar fechado para resposta insegura');
must(edge.includes('LIST_STATUSES=["pending_review","approved","blocked"]'),'Listagem deve se limitar aos estados de triagem operacionais');
must(edge.includes('.select("id,job_id,asset_id,reason_code,status,requested_at,reviewed_at,executed_at")'),'Listagem deve usar projeção redigida explícita');
for(const redaction of ['eligibility_snapshot_exposed:false','result_snapshot_exposed:false','idempotency_key_exposed:false','actor_ids_exposed:false','raw_error_exposed:false'])must(edge.includes(redaction),`Listagem deve declarar redaction: ${redaction}`);
for(const forbidden of ['graph.facebook.com','api.pinterest.com','mybusiness.googleapis.com','OPENAI_API_KEY','META_ACCESS_TOKEN','PINTEREST_ACCESS_TOKEN','fetch("https://'])must(!edge.includes(forbidden),`Edge de triagem não pode chamar provider externo: ${forbidden}`);
must(config.includes('[functions.admin-marketing-render-triage-v1]')&&config.includes('verify_jwt = true'),'Edge de triagem deve exigir JWT');

must(ui.includes("triage('list'")&&ui.includes("triage('preview'")&&ui.includes("triage('request'"),'UI deve usar somente list/preview/request');
must(!ui.includes("triage('approve'")&&!ui.includes("triage('execute'"),'UI Renderer não pode expor approve/execute');
must(ui.includes('runtime.triage_enabled===true&&runtime.triage_kill_switch===false'),'Botão de solicitação deve depender do gate e kill switch');
must(ui.includes('eligibility_snapshot_exposed!==false')&&ui.includes('result_snapshot_exposed!==false')&&ui.includes('idempotency_key_exposed!==false')&&ui.includes('actor_ids_exposed!==false'),'UI deve falhar fechado se a redaction for relaxada');
must(ui.includes('Verificar elegibilidade')&&ui.includes('Solicitar triagem'),'UI deve ter preview explícito e solicitação manual');
must(ui.includes('Sem approve/execute nesta tela'),'UI deve deixar claro que execução não é exposta');
for(const forbidden of ['setInterval(()=>load','requestAnimationFrame','graph.facebook.com','api.pinterest.com','mybusiness.googleapis.com','OPENAI_API_KEY'])must(!ui.includes(forbidden),`UI Renderer não pode introduzir polling/provider: ${forbidden}`);

console.log('marketing render triage v1: ok');