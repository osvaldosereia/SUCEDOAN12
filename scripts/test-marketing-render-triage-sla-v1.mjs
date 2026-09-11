import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260911114000_marketing_render_triage_sla_v19.sql',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/admin-marketing-render-triage-v1/index.ts',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../admin-v3/marketing-render-observability-v1.js',import.meta.url),'utf8');
const must=(haystack,needle,label=needle)=>{if(!haystack.includes(needle))throw new Error(`missing ${label}`)};
const mustNot=(haystack,needle,label=needle)=>{if(haystack.includes(needle))throw new Error(`forbidden ${label}`)};

must(sql,'marketing_render_triage_sla_v1()');
must(sql,'security invoker');
must(sql,"revoke all on function public.marketing_render_triage_sla_v1() from public,anon,authenticated");
must(sql,"grant execute on function public.marketing_render_triage_sla_v1() to service_role");
must(sql,"interval '1 hour'",'warning threshold');
must(sql,"interval '6 hours'",'critical threshold');
must(sql,"'status',v_status");
must(sql,"'request_ids_exposed',false");
must(sql,"'job_ids_exposed',false");
must(sql,"'actor_ids_exposed',false");
must(sql,"'idempotency_key_exposed',false");
must(sql,"'raw_error_exposed',false");
must(sql,"'job_payload_exposed',false");
must(sql,"'external_side_effect',false");

for(const forbidden of ['http://','https://','openai','graph.facebook','pinterest','googleapis','insert into','update public.marketing_render','delete from public.marketing_render','execute_marketing_render_requeue_v1','request_marketing_render_requeue_v1']) mustNot(sql,forbidden);

must(edge,'sb.rpc("marketing_render_triage_sla_v1")','edge SLA RPC');
must(edge,'triage_sla_failed');
must(edge,'unsafe_triage_sla');
must(edge,'unsafe_triage_sla_redaction');
must(edge,'SLA_STATUSES=["healthy","warning","critical"]');
must(edge,'request_ids_exposed!==false');
must(edge,'job_ids_exposed!==false');
must(edge,'actor_ids_exposed!==false');
must(edge,'idempotency_key_exposed!==false');
must(edge,'raw_error_exposed!==false');
must(edge,'job_payload_exposed!==false');
must(edge,'return json({ok:true,items,metrics,sla,runtime:','SLA included in redacted list response');
for(const forbidden of ['graph.facebook','pinterest.com','googleapis.com','api.openai.com']) mustNot(edge,forbidden);

must(ui,'id="mroTriageSla"','renderer SLA mount');
must(ui,"!['healthy','warning','critical'].includes(s.status)",'browser SLA status allowlist');
must(ui,'s.external_side_effect!==false','browser SLA side-effect guard');
must(ui,'sr.request_ids_exposed!==false','browser request-id redaction guard');
must(ui,'sr.job_ids_exposed!==false','browser job-id redaction guard');
must(ui,'sr.actor_ids_exposed!==false','browser actor-id redaction guard');
must(ui,'sr.idempotency_key_exposed!==false','browser idempotency redaction guard');
must(ui,'sr.raw_error_exposed!==false','browser raw-error redaction guard');
must(ui,'sr.job_payload_exposed!==false','browser payload redaction guard');
must(ui,'num(th.warning)!==3600','browser warning-threshold guard');
must(ui,'num(th.critical)!==21600','browser critical-threshold guard');
must(ui,'function triageSla(d)','renderer SLA view');
must(ui,"root.querySelector('#mroTriageSla').innerHTML=triageSla(d)",'renderer SLA binding');
must(ui,'atenção 1 h · crítico 6 h','operator thresholds');
for(const forbidden of ["triage('approve'","triage('execute'",'data-mro-approve','data-mro-execute','setInterval(loadTriage','setInterval(()=>loadTriage','graph.facebook','pinterest.com','googleapis.com','api.openai.com']) mustNot(ui,forbidden);

console.log('marketing render triage SLA v19 + edge + renderer UI contract: ok');