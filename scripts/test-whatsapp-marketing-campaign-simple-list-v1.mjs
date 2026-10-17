import assert from 'node:assert/strict';
import fs from 'node:fs';

const modulePath='vitrine/admin/marketing/campaign-list-simple.js';
assert.equal(fs.existsSync(modulePath),true,'campaign-list-simple.js deve existir');
const source=fs.readFileSync(modulePath,'utf8');
const center=fs.readFileSync('vitrine/admin/marketing/campaign-center.js','utf8');
const entry=fs.readFileSync('vitrine/admin/marketing/campaign-entry.js','utf8');
const screen=source+'\n'+center;

assert.ok(screen.includes('Campanhas'),'tela deve manter o título Campanhas');
for(const text of ['Pesquisar','Situação','Canal','Nome','Data de disparo','Destinatários','Status','Ações','Relatório','Abrir'])assert.ok(source.includes(text),`lista simples deve conter ${text}`);
assert.match(source,/admin-marketing-campaigns-v1/,'lista deve usar API Admin canônica');
assert.match(source,/attendanceAuthorizedFetch/,'lista deve usar autenticação Admin');
assert.match(source,/attendanceJsonApi\(['"]accounts['"]/,'lista deve resolver canais pela fonte autenticada');
assert.match(source,/data-simple-campaign-search/,'deve existir busca por nome');
assert.match(source,/data-simple-campaign-status/,'deve existir filtro por situação');
assert.match(source,/data-simple-campaign-channel/,'deve existir filtro por canal');
assert.match(source,/data-campaign-report/,'cada linha deve reservar ação de relatório');
for(const jargon of ['snapshot','dispatch','WAMID','UUID'])assert.equal(new RegExp(`>[^<]*\\b${jargon}\\b[^<]*<`,'i').test(source),false,`${jargon} não deve aparecer como texto visível na lista`);
assert.doesNotMatch(source,/graph\.facebook\.com/,'browser não deve chamar Meta Graph');
assert.match(entry,/campaign-list-simple\.js/,'bootstrap deve carregar lista simples');
console.log('marketing campaign simple list contract: ok');
