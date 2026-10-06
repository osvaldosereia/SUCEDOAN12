import assert from 'node:assert/strict';
import fs from 'node:fs';

const polish=fs.readFileSync('vitrine/admin/marketing/marketing-polish.js','utf8');
const templates=fs.readFileSync('vitrine/admin/marketing/template-center.js','utf8');
const audiences=fs.readFileSync('vitrine/admin/marketing/audience-center.js','utf8');
const campaigns=fs.readFileSync('vitrine/admin/marketing/campaign-center.js','utf8');
const entry=fs.readFileSync('vitrine/admin/marketing/campaign-entry.js','utf8');
const all=[polish,templates,audiences,campaigns,entry].join('\n');

assert.match(polish,/const PRIMARY_MARKETING_VIEWS=\['templates','campaigns','audiences','consents'\]/,'ordem principal deve ser Templates, Campanhas, Públicos, Consentimentos');
assert.match(polish,/templates:\s*'Templates'/,'shell deve nomear Templates');
assert.match(polish,/campaigns:\s*'Campanhas'/,'shell deve nomear Campanhas');
assert.match(polish,/audiences:\s*'Públicos'/,'shell deve nomear Públicos');
assert.match(polish,/consents:\s*'Consentimentos'/,'shell deve nomear Consentimentos');
assert.doesNotMatch(polish,/overview:\s*'Visão geral'/,'Visão geral não deve permanecer na navegação principal');
assert.doesNotMatch(polish,/strategy:\s*'Estratégia'/,'Estratégia não deve permanecer na navegação principal');
assert.doesNotMatch(polish,/data-marketing-admin-more/,'não deve existir menu Mais para esconder Consentimentos');
assert.match(polish,/PRIMARY_MARKETING_VIEWS\.includes\(view\)/,'shell deve remover views que não fazem parte da navegação principal');
assert.match(polish,/button\.remove\(\)/,'shell deve remover abas antigas criadas por submódulos');
assert.match(polish,/view==='consents'/,'Consentimentos deve abrir o módulo dedicado');
assert.match(polish,/activeView\(root\)[\s\S]{0,120}'templates'/,'Templates deve ser a abertura padrão do Marketing');

assert.match(polish,/setText\((?:gate|nav\.querySelector\('\.marketing-campaign-gate'\)),'Envios desativados'\)/,'status operacional deve ser único e simples');
assert.match(polish,/removeDuplicateMarketingHeads/,'shell deve remover cabeçalhos Marketing duplicados');
assert.match(polish,/removeDuplicateGateBadges/,'shell deve remover badges operacionais duplicados');

for(const forbidden of ['WAMID','UUID','outbox','dispatch']){
  assert.equal(new RegExp(`>${forbidden}<`,'i').test(all),false,`${forbidden} não deve aparecer como texto visível no shell comum`);
}

console.log('marketing simple four-tab shell contract: ok');
