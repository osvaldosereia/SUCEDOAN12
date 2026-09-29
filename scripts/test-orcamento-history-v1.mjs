import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const quoteHtml=readFileSync(new URL('../orcamento/index.html', import.meta.url),'utf8');
const adminHtml=readFileSync(new URL('../vitrine/admin/index.html', import.meta.url),'utf8');
const api=readFileSync(new URL('../supabase/functions/admin-products-live-v1/index.ts', import.meta.url),'utf8');

const quoteScript=quoteHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
const adminScript=adminHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
assert.doesNotThrow(()=>new Function(quoteScript),'JavaScript do editor de Orçamentos deve compilar');
assert.doesNotThrow(()=>new Function(adminScript),'JavaScript do Vitrine/Admin deve compilar');

assert.match(adminHtml,/data-tab="quotes"[^>]*>Orçamentos</,'aba Orçamentos deve existir');
assert.match(adminHtml,/\/orcamento\/\?embedded=1/,'Admin deve incorporar o editor em modo embedded');

assert.match(quoteHtml,/id="saveCloudQuote"/,'ação de salvar no Supabase ausente');
assert.match(quoteHtml,/id="quoteHistoryPanel"/,'painel de histórico ausente');
assert.match(quoteHtml,/id="duplicateQuote"/,'ação de duplicar orçamento ausente');
assert.match(quoteHtml,/id="quoteStatus"/,'seletor de status ausente');
assert.match(quoteHtml,/currentQuoteId:state\.currentQuoteId/,'rascunho deve preservar o vínculo com o orçamento salvo');
assert.match(quoteHtml,/adminPost\('quote_save'/,'editor deve persistir pelo gateway administrativo');
assert.match(quoteHtml,/adminGet\('quotes'/,'editor deve listar histórico pelo gateway administrativo');
assert.match(quoteHtml,/adminGet\('quote'/,'editor deve reabrir snapshot salvo');
assert.match(quoteHtml,/\.preview-wrap\{position:static;overflow:hidden\}\.paper\{width:100%;min-height:auto\}/,'preview deve ser responsivo abaixo de 980px');
assert.match(quoteHtml,/\.client-tools\{grid-template-columns:1fr\}/,'controles de cliente devem empilhar no mobile');

for(const action of ['quotes','quote','quote_save','quote_status_set']) assert.ok(api.includes('"'+action+'"'),'gateway não expõe '+action);
assert.match(api,/async function quoteHistory/,'backend de histórico ausente');
assert.match(api,/async function quoteSave/,'backend de persistência ausente');
assert.match(api,/db\.from\("sales_quotes"\)/,'backend deve usar sales_quotes');
assert.match(quoteHtml,/id="lookupCnpj"/,'botão de consulta por CNPJ ausente');
assert.match(quoteHtml,/adminGet\('cnpj_lookup'/,'consulta por CNPJ deve passar pelo gateway autenticado');
assert.match(quoteHtml,/onlyCnpjChars/,'editor deve aceitar o CNPJ alfanumérico');
assert.match(quoteHtml,/value="Boleto bancário — 7 dias"/,'forma de pagamento padrão deve ser boleto em 7 dias');
assert.match(quoteHtml,/addDaysISO\(\$\('issueDate'\)\.value,7\)/,'validade deve acompanhar emissão + 7 dias por padrão');
assert.match(quoteHtml,/document\.title='Orçamento - '\+client\+' - '\+number/,'nome sugerido do PDF deve incluir a empresa cliente');
assert.ok(api.includes('"cnpj_lookup"'),'gateway deve expor cnpj_lookup');
assert.match(api,/async function cnpjLookup/,'backend de consulta CNPJ ausente');
assert.match(api,/brasilapi\.com\.br\/api\/cnpj\/v1\//,'consulta CNPJ deve usar BrasilAPI no backend');

console.log('OK · histórico de Orçamentos + responsividade integrados.');
