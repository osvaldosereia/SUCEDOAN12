import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
const source=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const code=source.slice(source.indexOf('async function submit('),source.indexOf('\nDeno.serve('));
const verified={id:'verified-customer',display_name:'Checkout customer',registration_complete:true,address:{street:'Test street',number:'10',district:'Test district',city:'Cuiabá'}};
let captured;
const sandbox={txt:(v,n)=>String(v??'').trim().slice(0,n),phone:()=>'+5565999990000',sha:async()=>'',ip:()=>'',MINIMUM_ORDER_CENTS:7500,
  selectedDelivery:()=>({date:'2026-10-06'}),reconcileOrderItemsForStock:async items=>({items,adjusted_items:[],stock_adjustment:false}),
  lookupCustomer:async()=>({found:false}),registerCustomer:async(req,p)=>p.document==='valid-document'?{ok:true,customer:verified}:{error:'invalid_document',status:400},
  db:{rpc:async(name,args)=>{if(name==='consume_public_rate_limit')return {data:true};if(name==='create_vitrine_cart_order_v3'){captured=args;if(!args.p_customer_snapshot.address) return {error:{message:'required_checkout_data'}};return {data:{order_id:'test-order'}}}return {data:{}}}},
  kickWhatsappOrderOutbound:()=>{},recordOpsEvent:async()=>{},console};
vm.runInNewContext(stripTypeScriptTypes(code)+';this.submit=submit;',sandbox);
const payload={whatsapp_phone:'+5565999990000',payment_method:'PIX',delivery_date:'2026-10-06',items:[{type:'product',id:'product',qty:1}],checkout_registration:{document:'valid-document',name:'Checkout customer'}};
const result=await sandbox.submit({},payload);
assert.equal(result.order_id,'test-order','a phone collision must not discard the registration verified in checkout');
assert.equal(captured.p_customer_snapshot.id,'verified-customer');
assert.equal(captured.p_customer_snapshot.address.street,'Test street');
captured=null;
const invalid=await sandbox.submit({},{...payload,checkout_registration:{document:'invalid'}});
assert.equal(invalid.error,'invalid_document','unverified registration data must never be accepted as an order identity');
assert.equal(captured,null);
console.log('Checkout with ambiguous phone and verified registration: OK');
