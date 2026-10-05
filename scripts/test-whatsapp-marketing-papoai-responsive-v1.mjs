import assert from 'node:assert/strict';
import fs from 'node:fs';

const polish=fs.readFileSync('vitrine/admin/marketing/marketing-polish.js','utf8');
const css=fs.readFileSync('vitrine/admin/marketing/marketing-polish.css','utf8');
const campaignList=fs.readFileSync('vitrine/admin/marketing/campaign-list-simple.js','utf8');

assert.match(polish,/const OVERVIEW_CARDS=/,'overview deve declarar os quatro cards operacionais');
for(const label of ['Campanhas','Templates','Clientes','Entregas']){
  assert.match(polish,new RegExp(`label:\\s*'${label}'`),`overview deve conter card ${label}`);
}
assert.match(polish,/ensureOverviewNav/,'Visão geral deve garantir a navegação canônica mesmo quando vier do render legado');
assert.match(polish,/ensureOverviewDashboard/,'Visão geral deve montar um painel operacional próprio');
assert.match(polish,/Últimas campanhas/,'overview deve conter bloco de últimas campanhas');
assert.match(polish,/data-marketing-recent-list/,'overview deve reservar uma lista real de campanhas recentes');
assert.match(polish,/loadOverviewRecentCampaigns/,'overview deve carregar campanhas recentes em vez de exibir só um atalho');
assert.match(campaignList,/async function loadRecentCampaigns/,'lista de campanhas deve expor leitura reaproveitável das campanhas recentes');
assert.match(campaignList,/export \{enhanceCampaignList,loadRecentCampaigns\}/,'helper de campanhas recentes deve ser exportado explicitamente');
assert.match(polish,/data-marketing-overview-actions/,'overview deve ter ações principais próprias');
assert.match(polish,/Nova campanha/,'overview deve oferecer CTA para nova campanha');
assert.match(polish,/Novo template/,'overview deve oferecer CTA para novo template');
assert.match(polish,/Radar de Marketing|marketing-section/,'polish deve reconhecer o conteúdo legado para retirá-lo do primeiro nível');

assert.match(css,/\.marketing-overview-kpis\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/,'desktop deve mostrar quatro cards em linha quando houver espaço');
assert.match(css,/\.marketing-overview-actions/,'overview deve estilizar ações principais');
assert.match(css,/\.marketing-overview-recent-list/,'lista recente deve receber acabamento próprio');
assert.match(css,/@media\(max-width:760px\)/,'layout deve ter breakpoint mobile');
assert.match(css,/@media\(max-width:760px\)[\s\S]*\.marketing-overview-kpis\{grid-template-columns:1fr\}/,'cards devem empilhar no mobile');
assert.match(css,/@media\(max-width:760px\)[\s\S]*\.marketing-overview-actions button\{[^}]*min-height:44px/,'CTAs mobile devem manter alvo de toque de 44px');

console.log('marketing papoai-like overview/responsive contract: ok');
