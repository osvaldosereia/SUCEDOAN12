import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const resilience = fs.readFileSync('checkout-resilience.js', 'utf8');
const store = fs.readFileSync('index.html', 'utf8');
const submitSource = fs.readFileSync('supabase/functions/storefront-v2/index.ts', 'utf8');
const migrationPath = 'supabase/migrations/20261023170000_allow_pending_registration_storefront_orders.sql';

function validate({known=false, phone='(65) 99982-8360', date='2026-10-24', payment=true}={}) {
  const fields = {
    checkoutWhatsappUnified: {value:phone},
    checkoutDeliveryDate: {value:date},
  };
  const result = {classList:{contains:name=>name==='found'&&known},dataset:{}};
  const document = {
    addEventListener(){},
    createElement:()=>({}),
    getElementById:id=>id==='customerLookupResult'?result:(fields[id]||null),
    querySelector:selector=>selector==='input[name="payment"]:checked'&&payment?{}:null,
    querySelectorAll:()=>[],
    documentElement:{},
    head:{appendChild(){}},
  };
  const requests=[];
  const window = {fetch:async(url,options)=>{requests.push({url:String(url),options});return new Response('{}')},setTimeout:()=>0};
  const context = {window,document,MutationObserver:class{observe(){}},URL,Response,Set,clearTimeout(){}};
  vm.runInNewContext(resilience,context);
  return {checkout:window.__DA_CHECKOUT_RESILIENCE__,context,fields,requests};
}

for (const known of [false,true]) {
  const {checkout}=validate({known});
  const result=checkout.validateCheckoutBasics();
  assert.equal(result.ok,true,'new and existing customers must be able to order with registration fields pending for WhatsApp');
  assert.ok(!result.issues.some(issue=>/^checkout(Name|Document|Street|Number|Neighborhood|City)$/.test(issue.id)),'customer registration fields must not block order submission');
}
assert.ok(validate({phone:''}).checkout.validateCheckoutBasics().issues.some(issue=>issue.id==='checkoutWhatsappUnified'),'WhatsApp remains required for order follow-up');
assert.ok(validate({date:''}).checkout.validateCheckoutBasics().issues.some(issue=>issue.id==='checkoutDeliveryDate'),'delivery date remains required');
assert.ok(validate({payment:false}).checkout.validateCheckoutBasics().issues.some(issue=>issue.id==='payment'),'payment method remains required');

const requestHarness=validate();
await requestHarness.context.window.fetch('https://example.test/functions/v1/storefront-v2?action=submit_order',{method:'POST',body:JSON.stringify({items:[{type:'product',id:'x',qty:1}]})});
const submitted=JSON.parse(requestHarness.requests[0].options.body);
assert.equal(submitted.checkout_registration,undefined,'checkout must not make customer registration a prerequisite to submitting an order');
assert.equal(submitted.whatsapp_phone,'+5565999828360','valid WhatsApp must be attached for manual follow-up');

assert.match(store,/(confirma|confirmamos|confirmaremos)[^<]{0,100}WhatsApp|WhatsApp[^<]{0,100}(confirma|confirmamos|confirmaremos)/i,'checkout must explain that registration is completed after the order');
assert.ok(fs.existsSync(migrationPath),'forward migration must relax the active database trigger');
const migration=fs.readFileSync(migrationPath,'utf8');
assert.match(migration,/phone_e164/i,'database must still require the follow-up phone');
assert.match(migration,/payment_method/i,'database must still require the payment choice');
assert.match(migration,/delivery_date/i,'database must still require the delivery date');
assert.doesNotMatch(migration,/registration_incomplete|cpf_cnpj|customer_addresses|street|neighborhood/i,'database must not require customer registration or address to create the order');
const submit=submitSource.match(/async function submit\(req:Request,p:any\)\{[\s\S]*?\n\}/)?.[0]||'';
assert.ok(submit,'storefront submit handler must exist');
assert.doesNotMatch(submit,/registration_incomplete|customer\.registration_complete!==true/,'incomplete customer registration must not reject an order');
assert.match(submit,/customerStatus=customer\?\.registration_complete===true\?"registered":"pending_registration"/,'orders without a completed registration must be marked for follow-up');

console.log('checkout accepts pending customer registration and preserves operational requirements: PASS');
