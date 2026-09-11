import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const migration=read('supabase/migrations/20260911024500_marketing_render_diagnostics_v15.sql');
const edge=read('supabase/functions/admin-marketing-insights-v1/index.ts');
const ui=read('admin-v3/marketing-render-observability-v1.js');
const must=(cond,msg)=>{if(!cond)throw new Error(msg)};

must(migration.includes('marketing_render_diagnostics_read_model_v1'),'V15 precisa criar read-model de diagnóstico');
must(migration.includes('security invoker'),'Diagnóstico deve ser SECURITY INVOKER');
must(migration.includes('from public,anon,authenticated')&&migration.includes('to service_role'),'Diagnóstico deve ser server-only');
for(const signal of ['expired_leases','processing_without_lease','queued_over_threshold','recent_failures','potentially_stuck'])must(migration.includes(`'${signal}'`),`Diagnóstico precisa expor ${signal}`);
for(const redaction of ['raw_error_exposed','input_spec_exposed','output_spec_exposed','lease_owner_exposed'])must(migration.includes(`'${redaction}',false`),`Diagnóstico precisa declarar redaction ${redaction}`);
must(!migration.includes("'last_error',"),'Diagnóstico não pode serializar last_error bruto');
must(!migration.includes("'input_spec',"),'Diagnóstico não pode serializar input_spec');
must(!migration.includes("'output_spec',"),'Diagnóstico não pode serializar output_spec');
must(!migration.includes("'lease_owner',"),'Diagnóstico não pode serializar lease_owner');
for(const forbidden of ['http://','https://','net.http','OPENAI','META_ACCESS_TOKEN','PINTEREST_ACCESS_TOKEN'])must(!migration.includes(forbidden),`V15 não pode chamar rede/provider: ${forbidden}`);

must(edge.includes('marketing_render_diagnostics_read_model_v1'),'Edge precisa compor diagnóstico server-only');
must(edge.includes('unsafe_render_diagnostics'),'Edge deve falhar fechado para diagnóstico inseguro');
for(const redaction of ['raw_error_exposed','input_spec_exposed','output_spec_exposed','lease_owner_exposed'])must(edge.includes(`diagnostics?.redaction?.${redaction}!==false`),`Edge deve validar ${redaction}`);
for(const count of ['render_expired_leases','render_processing_without_lease','render_queued_over_threshold'])must(edge.includes(count),`Edge precisa normalizar ${count}`);
must(edge.includes('render_diagnostics:diagnostics'),'Edge precisa retornar diagnóstico separado');
for(const forbidden of ['api.pinterest.com','graph.facebook.com','mybusiness.googleapis.com','OPENAI_API_KEY','META_ACCESS_TOKEN','request_render','publish_job'])must(!edge.includes(forbidden),`Insights/diagnóstico deve ser somente leitura: ${forbidden}`);

must(ui.includes('render_diagnostics'),'Painel Renderer precisa consumir diagnóstico redigido');
must(ui.includes('assertDiagnostics'),'Painel deve validar o contrato antes de renderizar diagnóstico');
for(const redaction of ['raw_error_exposed','input_spec_exposed','output_spec_exposed','lease_owner_exposed'])must(ui.includes(`r.${redaction}!==false`),`Painel deve falhar fechado se ${redaction} mudar`);
for(const signal of ['potentially_stuck','recent_failures','expired_leases','processing_without_lease','queued_over_threshold'])must(ui.includes(signal),`Painel precisa exibir sinal seguro ${signal}`);
for(const label of ['Jobs potencialmente presos','Falhas e revisão recentes','Somente sinais operacionais redigidos'])must(ui.includes(label),`Painel precisa comunicar ${label}`);
for(const forbidden of ['v.last_error','v.input_spec','v.output_spec','v.lease_owner','[\'last_error\']','[\'input_spec\']','[\'output_spec\']','[\'lease_owner\']','request_render','retry_render','publish_job','setInterval(()=>load','graph.facebook.com','api.pinterest.com','mybusiness.googleapis.com'])must(!ui.includes(forbidden),`Painel de diagnóstico não pode expor/acionar ${forbidden}`);
must(ui.includes("slice(0,8)"),'Painel deve abreviar IDs operacionais');
must(ui.includes("data-mro-days=\"7\"")&&ui.includes("data-mro-days=\"30\"")&&ui.includes("data-mro-days=\"90\""),'Painel deve manter janelas manuais 7/30/90 dias');

console.log('marketing render diagnostics v1: ok');