import assert from 'node:assert/strict';
import fs from 'node:fs';

const polish=fs.readFileSync('vitrine/admin/marketing/marketing-polish.js','utf8');
const strategy=fs.readFileSync('vitrine/admin/marketing/strategy-center.js','utf8');
const templates=fs.readFileSync('vitrine/admin/marketing/template-center.js','utf8');
const audiences=fs.readFileSync('vitrine/admin/marketing/audience-center.js','utf8');
const campaigns=fs.readFileSync('vitrine/admin/marketing/campaign-center.js','utf8');
const entry=fs.readFileSync('vitrine/admin/marketing/campaign-entry.js','utf8');
const all=[polish,strategy,templates,audiences,campaigns,entry].join('\n');

assert.match(polish,/const PRIMARY_MARKETING_VIEWS=\['overview','strategy','templates','campaigns','audiences'\]/,'ordem principal deve ser Visão geral, Estratégia, Templates, Campanhas, Públicos');
assert.match(polish,/overview:\s*'Visão geral'/,'shell deve nomear Visão geral');
assert.match(polish,/strategy:\s*'Estratégia'/,'shell deve nomear Estratégia');
assert.match(polish,/templates:\s*'Templates'/,'shell deve nomear Templates');
assert.match(polish,/campaigns:\s*'Campanhas'/,'shell deve nomear Campanhas');
assert.match(polish,/audiences:\s*'Públicos'/,'shell deve nomear Públicos');
assert.doesNotMatch(polish,/consents:\s*'Consentimentos'/,'Consentimentos não deve permanecer no mapa das abas principais');
assert.match(polish,/PRIMARY_MARKETING_VIEWS\.includes\(view\)/,'shell deve remover views que não fazem parte da navegação principal');
assert.match(polish,/button\.remove\(\)/,'shell deve remover aba secundária criada por submódulos antigos');
assert.match(polish,/data-marketing-admin-consents/,'Consentimentos deve permanecer acessível como ação administrativa secundária');
assert.match(polish,/view==='strategy'[\s\S]{0,500}strategy-center\.js/,'Estratégia deve ser carregada de forma lazy');

assert.match(polish,/setText\(nav\.querySelector\('\.marketing-campaign-gate'\),'Envios desativados'\)/,'status operacional deve ser único e simples');
assert.match(polish,/removeDuplicateMarketingHeads/,'shell deve remover cabeçalhos Marketing duplicados');
assert.match(polish,/removeDuplicateGateBadges/,'shell deve remover badges operacionais duplicados');

for(const forbidden of ['WAMID','UUID','outbox','dispatch']){
  assert.equal(new RegExp(`>${forbidden}<`,'i').test(all),false,`${forbidden} não deve aparecer como texto visível no shell comum`);
}

console.log('marketing papoai-like shell contract: ok');
