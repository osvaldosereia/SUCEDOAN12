import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = p => fs.readFileSync(p, 'utf8');
const exists = p => fs.existsSync(p);

const sqlPath = 'supabase/sql/20260930_site_only_registration_checkout_v1.sql';
assert.ok(exists(sqlPath), 'migration SQL must exist');
const sql = read(sqlPath);
assert.match(sql, /ops2_upsert_storefront_registration_v1/i, 'canonical registration RPC required');
assert.match(sql, /ops2_valid_cpf_cnpj_v1/i, 'CPF\/CNPJ validation required when registration data is provided');
assert.match(sql, /Cuiab|Varzea|Várzea/i, 'delivery city restriction required for saved addresses');
assert.match(sql, /DISABLE TRIGGER\s+trg_ops2_auto_process_papoai_flow_v2/i, 'Flow auto-processing trigger must be disabled');
assert.match(sql, /DISABLE TRIGGER\s+trg_ops2_registration_journey_outbound_intent_v1/i, 'Flow outbound intent trigger must be disabled');

const sf = read('supabase/functions/storefront-v2/index.ts');
for (const action of ['customer_lookup','customer_register','delivery_options']) {
  assert.ok(sf.includes(action), `storefront-v2 must expose optional helper action ${action}`);
}
assert.match(sf, /CUTOFF_HOUR\s*=\s*11/, 'cutoff must be 11:00 Cuiaba');
assert.match(sf, /const deliveryDate=txt\(p\?\.delivery_date,10\)/, 'delivery date must be read as optional at submit');
assert.match(sf, /const del=deliveryDate\?selectedDelivery\(deliveryDate\):null/, 'delivery date must remain optional when building delivery');
assert.match(sf, /p_phone:ph\|\|null/, 'phone must be optional at submit');
assert.match(sf, /p_payment_method:pay\|\|null/, 'payment method must be optional at submit');
assert.match(sf, /p_delivery:del\|\|\{\}/, 'delivery selection must be optional at submit');
const submit = sf.match(/async function submit\(req:Request,p:any\)\{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(submit, 'submit_order implementation must exist');
assert.doesNotMatch(submit, /delivery_date_required|registration_required|payment_required|invalid_phone/, 'optional checkout fields must not block order creation');
assert.match(sf, /registration_complete/i, 'registration state may still be returned for CRM context');

for (const page of ['index.html','vitrine/index.html']) {
  const html = read(page);
  assert.ok(!html.includes('Confirmar este endereço'), `${page}: saved address must not require an extra confirmation click`);
  assert.ok(html.includes('Trocar endereço'), `${page}: saved address must offer one clear edit action`);
  assert.match(html, /state\.addressConfirmed=data\.found&&data\.customer\?\.registration_complete===true/, `${page}: complete saved address must be accepted automatically`);
  assert.ok(html.includes('CPF'), `${page}: optional registration CPF field must remain available`);
  assert.match(html, /Seu WhatsApp <span class="muted">\(opcional\)<\/span>/, `${page}: WhatsApp must remain optional`);
  assert.match(html, /Data de entrega <span class="muted">\(opcional\)<\/span>/, `${page}: delivery date must remain optional`);
  assert.match(html, /Como você vai pagar\? <span class="muted">\(opcional\)<\/span>/, `${page}: payment must remain optional`);
  assert.ok(html.includes('customer_register'), `${page}: optional canonical registration endpoint required`);
  assert.ok(html.includes('delivery_options'), `${page}: optional delivery choices endpoint required`);
}

assert.ok(exists('cadastro/index.html'), '/cadastro page must exist');
const cadastro = read('cadastro/index.html');
for (const text of ['Nome completo','CPF','WhatsApp','Rua','Número','Bairro','Cidade']) {
  assert.ok(cadastro.includes(text), `/cadastro missing field/copy: ${text}`);
}
assert.ok(cadastro.includes('customer_register'), '/cadastro must use canonical registration endpoint');
assert.ok(!cadastro.includes('submit_order'), '/cadastro must never create an order');
assert.ok(cadastro.includes('Cadastro concluído'), '/cadastro success message required');

const handoffPath = 'docs/projects/dona-antonia-operations-2/PAPOAI-SITE-ONLY-HANDOFF-2026-09-30.md';
assert.ok(exists(handoffPath), 'PapoAI Work handoff must exist');
const handoff = read(handoffPath);
assert.match(handoff, /NÃO usar Flow|não usar Flow|Flow.*desativ/i, 'handoff must disable Flow');
assert.ok(handoff.includes('https://donaantonia.com.br/cadastro'), 'handoff must include registration link');
assert.match(handoff, /10 dias/i, 'handoff must include +10 day marketing cadence');
assert.match(handoff, /somente pelo site|só pelo site/i, 'handoff must state site-only orders');

console.log('site-only registration contract: OK');
