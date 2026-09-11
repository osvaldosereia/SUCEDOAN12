import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const base=read('supabase/migrations/20260911044000_marketing_render_triage_v16.sql');
const hard=read('supabase/migrations/20260911044100_marketing_render_triage_v16_hardening.sql');
const edge=read('supabase/functions/admin-marketing-render-triage-v1/index.ts');
const config=read('supabase/config.toml');
const must=(cond,msg)=>{if(!cond)throw new Error(msg)};
const all=base+'\n'+hard;

for(const gate of ['render_triage_enabled boolean not null default false','render_requeue_enabled boolean not null default false','render_triage_kill_switch boolean not null default true'])must(base.includes(gate),`V16 precisa nascer segura: ${gate}`);
must(base.includes('marketing_render_triage_requests'),'V16 precisa persistir solicitações de triagem');
must(base.includes("status in ('pending_review','approved')"),'V16 deve impedir duas triagens abertas para o mesmo job');
must(base.includes('enable row level security'),'Tabela de triagem precisa de RLS');
must(base.includes('revoke all on table public.marketing_render_triage_requests from public,anon,authenticated'),'Tabela de triagem deve ser server-only');
for(const fn of ['preview_marketing_render_requeue_v1','request_marketing_render_requeue_v1','approve_marketing_render_requeue_v1','execute_marketing_render_requeue_v1','marketing_render_requeue_eligibility_v1'])must(all.includes(fn),`Contrato precisa de ${fn}`);
for(const block of ['active_lease','terminal_status','asset_version_mismatch','attempt_limit_reached','job_not_stuck_or_failed'])must(hard.includes(block),`Elegibilidade deve bloquear ${block}`);
for(const eligible of ['expired_lease','processing_without_lease','queued_over_threshold','failed','review_required'])must(hard.includes(eligible),`Elegibilidade deve reconhecer ${eligible}`);
must(hard.includes("execution_mode not in ('homologation','canary','live')"),'Requeue deve exigir execution_mode explícito');
must(hard.includes("render_requeue_enabled")&&hard.includes("render_triage_kill_switch"),'Requeue deve ter gate e kill switch próprios');
must(hard.includes("v_job.render_kind in ('deterministic_image','economical_video')")&&hard.includes('ai_image_enabled')&&hard.includes('ai_video_enabled'),'Requeue deve respeitar gates do tipo de render');
must(all.includes("'external_side_effect',false"),'Toda resposta/auditoria deve declarar ausência de efeito externo');
for(const fnSig of ['preview_marketing_render_requeue_v1(uuid,integer)','request_marketing_render_requeue_v1(uuid,text,text,uuid,integer)','approve_marketing_render_requeue_v1(uuid,uuid,integer)','execute_marketing_render_requeue_v1(uuid,uuid,integer)'])must(all.includes(`revoke all on function public.${fnSig} from public,anon,authenticated`),`${fnSig} deve ser server-only`);

must(edge.includes('["owner","operator"].includes(admin.role)'),'Edge precisa exigir RBAC de Admin');
must(edge.includes('admin.role!=="owner"'),'Approve/execute devem exigir owner');
for(const action of ['preview','request','approve','execute'])must(edge.includes(`action===\"${action}\"`)||edge.includes(`action==="${action}"`)||edge.includes(`action===\"approve\"||action===\"execute\"`)||edge.includes(`action==="approve"||action==="execute"`),`Edge precisa tratar ${action}`);
for(const rpc of ['preview_marketing_render_requeue_v1','request_marketing_render_requeue_v1','approve_marketing_render_requeue_v1','execute_marketing_render_requeue_v1'])must(edge.includes(rpc)||edge.includes('const rpc=action==='),`Edge precisa alcançar ${rpc}`);
must(edge.includes('external_side_effect!==false'),'Edge deve falhar fechado para resposta insegura');
for(const forbidden of ['graph.facebook.com','api.pinterest.com','mybusiness.googleapis.com','OPENAI_API_KEY','META_ACCESS_TOKEN','PINTEREST_ACCESS_TOKEN','fetch("https://'])must(!edge.includes(forbidden),`Edge de triagem não pode chamar provider externo: ${forbidden}`);
must(config.includes('[functions.admin-marketing-render-triage-v1]')&&config.includes('verify_jwt = true'),'Edge de triagem deve exigir JWT');

console.log('marketing render triage v1: ok');