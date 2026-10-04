import fs from 'node:fs';

const path='supabase/functions/admin-products-live-v1/index.ts';
let s=fs.readFileSync(path,'utf8');
const start='async function completeDeliveryV3(p:any,auth:any){';
const end='async function reopenOrderV3(p:any,auth:any){';
const a=s.indexOf(start),b=s.indexOf(end,a);
if(a<0||b<0)throw new Error('delivery v3 function markers not found');

const replacement=`async function completeDeliveryV3(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const oid=id(p?.id||p?.order_id);if(!oid)return {error:"invalid_order",status:400};
  const method=tx(p?.method,40).toLowerCase(),amount=Math.round(Number(p?.amount_cents||0));
  const q=await db.rpc("ops3_complete_delivery_v1",{p_order_id:oid,p_method:method,p_amount_cents:amount,p_operator_label:tx(p?.operator,80)||"Entrega",p_idempotency_key:tx(p?.idempotency_key,120)||("delivery-v3:"+oid)});
  if(q.error){const m=String(q.error.message||"");for(const code of ["invalid_payment_method","payment_total_mismatch","payment_already_captured","order_not_ready_for_delivery","separation_not_completed","delivery_return_open"]){if(m.includes(code))return {error:code,status:code.startsWith("invalid_")?400:409}}throw q.error}
  try{await db.rpc("ops_sync_delivery_stop_v1",{p_order_id:oid,p_order_status:"delivered"})}catch{}
  try{await db.rpc("ops2_refresh_order_public_snapshot_v1",{p_order_id:oid})}catch{}

  let bling_completion:any=null;
  try{
    try{await hub("fiscal_status",{source_order_id:oid})}catch{}
    const h=await hub("ops2_ensure_delivered_attended",{source_order_id:oid});
    if(h.error){
      await db.from("orders").update({sync_status:"review_bling",sync_error:tx(h.error||"bling_attended_failed",300),updated_at:new Date().toISOString()}).eq("id",oid);
      try{await db.rpc("ops_open_attention_v1",{p_type:"bling_delivery_sync_review",p_summary:"Entrega confirmada; Bling precisa de revisão.",p_entity_type:"order",p_entity_id:oid,p_correlation_id:oid,p_priority:"high",p_owner_role:"supervisor",p_recommended_action:"Abra o pedido entregue e revise a situação no Bling.",p_evidence:{error:h.error,detail:h.detail||h.data||null},p_source_system:"bling",p_idempotency_key:"ops3:bling_delivery_review:"+oid,p_due_at:null})}catch{}
      bling_completion={attempted:true,ok:false,error:h.error,detail:h.detail||h.data||null,recovery_scheduled:true};
    }else{
      bling_completion={attempted:true,ok:true,result:h.data};
      await opsEvent("order.bling_attended","Pedido entregue confirmado como Atendido no Bling.","order",oid,{bling_completion},tx(p?.operator,80)||"Entrega","automation","bling","order-bling-attended-v3:"+oid);
    }
  }catch(e){
    await db.from("orders").update({sync_status:"review_bling",sync_error:tx((e as Error)?.message||e,300),updated_at:new Date().toISOString()}).eq("id",oid);
    bling_completion={attempted:true,ok:false,error:tx((e as Error)?.message||e,300),recovery_scheduled:true};
  }
  return {...(q.data||{ok:true,order_id:oid,status:"delivered"}),bling_completion};
}

`;

s=s.slice(0,a)+replacement+s.slice(b);
fs.writeFileSync(path,s);
console.log('delivery v3 Bling patch applied');
