import assert from 'node:assert/strict';
import fs from 'node:fs';

const modulePath='vitrine/admin/marketing/campaign-center.js';
const cssPath='vitrine/admin/marketing/campaign-center.css';
const templatePath='vitrine/admin/marketing/template-center.js';
const audiencePath='vitrine/admin/marketing/audience-center.js';
assert.equal(fs.existsSync(modulePath),true,'módulo de Campanhas deve existir');
assert.equal(fs.existsSync(cssPath),true,'CSS de Campanhas deve existir');
const source=fs.readFileSync(modulePath,'utf8');
const css=fs.readFileSync(cssPath,'utf8');
const template=fs.readFileSync(templatePath,'utf8');
const audience=fs.readFileSync(audiencePath,'utf8');

assert.match(template,/Campanhas/,'navegação Marketing deve incluir Campanhas');
assert.match(template,/import\([^)]*campaign-center\.js/,'Campanhas deve ser lazy-loaded');
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

assert.match(audience,/Criar campanha com este público/,'Públicos deve oferecer handoff para campanha');
assert.match(audience,/collectFilters\s*\(/,'handoff deve reutilizar filtros comerciais atuais');
assert.doesNotMatch(audience,/phone_e164\s*:|to_phone_e164\s*:|destination_phone\s*:/i,'Públicos não pode passar lista de telefones para campanha');

assert.doesNotMatch(source,/\bEnviar campanha\b|\bDisparar\b|\bAgendar agora\b|sendTemplateViaMeta|graph\.facebook\.com|whatsapp_outbox|ops2_whatsapp_outbox|phone_number_id|waba_id/i,'Fase D não pode expor execução/transporte');
assert.match(css,/@media/,'Campanhas deve ser responsivo');
assert.match(css,/marketing-campaign/,'CSS deve pertencer ao módulo de Campanhas');

console.log('PASS test-whatsapp-marketing-campaign-ui-v1');
