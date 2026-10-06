import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration='supabase/migrations/20261005170000_marketing_strategy_campaign_bridge_v1.sql';
assert.equal(fs.existsSync(migration),true,'migration da ponte Estratégia → Campanha deve existir');
const sql=fs.readFileSync(migration,'utf8');

for(const fn of [
  'marketing_strategy_revalidate_commercial_v1',
  'marketing_strategy_materialize_campaign_v1',
  'marketing_strategy_approve_send_v1',
  'marketing_strategy_schedule_send_v1',
]){
  assert.match(sql,new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`,'i'),`RPC ausente: ${fn}`);
  assert.match(sql,new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}`,'i'),`RPC deve ser service-role only: ${fn}`);
}

assert.match(sql,/basket_commercial_catalog_v1/i,'revalidação deve consultar catálogo comercial canônico');
assert.match(sql,/sale_price[^\n]{0,160}75|75[^\n]{0,160}sale_price/i,'revalidação deve manter mínimo de R$ 75');
assert.match(sql,/public_available[^\n]{0,120}>\s*0|public_available[^\n]{0,120}<=\s*0/i,'revalidação deve exigir disponibilidade positiva');
assert.match(sql,/availability_reason[^\n]{0,120}available/i,'revalidação deve exigir availability_reason=available');
assert.match(sql,/public_lot_id/i,'revalidação deve detectar troca material de lote');
assert.match(sql,/sale_price_snapshot/i,'revalidação deve detectar mudança material de preço');
assert.match(sql,/strategy_material_change/i,'mudança material deve bloquear e voltar para revisão');

assert.match(sql,/marketing_create_campaign_v1/i,'ponte deve reutilizar criação canônica de campanha');
assert.match(sql,/marketing_create_campaign_snapshot_v1/i,'ponte deve reutilizar snapshot canônico');
assert.match(sql,/marketing_transition_campaign_v1/i,'ponte deve reutilizar state machine canônica de campanha');
assert.match(sql,/marketing_schedule_campaign_v1/i,'ponte de agendamento deve reutilizar gate/agendamento canônico');
assert.match(sql,/marketing_strategy_transition_v1/i,'ponte deve manter state machine da Estratégia');
assert.match(sql,/ready_for_review/i,'campanha materializada deve ficar em revisão antes do Portão C');
assert.match(sql,/ready_to_send/i,'estratégia materializada deve chegar a Pronta para envio');
assert.match(sql,/send_approved/i,'Portão C deve registrar aprovação separada do disparo');
assert.match(sql,/ready_for_review[\s\S]{0,500}['"]approved['"]|['"]approved['"][\s\S]{0,500}ready_for_review/i,'aprovação do disparo deve aprovar a campanha canônica');
assert.match(sql,/scheduled/i,'agendamento bem-sucedido deve refletir estado scheduled');
assert.match(sql,/strategy_id/i,'campanha e estratégia devem permanecer ligadas');
assert.match(sql,/idempot/i,'materialização deve ser idempotente');
assert.doesNotMatch(sql,/campaigns_enabled\s*=\s*true|mode\s*=\s*['"]live['"]|ana_enabled\s*=\s*true/i,'ponte não pode ativar runtime');
assert.doesNotMatch(sql,/graph\.facebook\.com|http_post|net\.http/i,'ponte SQL não pode chamar Meta/HTTP');

const edgePath='supabase/functions/admin-marketing-strategy-campaign-v1/index.ts';
assert.equal(fs.existsSync(edgePath),true,'Edge Admin dedicada da ponte deve existir');
const edge=fs.readFileSync(edgePath,'utf8');
assert.match(edge,/db\.auth\.getUser\s*\(/,'Edge bridge deve validar sessão Admin');
assert.match(edge,/from\(["']admin_users["']\)/,'Edge bridge deve exigir admin_users ativo');
for(const action of ['materialize_campaign','approve_send','schedule_send','start_send']){
  assert.ok(edge.includes(`"${action}"`)||edge.includes(`'${action}'`),`action ausente na Edge bridge: ${action}`);
}
for(const rpc of ['marketing_strategy_materialize_campaign_v1','marketing_strategy_approve_send_v1','marketing_strategy_schedule_send_v1']){
  assert.match(edge,new RegExp(`rpc\\(["']${rpc}["']`,'i'),`Edge deve delegar à RPC da ponte: ${rpc}`);
}
assert.doesNotMatch(edge,/marketing_materialize_dispatches_v1|marketing_claim_dispatch_batch_v1|sendTemplateViaMeta|graph\.facebook\.com/i,'Edge bridge não pode despachar/chamar Meta diretamente');
assert.doesNotMatch(edge,/campaigns_enabled\s*[:=]\s*true|ana_enabled\s*[:=]\s*true|runtime_mode\s*[:=]\s*["']live["']/i,'Edge bridge não pode ativar runtime');

const uiPath='vitrine/admin/marketing/strategy-center.js';
const ui=fs.readFileSync(uiPath,'utf8');
for(const label of ['Preparar campanha','Aprovar e enviar agora','Aprovar e agendar']) assert.ok(ui.includes(label),`UI deve mostrar ação: ${label}`);
assert.match(ui,/submit_template/,'UI deve permitir concluir Portão B pela Edge de Estratégia');
assert.match(ui,/materialize_campaign/,'UI deve preparar campanha pelo bridge');
assert.match(ui,/approve_send/,'UI deve registrar Portão C antes de agendar/enviar');
assert.match(ui,/schedule_send/,'UI deve delegar agendamento à Edge bridge');
assert.match(ui,/start_send/,'UI deve delegar envio imediato à Edge bridge');
assert.match(ui,/admin-marketing-strategy-campaign-v1/,'UI deve usar Edge bridge dedicada');
assert.doesNotMatch(ui,/graph\.facebook\.com|META_WHATSAPP_ACCESS_TOKEN|service_role/i,'browser não pode conter Graph/token/service-role');

const workflow=fs.readFileSync('.github/workflows/marketing-professional-ui-ci.yml','utf8');
assert.ok(workflow.includes('scripts/test-marketing-strategy-campaign-bridge-v1.mjs'),'CI deve executar contrato da ponte Estratégia → Campanha');
assert.ok(workflow.includes('supabase/functions/admin-marketing-strategy-campaign-v1/**'),'CI deve observar a Edge bridge');
assert.ok(workflow.includes('scripts/test-admin-marketing-campaigns-v1.mjs'),'CI deve manter regressão do backend de campanhas');
assert.ok(workflow.includes('scripts/test-whatsapp-marketing-worker-v1.mjs'),'CI deve manter regressão do worker existente');

console.log('marketing strategy campaign bridge v1 contract: ok');
