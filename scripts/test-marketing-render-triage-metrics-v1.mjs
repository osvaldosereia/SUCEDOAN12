import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260911065000_marketing_render_triage_metrics_v18.sql','utf8');
const edge=fs.readFileSync('supabase/functions/admin-marketing-render-triage-v1/index.ts','utf8');
const must=(cond,msg)=>{if(!cond)throw new Error(msg)};

must(migration.includes('marketing_render_triage_metrics_v1'),'V18 deve criar o read model de métricas de triagem');
must(migration.includes('security invoker'),'Read model deve permanecer SECURITY INVOKER');
must(migration.includes('revoke all on function public.marketing_render_triage_metrics_v1() from public,anon,authenticated'),'Read model deve ser server-only');
must(migration.includes('grant execute on function public.marketing_render_triage_metrics_v1() to service_role'),'service_role deve ser o único executor de aplicação');
for(const status of ["status='pending_review'","status='approved'","status='blocked'","status='executed'","status='cancelled'"])must(migration.includes(status),`Métrica deve contar ${status}`);
for(const bucket of ['lt_15m','m15_to_60m','h1_to_6h','h6_to_24h','gt_24h'])must(migration.includes(`'${bucket}'`),`Métrica deve expor bucket ${bucket}`);
for(const field of ['oldest_pending_seconds','oldest_approved_seconds'])must(migration.includes(`'${field}'`),`Métrica deve expor ${field}`);
for(const redaction of ['eligibility_snapshot_exposed','result_snapshot_exposed','idempotency_key_exposed','actor_ids_exposed','raw_error_exposed','job_payload_exposed'])must(migration.includes(`'${redaction}',false`),`Read model deve declarar redaction ${redaction}`);
must(migration.includes("'external_side_effect',false"),'Read model deve declarar ausência de efeito externo');
for(const forbidden of ['update public.marketing_render_jobs','insert into public.marketing_render_jobs','delete from public.marketing_render_jobs','http','net.http','graph.facebook.com','api.pinterest.com','openai'])must(!migration.toLowerCase().includes(forbidden.toLowerCase()),`Read model não pode conter mutação/provider: ${forbidden}`);

must(edge.includes('sb.rpc("marketing_render_triage_metrics_v1")'),'Edge deve consumir o read model V18');
must(edge.includes('unsafe_triage_metrics'),'Edge deve falhar fechada para contrato inseguro');
must(edge.includes('unsafe_triage_metrics_redaction'),'Edge deve falhar fechada para redaction relaxada');
must(edge.includes('job_payload_exposed!==false'),'Edge deve validar redaction de payload');
must(edge.includes('return json({ok:true,items,metrics,runtime:'),'List deve devolver métricas junto da projeção redigida');
for(const forbidden of ['graph.facebook.com','api.pinterest.com','mybusiness.googleapis.com','OPENAI_API_KEY','META_ACCESS_TOKEN','PINTEREST_ACCESS_TOKEN'])must(!edge.includes(forbidden),`Edge não pode chamar provider externo: ${forbidden}`);

console.log('marketing render triage metrics v1: ok');
