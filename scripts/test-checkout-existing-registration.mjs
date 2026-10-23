import fs from 'node:fs';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';

const source=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const start=source.indexOf('async function submit(req:Request,p:any)');
const end=source.indexOf('\nasync function basketBySize',start);
assert.ok(start>=0&&end>start,'submit_order implementation must be extractable');
const code=source.slice(start,end);
let createdArgs,registerAttempts=0;
const incomplete={id:'existing-customer',display_name:'Cliente Existente',registration_complete:false,address:null,marketing_opt_in:false};
const sandbox={
  txt:(v,n)=>String(v??'').trim().slice(0,n),
  phone:()=>'+5565999823600',
  sha:async()=> 'rate-key',
  ip:()=> 'test-ip',
  selectedDelivery:date=>({delivery_date:date}),
  reconcileOrderItemsForStock:async items=>({items,adjusted_items:[],stock_adjustment:false}),
  lookupCustomer:async()=>({found:true,customer:incomplete}),
  registerCustomer:async()=>{registerAttempts++;return {error:'registration_incomplete',status:400}},
  db:{rpc:async(name,args)=>{
    if(name==='consume_public_rate_limit')return {data:true};
    if(name==='create_vitrine_cart_order_v3'){createdArgs=args;return {data:{order_id:'test-order'}}}
    return {data:{}};
  }},
  kickWhatsappOrderOutbound:()=>{},
  recordOpsEvent:async()=>{},
  console,
};
vm.runInNewContext(stripTypeScriptTypes(code)+';this.submit=submit;',sandbox);
const result=await sandbox.submit({},{
  whatsapp_phone:'+5565999823600',
  payment_method:'PIX',
  delivery_date:'2026-10-24',
  items:[{type:'product',id:'product',qty:1}],
  checkout_registration:{name:'Cliente sem cadastro completo',document:'documento inválido'},
});
assert.equal(result.order_id,'test-order','incomplete customer data must not prevent order creation');
assert.equal(result.customer_status,'pending_registration','order must be routed for manual WhatsApp follow-up');
assert.equal(createdArgs.p_customer_snapshot.id,'existing-customer','existing customer match can still be attached');
assert.equal(registerAttempts,0,'submit_order must never call customer registration');
console.log('existing customer can order with registration pending: OK');
