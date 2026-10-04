import assert from 'node:assert/strict';
import fs from 'node:fs';

const modulePath='vitrine/admin/marketing/audience-center.js';
const cssPath='vitrine/admin/marketing/audience-center.css';
const templatePath='vitrine/admin/marketing/template-center.js';
const loaderPath='vitrine/admin/basket-lot-image.js';

assert.equal(fs.existsSync(modulePath),true,'módulo de Públicos/Consentimentos deve existir');
assert.equal(fs.existsSync(cssPath),true,'CSS de Públicos/Consentimentos deve existir');
const source=fs.readFileSync(modulePath,'utf8');
const css=fs.readFileSync(cssPath,'utf8');
const template=fs.readFileSync(templatePath,'utf8');
const loader=fs.readFileSync(loaderPath,'utf8');

for(const label of ['Visão geral','Templates Meta','Públicos','Consentimentos','Campanhas desligadas']){
  assert.match(template,new RegExp(label),`navegação de Marketing deve conter ${label}`);
}
assert.match(template,/import\([^)]*audience-center\.js/,'Públicos/Consentimentos devem ser lazy-loaded pelo módulo de Marketing');
assert.doesNotMatch(loader,/import\([^)]*audience-center\.js/,'audience-center.js não pode ser carregado no bootstrap inicial do Admin');
assert.match(source,/audience-center\.css/,'CSS da Fase 2 também deve ser carregado somente quando o módulo abrir');

assert.match(source,/admin-marketing-audiences-v1/,'UI deve usar a Edge autenticada de públicos');
assert.match(source,/attendanceAuthorizedFetch/,'UI deve reutilizar autenticação Admin existente');
assert.match(source,/apiGet\(['"]overview['"]\)/,'abertura deve carregar overview');
assert.match(source,/adminPost\(['"]preview['"],[\s\S]*filters/,'Calcular público deve chamar preview apenas sob ação do operador');
assert.match(source,/form\.addEventListener\(['"]submit['"][\s\S]*adminPost\(['"]preview['"]/,'preview deve ocorrer no submit explícito do formulário');
assert.match(source,/Calcular público/);
assert.match(source,/Encontrados/);
assert.match(source,/Elegíveis/);
assert.match(source,/Excluídos/);

for(const field of ['search','city','neighborhood','label_ids','product_ids','brand','category','last_purchase_after','last_purchase_before','inactive_days','min_order_count','max_order_count','min_lifetime_value','max_lifetime_value']){
  assert.match(source,new RegExp(`(?:name|data-filter)=["']${field}["']`),`controle de filtro ausente: ${field}`);
}
for(const reason of ['no_consent','opted_out','inactive_customer','invalid_phone','duplicate_phone']){
  assert.match(source,new RegExp(reason),`motivo amigável deve ser mapeado: ${reason}`);
}

assert.match(source,/mountAudienceView/);
assert.match(source,/mountConsentView/);
assert.match(source,/consent_history/,'Consentimentos deve carregar histórico sob demanda');
assert.match(source,/record_consent/,'Consentimentos deve registrar decisão pela API canônica');
assert.match(source,/marketing_opt_in|consent_state/,'estado atual deve ficar visível');
assert.match(source,/Última atualização|Histórico/,'detalhe deve mostrar momento/histórico');
assert.match(source,/confirm\s*\(/,'alteração de consentimento deve exigir confirmação explícita');
assert.match(source,/consent_text_version/,'opt-in manual deve exigir versão da evidência');
assert.match(source,/consent_text_snapshot/,'opt-in manual deve exigir texto da evidência');
assert.match(source,/reason_code/,'opt-out manual deve registrar motivo');

assert.match(source,/aria-busy/,'ações assíncronas devem mostrar estado ocupado');
assert.match(source,/\.disabled\s*=/,'botões devem bloquear duplo clique');
assert.match(source,/Calculando|Carregando|Salvando/,'usuário deve ver que a operação está em andamento');
assert.match(css,/@media/,'UI deve ser responsiva');
assert.match(css,/marketing-audience/,'CSS deve pertencer ao módulo de públicos');

assert.doesNotMatch(source,/\bEnviar\b|\bDisparar\b|sendTemplateViaMeta|graph\.facebook\.com|\bwaba_id\b|\bphone_number_id\b|\bto_phone_e164\b|\boutbox\b/i,'módulo de Públicos/Consentimentos não pode ter capacidade de envio');

console.log('PASS test-whatsapp-marketing-audience-ui-v1');
