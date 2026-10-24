import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const fields={
  checkoutWhatsappUnified:{value:'(65) 99982-8360'},
  checkoutName:{value:''},
  checkoutDocument:{value:''},
  checkoutStreet:{value:''},
  checkoutNumber:{value:''},
  checkoutNeighborhood:{value:''},
  checkoutCity:{value:''},
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

const existingResult=checkout.validateCheckoutBasics();
assert.equal(existingResult.ok,true,'existing customers with incomplete cadastral data must be allowed to finish the order');
assert.ok(!existingResult.issues.some(issue=>/^checkout(Name|Document|Street|Number|Neighborhood|City)$/.test(issue.id)),'registration data must not block checkout');

customerFound=false;
const newResult=checkout.validateCheckoutBasics();
assert.equal(newResult.ok,true,'new customers must also be able to finish before registration');
console.log('checkout completion with optional customer registration: PASS');
