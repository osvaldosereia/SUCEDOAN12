import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration='supabase/migrations/20261005190000_marketing_strategy_attribution_learning_v1.sql';
const triggerMigration='supabase/migrations/20261005191000_marketing_strategy_order_attribution_trigger_v1.sql';
const funnelMigration='supabase/migrations/20261005193000_marketing_strategy_funnel_learning_v1.sql';
assert.equal(fs.existsSync(migration),true,'migration de atribuição/aprendizado deve existir');
assert.equal(fs.existsSync(triggerMigration),true,'migration de fechamento automático no pedido deve existir');
assert.equal(fs.existsSync(funnelMigration),true,'migration de funil comercial e aprendizado deve existir');
const sql=fs.readFileSync(migration,'utf8');
const triggerSql=fs.readFileSync(triggerMigration,'utf8');
const funnelSql=fs.readFileSync(funnelMigration,'utf8');

assert.match(sql,/create\s+table\s+if\s+not\s+exists\s+public\.marketing_tracking_links_v1/i,'deve existir vínculo opaco de tracking');
assert.match(sql,/token_hash/i,'tracking deve persistir somente hash do token');
assert.match(sql,/digest[\s\S]{0,120}sha256/i,'token deve ser protegido por SHA-256');
assert.match(sql,/interval\s+['"]7\s+days['"]/i,'janela inicial de atribuição deve ser 7 dias');
assert.match(sql,/marketing_campaign_dispatches_v1/i,'tracking deve partir do dispatch canônico');
assert.match(sql,/marketing_strategy_offers_v1/i,'tracking deve identificar oferta/card da Estratégia');

for(const fn of [
  'marketing_issue_tracking_links_v1',
  'marketing_resolve_tracking_token_v1',
  'marketing_track_checkout_v1',
  'marketing_attribute_order_v1',
  'marketing_strategy_learnings_v1',
]){
  assert.match(sql,new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`,'i'),`RPC ausente: ${fn}`);
  assert.match(sql,new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}`,'i'),`RPC deve ter grant explícito: ${fn}`);
}

assert.match(sql,/['"]direct['"]/i,'atribuição direta deve existir');
assert.match(sql,/['"]assisted['"]/i,'atribuição assistida deve existir');
assert.match(sql,/order_items/i,'atribuição deve conferir itens reais do pedido');
assert.match(sql,/basket_id/i,'atribuição deve reconhecer Cesta/Kit comprado');
assert.match(sql,/basket_lot_id/i,'atribuição deve preservar lote público quando disponível');
assert.match(sql,/marketing_attribution_events_v1/i,'eventos de atribuição devem usar a tabela canônica já criada');
assert.match(sql,/attributed_revenue|direct_revenue|assisted_revenue/i,'aprendizado deve agregar receita atribuída');
assert.match(sql,/evidence_level/i,'aprendizado deve classificar força da evidência');
assert.match(sql,/completed_strategies/i,'amostra deve informar estratégias concluídas');
assert.doesNotMatch(sql,/campaigns_enabled\s*=\s*true|ana_enabled\s*=\s*true|mode\s*=\s*['"]live['"]/i,'tracking não pode ativar runtime');
assert.doesNotMatch(sql,/graph\.facebook\.com|http_post|net\.http/i,'tracking SQL não pode chamar Meta/HTTP');

assert.match(triggerSql,/marketing_attribute_order_after_write_v1/i,'pedido deve fechar atribuição automaticamente');
assert.match(triggerSql,/after\s+insert\s+or\s+update\s+of\s+customer_id\s*,\s*confirmed_at/i,'trigger deve reagir a criação/vínculo/confirmação do pedido');
assert.match(triggerSql,/marketing_attribute_order_v1\s*\(new\.id\s*,\s*null\s*\)/i,'trigger deve usar a atribuição canônica');
assert.match(triggerSql,/interval\s+['"]7\s+days['"]/i,'fechamento automático deve respeitar 7 dias');
assert.match(triggerSql,/direct_offer_match|v_offer_match/i,'direto deve depender de correspondência com a Cesta/Kit clicada');
assert.match(triggerSql,/v_order\.confirmed_at\s+is\s+null[\s\S]{0,160}order_not_confirmed/i,'RPC de atribuição deve rejeitar pedido pendente mesmo em chamada direta');
assert.match(triggerSql,/new\.confirmed_at\s+is\s+not\s+null/i,'trigger deve tentar atribuição apenas após confirmação');
assert.match(triggerSql,/exception\s+when\s+others[\s\S]{0,120}return\s+new/i,'erro de Marketing jamais pode bloquear o pedido');

for(const fn of ['marketing_strategy_funnel_v1','marketing_strategy_offer_performance_v1','marketing_strategy_learnings_v1']){
  assert.match(funnelSql,new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`,'i'),`RPC de funil/aprendizado ausente: ${fn}`);
  assert.match(funnelSql,new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}`,'i'),`RPC de funil deve ser service-role only: ${fn}`);
}
for(const source of ['marketing_campaign_dispatches_v1','whatsapp_message_status_events_v1','whatsapp_messages_v1','marketing_tracking_links_v1','marketing_attribution_events_v1','orders']){
  assert.ok(funnelSql.includes(source),`funil deve usar fonte canônica: ${source}`);
}
assert.match(funnelSql,/direction\s*=\s*['"]inbound['"]/i,'interação deve usar mensagens inbound canônicas');
assert.match(funnelSql,/interval\s+['"]7\s+days['"]/i,'resposta/atribuição do funil deve respeitar janela inicial de 7 dias');
for(const metric of ['selected','sent','delivered','read','clicked_recipients','checkout_started','responded_recipients','attributed_orders','direct_revenue','assisted_revenue','conversion_rate','response_rate','revenue_per_1000_delivered','avg_hours_to_order']){
  assert.ok(funnelSql.includes(metric),`funil deve expor métrica: ${metric}`);
}
assert.match(funnelSql,/cancelled_at|returned_at/i,'funil deve separar cancelamentos/devoluções de receita válida');
assert.match(funnelSql,/score_signal/i,'desempenho histórico deve produzir sinal explicável para o próximo score');
assert.match(funnelSql,/marketing_strategy_funnel_v1\s*\(/i,'aprendizados devem partir do funil canônico');
assert.doesNotMatch(funnelSql,/insert\s+into\s+public\.marketing_attribution_events_v1[\s\S]{0,100}['"](?:sent|delivered|read)['"]/i,'entrega/leitura não devem ser duplicadas na tabela de atribuição');
assert.doesNotMatch(funnelSql,/campaigns_enabled\s*=\s*true|ana_enabled\s*=\s*true|mode\s*=\s*['"]live['"]/i,'funil não pode ativar runtime');

const publicEdgePath='supabase/functions/marketing-tracking-v1/index.ts';
assert.equal(fs.existsSync(publicEdgePath),true,'Edge pública de tracking deve existir');
const publicEdge=fs.readFileSync(publicEdgePath,'utf8');
assert.match(publicEdge,/marketing_resolve_tracking_token_v1/i,'open deve resolver token no backend');
assert.match(publicEdge,/marketing_track_checkout_v1/i,'checkout deve ser registrável');
assert.match(publicEdge,/fields_not_allowed/i,'endpoint público deve aceitar payload mínimo');
assert.doesNotMatch(publicEdge,/customer_id|phone_e164|primary_whatsapp/i,'endpoint público não deve expor/consultar PII diretamente');

const storefrontTracking=fs.readFileSync('vitrine/basket-carousel.js','utf8');
assert.match(storefrontTracking,/searchParams\.get\(['"]mt['"]\)/i,'vitrine deve capturar parâmetro opaco mt');
assert.match(storefrontTracking,/tracking_token/i,'token deve entrar no marketing_context já existente');
assert.match(storefrontTracking,/marketing-tracking-v1/i,'vitrine deve registrar tracking pela Edge dedicada');
assert.match(storefrontTracking,/track\(['"]open['"]\)/i,'abertura/clique deve ser registrada');
assert.match(storefrontTracking,/track\(['"]checkout['"]\)/i,'início/finalização do checkout deve ser registrado');
assert.match(storefrontTracking,/localStorage/i,'token deve sobreviver à navegação dentro da janela de atribuição');

for(const page of ['index.html','vitrine/index.html']){
  const html=fs.readFileSync(page,'utf8');
  assert.match(html,/\/vitrine\/basket-carousel\.js/i,`${page} deve carregar o coletor comum de tracking`);
}

const worker=fs.readFileSync('supabase/functions/whatsapp-marketing-worker-v1/index.ts','utf8');
assert.match(worker,/tracking_links/i,'worker deve receber links rastreáveis por dispatch/oferta');
assert.match(worker,/strategy_tracked/i,'worker deve distinguir campanha de Estratégia de campanha legada');
assert.match(worker,/card_index/i,'worker deve suportar parâmetro rastreável por card de carrossel');
assert.match(worker,/sub_type\s*:\s*['"]url['"]/i,'worker deve preencher URL dinâmica aprovada no template');
assert.match(worker,/trackingRequired|strategyTracked/i,'injeção em carrossel deve depender de tracking obrigatório da Estratégia');
assert.doesNotMatch(worker,/campaigns_enabled\s*=\s*true|ana_enabled\s*=\s*true/i,'worker de tracking não pode ativar runtime');

const templates=fs.readFileSync('supabase/functions/_shared/marketing-template-strategy-v1.mjs','utf8');
assert.match(templates,/mt=\{\{1\}\}/i,'CTA de carrossel da Estratégia deve ter sufixo dinâmico opaco');
assert.match(templates,/tracking_version/i,'perfil de template deve versionar compatibilidade de tracking');

const learningsEdgePath='supabase/functions/admin-marketing-strategy-learnings-v1/index.ts';
assert.equal(fs.existsSync(learningsEdgePath),true,'Edge Admin de aprendizados deve existir');
const learningsEdge=fs.readFileSync(learningsEdgePath,'utf8');
assert.match(learningsEdge,/db\.auth\.getUser/i,'aprendizados devem exigir sessão Admin');
assert.match(learningsEdge,/from\(["']admin_users["']\)/i,'aprendizados devem exigir admin_users ativo');
assert.match(learningsEdge,/marketing_strategy_learnings_v1/i,'Edge deve usar agregação canônica de atribuição');
const strategyUi=fs.readFileSync('vitrine/admin/marketing/strategy-center.js','utf8');
assert.match(strategyUi,/admin-marketing-strategy-learnings-v1/i,'UI deve carregar aprendizados reais pelo endpoint dedicado');

const strategyApi=fs.readFileSync('supabase/functions/admin-marketing-strategy-v1/index.ts','utf8');
assert.match(strategyApi,/marketing_strategy_offer_performance_v1/i,'próxima estratégia deve consultar desempenho histórico real');
assert.match(strategyApi,/historical_performance/i,'desempenho histórico deve entrar no score determinístico');
assert.match(strategyApi,/score_signal/i,'score deve consumir sinal histórico normalizado');

const config=fs.readFileSync('supabase/config.toml','utf8');
assert.match(config,/\[functions\.marketing-tracking-v1\][\s\S]{0,80}verify_jwt\s*=\s*false/i,'tracking por capability token deve chegar à Edge pública');

const workflow=fs.readFileSync('.github/workflows/marketing-professional-ui-ci.yml','utf8');
assert.ok(workflow.includes('scripts/test-marketing-strategy-attribution-learning-v1.mjs'),'CI deve executar contrato de atribuição/aprendizado');
assert.ok(workflow.includes('supabase/functions/marketing-tracking-v1/**'),'CI deve observar Edge pública de tracking');
assert.ok(workflow.includes('supabase/functions/admin-marketing-strategy-learnings-v1/**'),'CI deve observar Edge Admin de aprendizados');
assert.ok(workflow.includes('vitrine/basket-carousel.js'),'CI deve observar coletor público do token');

console.log('marketing strategy attribution + learning v1 contract: ok');
