import assert from 'node:assert/strict';
import fs from 'node:fs';

const helperPath='supabase/functions/_shared/marketing-template-variables-v1.mjs';
assert.equal(fs.existsSync(helperPath),true,'helper de variáveis personalizadas deve existir');
const {resolveMarketingTemplateVariables}=await import('../supabase/functions/_shared/marketing-template-variables-v1.mjs');

assert.deepEqual(resolveMarketingTemplateVariables({
  '1':{source:'customer_first_name',fallback:'tudo bem'},
  '2':'cesta básica'
},'  Maria Aparecida Silva  '),{'1':'Maria','2':'cesta básica'});
assert.deepEqual(resolveMarketingTemplateVariables({
  '1':{source:'customer_first_name',fallback:'tudo bem'}
},'   '),{'1':'tudo bem'});
assert.throws(()=>resolveMarketingTemplateVariables({'1':{source:'other'}}),/template_variable_invalid:1/);

const audience=fs.readFileSync('vitrine/admin/marketing/audience-center.js','utf8');
assert.match(audience,/data-audience-select-customer/,'Públicos deve permitir marcar clientes aptos individualmente');
assert.match(audience,/customer_ids/,'os clientes marcados devem seguir para os filtros da campanha');
assert.match(audience,/data-audience-page-next/,'a seleção deve continuar ao percorrer páginas');
assert.match(audience,/Criar campanha com/,'a ação de campanha deve ficar visível após selecionar contatos');
const simpleCampaign=fs.readFileSync('vitrine/admin/marketing/campaign-simple-ui.js','utf8');
assert.match(simpleCampaign,/data-simple-variable-mode/,'o fluxo simples também deve permitir personalizar variáveis');
assert.match(simpleCampaign,/source:'customer_first_name'/,'o primeiro nome deve ser opção direta no envio manual');
assert.match(simpleCampaign,/confirm\(/,'o fluxo rápido deve confirmar antes de iniciar o disparo');

const worker=fs.readFileSync('supabase/functions/whatsapp-marketing-worker-v1/index.ts','utf8');
assert.match(worker,/resolveMarketingTemplateVariables\(variableValues,customerName\)/,'worker deve resolver variáveis usando o nome do destinatário revalidado');
assert.match(worker,/data\.variable_values,tracking_links,strategyTracked,data\.customer_name/,'worker deve usar o primeiro nome recebido na revalidação');
const revalidate=fs.readFileSync('supabase/migrations/20261019170000_marketing_recipient_first_name_v1.sql','utf8');
assert.match(revalidate,/'customer_name',coalesce\(nullif\(split_part\(btrim\(v_customer\.name\),' ',1\),''\),'Cliente'\)/,'RPC deve passar o primeiro nome do cadastro à fila');

const api=fs.readFileSync('supabase/functions/admin-marketing-campaigns-v1/index.ts','utf8');
assert.match(api,/snapshot_recipients/,'API deve disponibilizar a lista nominal do snapshot');
assert.match(api,/masked_phone/,'a revisão deve mascarar telefones');
assert.match(api,/runtime_status/,'API deve expor o estado real dos canais oficiais');
assert.match(audience,/loadRuntimeStatus/,'Públicos deve trocar o aviso estático pelo estado real');
assert.match(fs.readFileSync('vitrine/admin/marketing/campaign-center.js','utf8'),/Envio somente após revisão e confirmação manual/,'a tela deve explicar corretamente o gate manual');
console.log('marketing campaign selection and personalization contract: ok');
