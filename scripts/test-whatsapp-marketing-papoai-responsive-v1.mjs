import assert from 'node:assert/strict';
import fs from 'node:fs';

const jsPath='vitrine/admin/marketing/marketing-overview-simple.js';
const cssPath='vitrine/admin/marketing/marketing-overview-simple.css';
assert.equal(fs.existsSync(jsPath),true,'marketing-overview-simple.js deve existir');
assert.equal(fs.existsSync(cssPath),true,'marketing-overview-simple.css deve existir');
const source=fs.readFileSync(jsPath,'utf8');
const css=fs.readFileSync(cssPath,'utf8');
const entry=fs.readFileSync('vitrine/admin/marketing/campaign-entry.js','utf8');

for(const fn of ['loadOverviewData','renderOverview','mountSimpleOverview'])assert.match(source,new RegExp(`function ${fn}\\(`),`${fn} deve existir`);
for(const text of ['Campanhas','Templates','Clientes','Entregas','Últimas campanhas','Oportunidades e ferramentas avançadas','Nova campanha','Novo template'])assert.ok(source.includes(text),`overview deve conter ${text}`);
assert.match(source,/admin-marketing-campaigns-v1/,'overview deve ler campanhas');
assert.match(source,/admin-marketing-audiences-v1/,'overview deve ler clientes');
assert.match(source,/admin-whatsapp-templates-v1/,'overview deve ler templates');
assert.match(source,/admin-marketing-campaign-report-v1/,'overview deve calcular entregas a partir do relatório canônico');
assert.match(source,/marketing-grid|marketing-section/,'overview deve recolher conteúdo legado em segundo nível');
assert.doesNotMatch(source,/graph\.facebook\.com|SERVICE_ROLE_KEY|META_WHATSAPP_ACCESS_TOKEN/,'overview não deve acessar backend privilegiado direto');
assert.match(entry,/marketing-overview-simple\.js/,'bootstrap deve carregar overview simples');
assert.match(css,/@media\(max-width:760px\)/,'overview deve ter breakpoint mobile');
assert.match(css,/grid-template-columns:repeat\(4/,'desktop deve ter quatro cards principais');
console.log('marketing PapoAI-like responsive overview contract: ok');
