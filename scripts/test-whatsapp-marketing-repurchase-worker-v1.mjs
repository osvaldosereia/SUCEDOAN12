import fs from 'node:fs';
import assert from 'node:assert/strict';

const worker=fs.readFileSync('supabase/functions/whatsapp-repurchase-worker-v1/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20261019140000_marketing_repurchase_dispatch_v1.sql','utf8');
assert.match(worker,/marketing_campaign_worker_internal_key_v1/,'worker exige autenticação interna');
assert.match(worker,/marketing_repurchase_claim_due_v1/,'worker usa fila transacional com claim');
assert.match(worker,/marketing_repurchase_validate_dispatch_v1/,'worker revalida a elegibilidade imediatamente antes do envio');
assert.match(worker,/marketing_repurchase_finish_dispatch_v1/,'resultado do Meta deve ficar registrado na fila');
assert.match(worker,/sendTemplateViaMeta/,'worker só envia pelo transporte oficial da Meta');
assert.match(worker,/marketing_opt_in/,'opt-in continua exigido na revalidação do banco');
assert.match(worker,/templateVariables\(data\.template_components,data\.basket_name,data\.product_categories\)/,'variáveis usam cesta e categorias da última compra');
assert.match(worker,/uncertain/,'envio incerto não pode ser repetido automaticamente');
assert.match(migration,/enabled boolean not null default false/,'automação começa desligada');
assert.match(migration,/t\.status='APPROVED' and t\.category='MARKETING'/,'somente template de Marketing aprovado entra na fila');
assert.match(migration,/r\.campaigns_enabled is true and r\.send_enabled is true and r\.outbound_provider='meta'/,'canal deve estar habilitado para Meta');
assert.match(migration,/for update of s skip locked/,'claims concorrentes não podem duplicar envios');
assert.match(migration,/unique references public\.orders/,'cada pedido só recebe um disparo de recompra');
console.log('monthly repurchase Meta worker contract: ok');
