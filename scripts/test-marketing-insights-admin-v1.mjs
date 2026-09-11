import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const admin=read('admin-v3/marketing-insights-v1.js');
const carousel=read('admin-v3/marketing-carousel-media-v1.js');
const edge=read('supabase/functions/admin-marketing-insights-v1/index.ts');
const renderMetrics=read('supabase/migrations/20260911005000_marketing_render_metrics_v13.sql');
const config=read('supabase/config.toml');
const must=(cond,msg)=>{if(!cond)throw new Error(msg)};

for(const days of ['7','30','90'])must(admin.includes(`data-days="${days}"`),`Admin precisa expor janela ${days} dias`);
must(admin.includes("external_side_effect!==false")&&admin.includes("d.dry_run!==true"),'Admin precisa recusar resposta dry-run insegura');
must(admin.includes("admin-marketing-dry-run-v1"),'Admin precisa usar o validador dry-run dedicado');
must(admin.includes("admin-marketing-media-v1"),'Admin precisa assinar mídia privada antes do preview');
must(admin.includes('deterministic_evidence_only'),'Admin precisa explicar que atribuição usa apenas evidência determinística');
for(const label of ['Cliques atribuídos','Conversas atribuídas','Pedidos atribuídos'])must(admin.includes(label),`Admin precisa exibir ${label}`);
must(!admin.includes('foundation_only'),'Admin não deve manter placeholder antigo de atribuição');

must(edge.includes('[7,30,90].includes(days)'),'Edge deve limitar métricas a 7/30/90 dias');
must(edge.includes('marketing_metrics_read_model_v1'),'Edge deve reutilizar read model server-only');
must(edge.includes('marketing_render_metrics_read_model_v1'),'Edge deve compor métricas server-only do renderer');
must(edge.includes('renderData')&&edge.includes('unsafe_render_metrics'),'Edge deve falhar fechado se o read-model de render não declarar ausência de efeito externo');
must(edge.includes('render_avg_ms')&&edge.includes('render_p95_ms')&&edge.includes('render_success_rate_percent'),'Edge precisa normalizar latência e taxa de sucesso do renderer');
must(edge.includes('attribution_clicks')&&edge.includes('attribution_conversations')&&edge.includes('attribution_orders'),'Edge precisa normalizar métricas determinísticas de atribuição');
must(edge.includes('attribution_recording_enabled'),'Overview precisa expor o subgate de atribuição para observabilidade');
must(edge.includes('["owner","operator"].includes(admin.role)'),'Edge deve exigir RBAC owner/operator');
must(edge.includes('external_side_effect:false'),'Edge deve declarar ausência de efeito externo');
for(const forbidden of ['api.pinterest.com','graph.facebook.com','mybusiness.googleapis.com','OPENAI_API_KEY','META_ACCESS_TOKEN','PINTEREST_ACCESS_TOKEN'])must(!edge.includes(forbidden),`Insights não pode conter provider externo/credencial: ${forbidden}`);
must(config.includes('[functions.admin-marketing-insights-v1]')&&/\[functions\.admin-marketing-insights-v1\]\s*\nverify_jwt = true/.test(config),'Insights precisa de verify_jwt=true');

must(renderMetrics.includes('security invoker'),'Read-model de render deve ser SECURITY INVOKER');
must(renderMetrics.includes('revoke all on function public.marketing_render_metrics_read_model_v1')&&renderMetrics.includes('from public,anon,authenticated'),'Read-model de render deve revogar execução pública');
must(renderMetrics.includes('grant execute on function public.marketing_render_metrics_read_model_v1')&&renderMetrics.includes('to service_role'),'Read-model de render deve ser server-only');
for(const metric of ['avg_queue_wait','p95_queue_wait','avg_render','p95_render','jobs_retried','success_rate_percent'])must(renderMetrics.includes(`'${metric}'`),`Read-model precisa calcular ${metric}`);
must(renderMetrics.includes("'external_side_effect',false"),'Read-model deve declarar ausência de efeito externo');
for(const forbidden of ['http://','https://','net.http','OPENAI','META_ACCESS_TOKEN'])must(!renderMetrics.includes(forbidden),`Migration de métricas não pode chamar provider/rede: ${forbidden}`);

must(carousel.includes('data-f="crop_x"')&&carousel.includes('data-f="crop_y"')&&carousel.includes('data-f="crop_scale"'),'Carrossel precisa expor enquadramento X/Y/escala');
must(carousel.includes('clamp(c.x,0,100,50)')&&carousel.includes('clamp(c.scale,0.5,3,1)'),'Enquadramento precisa ser limitado deterministicamente');
must(carousel.includes("fit:['contain','cover'].includes(c.fit)?c.fit:'contain'"),'Fit precisa aceitar apenas contain/cover');
must(carousel.includes('edit_spec:{...(s.edit_spec||{}),crop:cropOf(s)}'),'Enquadramento precisa persistir no edit_spec versionado');

console.log('marketing insights/admin safety contract: ok');
