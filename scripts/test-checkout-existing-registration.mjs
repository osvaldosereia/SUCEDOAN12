import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';

// Reproduces editing an existing address while the private CPF field is blank.
const fields={checkoutDdd:'65',checkoutPhone:'999828360',checkoutName:'Antonia Guedes',checkoutDocument:'',checkoutStreet:'Delphina alves da costa',checkoutNumber:'10',checkoutNeighborhood:'Jardim Petrópolis',checkoutCity:'Cuiabá',checkoutPostal:'78070060',checkoutComplement:'Quadra: 15. Frente: Grade branca.',checkoutReference:'Teste checkout'};
const requests=[];
const context={URL,MutationObserver:class{observe(){}},document:{head:{appendChild(){}},createElement:()=>({}),documentElement:{},getElementById:id=>id in fields?{value:fields[id]}:null,querySelector:()=>null},window:{fetch:async(url,options)=>{requests.push({url:String(url),body:JSON.parse(options.body)});return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json'}})},setTimeout:()=>0}};
vm.runInNewContext(fs.readFileSync('checkout-resilience.js','utf8'),context);
await context.window.fetch('https://example.test/functions/v1/storefront-v2?action=submit_order',{method:'POST',body:JSON.stringify({items:[{type:'product',qty:1}]})});
assert.equal(requests.length,2,'existing address must be saved before order even with CPF left blank');
assert.ok(requests[0].url.includes('action=customer_register'));
assert.equal(requests[0].body.reference,'Teste checkout');
assert.equal(requests[1].body.whatsapp_phone,'+5565999828360');
assert.equal(requests[1].body.checkout_registration.reference,'Teste checkout','validated address must accompany the final submit');

const source=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const functionSource=source.slice(source.indexOf('async function registerCustomer('),source.indexOf('\nfunction kickWhatsappOrderOutbound'));
let registrationArgs;
const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{name:'Antonia Guedes',cpf_cnpj:'12345678909'}})})})}),rpc:async(name,args)=>{if(name==='consume_public_rate_limit')return {data:true};registrationArgs=args;return {data:{ok:true,customer_id:'existing'}}}};
const backend={db,phone:()=>'+5565999828360',sha:async()=>'',ip:()=>'',txt:(v,n)=>String(v??'').trim().slice(0,n),customerIdByPhone:async()=> 'existing',loadCustomerForCheckout:async()=>({id:'existing'})};
vm.runInNewContext(stripTypeScriptTypes(functionSource)+'; this.registerCustomer=registerCustomer;',backend);
await backend.registerCustomer({}, {...requests[0].body,document:''});
assert.equal(registrationArgs.p_document,'12345678909','server must reuse the private existing document without exposing it');
assert.equal(registrationArgs.p_reference,'Teste checkout');
registrationArgs=undefined;
const mismatch=await backend.registerCustomer({}, {...requests[0].body,name:'Another person',document:''});
assert.equal(mismatch.error,'identity_mismatch','blank CPF must not permit changing the identity of an existing customer');
assert.equal(registrationArgs,undefined);
console.log('existing checkout registration without reentering CPF: OK');
