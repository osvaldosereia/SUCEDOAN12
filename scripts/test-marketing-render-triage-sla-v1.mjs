import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260911114000_marketing_render_triage_sla_v19.sql',import.meta.url),'utf8');
const must=(needle,label=needle)=>{if(!sql.includes(needle))throw new Error(`missing ${label}`)};
const mustNot=(needle,label=needle)=>{if(sql.includes(needle))throw new Error(`forbidden ${label}`)};

must('marketing_render_triage_sla_v1()');
must('security invoker');
must("revoke all on function public.marketing_render_triage_sla_v1() from public,anon,authenticated");
must("grant execute on function public.marketing_render_triage_sla_v1() to service_role");
must("interval '1 hour'",'warning threshold');
must("interval '6 hours'",'critical threshold');
must("'status',v_status");
must("'request_ids_exposed',false");
must("'job_ids_exposed',false");
must("'actor_ids_exposed',false");
must("'idempotency_key_exposed',false");
must("'raw_error_exposed',false");
must("'job_payload_exposed',false");
must("'external_side_effect',false");

for(const forbidden of ['http://','https://','openai','graph.facebook','pinterest','googleapis','insert into','update public.marketing_render','delete from public.marketing_render','execute_marketing_render_requeue_v1','request_marketing_render_requeue_v1']) mustNot(forbidden);

console.log('marketing render triage SLA v19 contract: ok');
