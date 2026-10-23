import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const fields={
  checkoutWhatsappUnified:{value:'(65) 99982-8360'},
  checkoutName:{value:'Cliente Existente'},
  checkoutDocument:{value:''},
  checkoutStreet:{value:'Rua de teste'},
  checkoutNumber:{value:'10'},
  checkoutNeighborhood:{value:'Centro'},
  checkoutCity:{value:'Cuiabá'},
  checkoutDeliveryDate:{value:'2026-10-24'},
};
let documentPresent=false;
let customerFound=true;
const result={classList:{contains:name=>name==='found'&&customerFound},get dataset(){return {documentPresent:String(documentPresent)}}};
const doc={
  addEventListener(){},
  createElement:()=>({}),
  getElementById:id=>id==='customerLookupResult'?result:(fields[id]||null),
  querySelector:selector=>selector==='input[name="payment"]:checked'?{}:null,
  querySelectorAll:()=>[],
  documentElement:{},
  head:{appendChild(){}},
};
const window={fetch:async()=>new Response('{}'),setTimeout:()=>0};
const context={window,document:doc,MutationObserver:class{observe(){}},URL,Response,Set,clearTimeout(){}};
vm.runInNewContext(fs.readFileSync('checkout-resilience.js','utf8'),context);
const checkout=window.__DA_CHECKOUT_RESILIENCE__;

assert.equal(checkout.checkoutDocumentRequired(),true,'existing customer without a stored document must be asked to provide it');
assert.ok(checkout.validateCheckoutBasics().issues.some(issue=>issue.id==='checkoutDocument'),'empty CPF/CNPJ must block an incomplete existing customer before submit');

documentPresent=true;
assert.equal(checkout.checkoutDocumentRequired(),false,'existing customer with a private stored document may reuse it without retyping');
assert.ok(!checkout.validateCheckoutBasics().issues.some(issue=>issue.id==='checkoutDocument'),'stored private CPF/CNPJ must not be exposed or requested again');

customerFound=false;
documentPresent=false;
assert.equal(checkout.checkoutDocumentRequired(),true,'new customers must still provide CPF/CNPJ');
console.log('checkout CPF/CNPJ requirement for new and incomplete existing customers: PASS');
