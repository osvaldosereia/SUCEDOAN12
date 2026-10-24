import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='vitrine/admin/marketing/campaign-report.js';
assert.equal(fs.existsSync(path),true,'campaign-report.js deve existir');
const source=fs.readFileSync(path,'utf8');
for(const text of ['Relatório da campanha','Enviados','Entregues','Lidos','Falhas','Taxa de entrega','Taxa de leitura','Cliente','Telefone','Status','Atualização'])assert.ok(source.includes(text),`relatório deve mostrar ${text}`);
for(const fn of ['openCampaignReport','loadCampaignReport','renderCampaignReport'])assert.match(source,new RegExp(`function ${fn}\\(`),`${fn} deve existir`);
assert.match(source,/admin-marketing-campaign-report-v1/,'UI deve usar Edge de relatório');
assert.match(source,/marketing:open-campaign-report/,'UI deve responder ao botão Relatório existente');
assert.doesNotMatch(source,/provider_message_id|WAMID|outbox_id/,'UI normal não deve expor IDs técnicos');
assert.doesNotMatch(source,/graph\.facebook\.com/,'browser não deve chamar Graph');
console.log('marketing campaign report UI contract: ok');
