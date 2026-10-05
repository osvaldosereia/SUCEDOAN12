import assert from 'node:assert/strict';
import fs from 'node:fs';

const modulePath='vitrine/admin/marketing/campaign-center.js';
const entryPath='vitrine/admin/marketing/campaign-entry.js';
const cssPath='vitrine/admin/marketing/campaign-center.css';
const loaderPath='vitrine/admin/basket-lot-image.js';
assert.equal(fs.existsSync(modulePath),true,'módulo de Campanhas deve existir');
assert.equal(fs.existsSync(entryPath),true,'entrada leve de Campanhas deve existir');
assert.equal(fs.existsSync(cssPath),true,'CSS de Campanhas deve existir');
const source=fs.readFileSync(modulePath,'utf8');
const entry=fs.readFileSync(entryPath,'utf8');
const css=fs.readFileSync(cssPath,'utf8');
const loader=fs.readFileSync(loaderPath,'utf8');

assert.match(loader,/import\([^)]*campaign-entry\.js/,'bootstrap leve deve carregar a entrada de Campanhas');
assert.doesNotMatch(loader,/import\([^)]*campaign-center\.js/,'módulo pesado de Campanhas não pode carregar no bootstrap inicial');
assert.match(entry,/Campanhas/,'navegação Marketing deve incluir Campanhas');
assert.match(entry,/import\([^)]*campaign-center\.js/,'Campanhas deve ser lazy-loaded no clique');
assert.match(entry,/Criar campanha com este público/,'Públicos deve oferecer handoff para campanha');
assert.match(entry,/collectAudienceFilters\s*\(/,'handoff deve serializar os filtros comerciais atuais');
for(const filter of ['city','neighborhood','brand','category','last_purchase_after','last_purchase_before','inactive_days','min_order_count','max_order_count','min_lifetime_value','max_lifetime_value','label_ids','product_ids']){
  assert.match(entry,new RegExp(filter),`handoff deve preservar filtro: ${filter}`);
}
assert.doesNotMatch(entry,/phone_e164\s*:|to_phone_e164\s*:|destination_phone\s*:/i,'handoff não pode passar lista de telefones para campanha');

assert.match(source,/admin-marketing-campaigns-v1/,'UI deve usar API Admin de campanhas');
assert.match(source,/attendanceAuthorizedFetch/,'UI deve reutilizar autenticação Admin');
assert.match(source,/campaign-center\.css/,'CSS deve ser carregado pelo módulo lazy');

for(const action of ['list','options','create','update_draft','create_snapshot','transition','prepare_internal_test']){
  assert.match(source,new RegExp(`["']${action}["']`),`ação de campanha ausente na UI: ${action}`);
}
for(const label of ['Rascunho','Pronta para revisão','Aprovada','Cancelada']) assert.match(source,new RegExp(label),`estado visível ausente: ${label}`);
for(const label of ['Nome da campanha','Canal','Template','Público','Variáveis','Deep link','Prévia','Resumo']) assert.match(source,new RegExp(label,'i'),`campo/seção ausente: ${label}`);
assert.match(source,/Clientes no público/,'snapshot deve destacar total comercial encontrado');
assert.match(source,/Verificações técnicas/,'elegibilidade deve ficar secundária');
assert.match(source,/snapshot_version|Versão do snapshot/,'UI deve exibir versão do snapshot');
assert.match(source,/campaign_revision|Revisão/,'UI deve exibir revisão da campanha');
assert.match(source,/Gerar snapshot/,'UI deve congelar público por ação explícita');
assert.match(source,/Voltar para rascunho/,'campanha pronta deve exigir retorno explícito para editar');
assert.match(source,/Pronta para revisão/,'ação de revisão deve existir');
assert.match(source,/Preparar teste interno/,'preparação de teste interno deve existir');
assert.match(source,/Nenhuma mensagem será enviada nesta fase/,'teste interno deve deixar claro que não envia');
assert.match(source,/Campanhas desligadas/,'banner de kill-switch deve permanecer visível');
assert.match(source,/confirm\s*\(/,'transição administrativa deve exigir confirmação explícita');
assert.match(source,/aria-busy/,'ações assíncronas devem informar estado ocupado');
assert.match(source,/\.disabled\s*=/,'UI deve bloquear clique duplo');

assert.doesNotMatch(source,/\bEnviar campanha\b|\bDisparar\b|\bAgendar agora\b|sendTemplateViaMeta|graph\.facebook\.com|whatsapp_outbox|ops2_whatsapp_outbox|phone_number_id|waba_id/i,'Fase D não pode expor execução/transporte');
assert.match(css,/@media/,'Campanhas deve ser responsivo');
assert.match(css,/marketing-campaign/,'CSS deve pertencer ao módulo de Campanhas');

console.log('PASS test-whatsapp-marketing-campaign-ui-v1');
