import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';

const source=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const start=source.indexOf('async function submit(req:Request,p:any)');
const end=source.indexOf('\nasync function basketBySize',start);
assert.ok(start>=0&&end>start,'submit_order implementation must be extractable');
const code=source.slice(start,end);
let captured=null,registerAttempts=0;
const sandbox={
  txt:(v,n)=>String(v??'').trim().slice(0,n),
  phone:()=>'+5565999990000',
  sha:async()=> 'rate-key',
  ip:()=> 'test-ip',
  selectedDelivery:date=>({delivery_date:date}),
  reconcileOrderItemsForStock:async items=>({items,adjusted_items:[],stock_adjustment:false}),
  lookupCustomer:async()=>({found:false}),
  registerCustomer:async()=>{registerAttempts++;return {error:'invalid_document',status:400}},
  db:{rpc:async(name,args)=>{
    if(name==='consume_public_rate_limit')return {data:true};
    if(name==='create_vitrine_cart_order_v3'){captured=args;return {data:{order_id:'test-order'}}}
    return {data:{}};
  }},
  kickWhatsappOrderOutbound:()=>{},
  recordOpsEvent:async()=>{},
  console,
};
vm.runInNewContext(stripTypeScriptTypes(code)+';this.submit=submit;',sandbox);
const result=await sandbox.submit({},{
  whatsapp_phone:'+5565999990000',
  payment_method:'PIX',
  delivery_date:'2026-10-24',
  items:[{type:'product',id:'product',qty:1}],
  checkout_registration:{document:'invalid',name:'Cadastro pendente'},
});
assert.equal(result.order_id,'test-order','ambiguous or unregistered phone must still accept the order');
assert.equal(result.customer_status,'pending_registration','ambiguous phone must be routed for manual follow-up');
assert.ok(!captured.p_customer_snapshot.id,'unverified phone collision must not be attached to another customer');
assert.equal(registerAttempts,0,'order submission must not attempt registration validation');
console.log('checkout order does not wait for registration or phone disambiguation: OK');
