from pathlib import Path

p=Path('supabase/functions/admin-products-live-v1/index.ts')
s=p.read_text(encoding='utf-8')

def once(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'missing anchor: {label}')
    if s.count(old)!=1:
        raise SystemExit(f'non-unique anchor {label}: {s.count(old)}')
    s=s.replace(old,new,1)

once('"order_consume_stock","bling_status"',
     '"order_consume_stock","order_separation_get","order_separation_assign","order_separation_item_set","order_separation_complete","bling_status"',
     'LOCAL actions')
once('"order_update","order_consume_stock","bling_create_order_customer"',
     '"order_update","order_consume_stock","order_separation_assign","order_separation_item_set","order_separation_complete","bling_create_order_customer"',
     'WRITE actions')

old='''async function buildSnapshot(oid:string,reason="first_separation"){
  const oq=await db.from("orders").select("*").eq("id",oid).maybeSingle();if(oq.error)throw oq.error;if(!oq.data)throw new Error("order_not_found");const iq=await db.from("order_items").select("*").eq("order_id",oid).order("created_at");if(iq.error)throw iq.error;const rows=iq.data||[],pids=[...new Set(rows.map((z:any)=>z.product_id).filter(Boolean))],pm=new Map<string,any>();
'''
new='''async function buildSnapshot(oid:string,reason="first_separation",options:any={}){
  const oq=await db.from("orders").select("*").eq("id",oid).maybeSingle();if(oq.error)throw oq.error;if(!oq.data)throw new Error("order_not_found");
  const iq=await db.from("order_items").select("*").eq("order_id",oid).order("created_at");if(iq.error)throw iq.error;
  const cq=options?.include_all_items===true?{data:null,error:null}:await db.from("order_separation_completions_v1").select("deliverable_order_item_ids,phase").eq("order_id",oid).maybeSingle();if(cq.error)throw cq.error;
  const allRows=iq.data||[],deliverableIds=new Set<string>(Array.isArray(cq.data?.deliverable_order_item_ids)?cq.data.deliverable_order_item_ids.map(String):[]),rows=cq.data?allRows.filter((z:any)=>deliverableIds.has(String(z.id))):allRows,pids=[...new Set(rows.map((z:any)=>z.product_id).filter(Boolean))],pm=new Map<string,any>();
'''
once(old,new,'buildSnapshot')

helpers=r'''async function orderSeparationGet(rawId:any){
  const oid=id(rawId);if(!oid)return {error:"invalid_order",status:400};
  const q=await db.rpc("ops2_get_order_separation_v2",{p_order_id:oid});if(q.error)throw q.error;
  if(q.data?.ok!==true)return {error:String(q.data?.error||"separation_unavailable"),status:q.data?.error==="order_not_found"?404:409,...q.data};
  return {separation:q.data};
}
async function orderSeparationAssign(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const oid=id(p?.id||p?.order_id);if(!oid)return {error:"invalid_order",status:400};
  const key=tx(p?.separator_key,30).toLowerCase()||null;
  const q=await db.rpc("ops2_set_order_separator_v2",{p_order_id:oid,p_separator_key:key});if(q.error)throw q.error;
  if(q.data?.ok!==true)return {error:String(q.data?.error||"separator_update_failed"),status:409,...q.data};
  return {assignment:q.data};
}
async function orderSeparationItemSet(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const oid=id(p?.id||p?.order_id),itemId=id(p?.order_item_id);if(!oid||!itemId)return {error:"invalid_order_item",status:400};
  const requested=tx(p?.state,20).toLowerCase(),expected=tx(p?.expected_order_updated_at,80),separator=tx(p?.separator_key,30).toLowerCase()||null;
  if(!["separated","missing"].includes(requested))return {error:"invalid_separation_state",status:400};
  if(!expected||!Number.isFinite(Date.parse(expected)))return {error:"order_version_required",status:409};
  let oq=await db.from("orders").select("id,status,updated_at").eq("id",oid).maybeSingle();if(oq.error)throw oq.error;if(!oq.data)return {error:"order_not_found",status:404};
  if(String(oq.data.updated_at)!==expected)return {error:"stale_order_version",conflict:"order_version_conflict",status:409,order_updated_at:oq.data.updated_at};
  if(uiStatus(oq.data.status)==="confirmed"){
    let approval:any=null;try{approval=await syncConfirmedOrderToBling(oid,separator||tx(p?.operator,80)||"Separação")}catch(e){approval={attempted:true,ok:false,error:tx((e as Error)?.message||e,300)}}
    if(!approval?.ok)return {error:"bling_approval_required_before_separation",status:409,bling_sync:approval};
    const moved=await db.from("orders").update({status:"processing",updated_at:new Date().toISOString()}).eq("id",oid).eq("status","confirmed").select("updated_at").maybeSingle();if(moved.error)throw moved.error;
    oq=await db.from("orders").select("id,status,updated_at").eq("id",oid).maybeSingle();if(oq.error)throw oq.error;
  }
  const q=await db.rpc("ops2_set_order_separation_item_v2",{p_order_id:oid,p_order_item_id:itemId,p_state:requested,p_expected_order_updated_at:oq.data?.updated_at,p_separator_key:separator});if(q.error)throw q.error;
  if(q.data?.ok!==true){const conflict=["stale_order_version","order_version_conflict"].includes(String(q.data?.error||q.data?.conflict||""));return {error:String(q.data?.error||"separation_item_update_failed"),status:conflict?409:400,...q.data}}
  try{await db.rpc("ops2_refresh_order_public_snapshot_v1",{p_order_id:oid})}catch{}
  return {item:q.data};
}
async function markSeparationNeedsAttention(oid:string,resumeFrom:string,error:any,detail:any=null){
  try{await db.rpc("ops2_mark_order_separation_completion_v2",{p_order_id:oid,p_phase:"needs_attention",p_metadata:{resume_from:resumeFrom,last_error:String(error||"separation_completion_failed"),last_error_detail:detail||null,last_error_at:new Date().toISOString()}})}catch{}
}
async function orderSeparationComplete(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const oid=id(p?.id||p?.order_id);if(!oid)return {error:"invalid_order",status:400};
  const expected=tx(p?.expected_order_updated_at,80);if(!expected||!Number.isFinite(Date.parse(expected)))return {error:"order_version_required",status:409};
  const prep=await db.rpc("ops2_prepare_order_separation_completion_v2",{p_order_id:oid,p_expected_order_updated_at:expected});if(prep.error)throw prep.error;
  if(prep.data?.ok!==true){const conflict=["stale_order_version","order_version_conflict"].includes(String(prep.data?.error||prep.data?.conflict||""));return {error:String(prep.data?.error||"separation_prepare_failed"),status:conflict?409:400,...prep.data}}

  const stock=await db.rpc("ops2_apply_order_separation_stock_v2",{p_order_id:oid});if(stock.error)throw stock.error;
  if(stock.data?.ok!==true){await markSeparationNeedsAttention(oid,"stock_applied",stock.data?.error,stock.data);return {error:String(stock.data?.error||"separation_stock_failed"),status:409,recovery_scheduled:true}}
  try{await db.rpc("ops2_refresh_order_public_snapshot_v1",{p_order_id:oid})}catch{}

  const snap=await buildSnapshot(oid,"separation_verified");
  const verified=await hub("ops2_ensure_order_state",{payload:snap,target_key:"verified",canary:false});
  if(verified.error){await markSeparationNeedsAttention(oid,"bling_verified",verified.error,verified.data||verified.detail);return {error:"bling_verified_failed",status:verified.status||409,detail:verified.data||verified.detail||null,recovery_scheduled:true}}
  await db.rpc("ops2_mark_order_separation_completion_v2",{p_order_id:oid,p_phase:"bling_verified",p_metadata:{bling_verified:true,bling_order_id:verified.data?.bling_order_id||null,verified_at:new Date().toISOString()}});

  let order=await db.from("orders").select("id,status,updated_at").eq("id",oid).maybeSingle();if(order.error)throw order.error;if(!order.data)return {error:"order_not_found",status:404};
  if(uiStatus(order.data.status)==="confirmed"){
    const processing=await db.from("orders").update({status:"processing",updated_at:new Date().toISOString()}).eq("id",oid).eq("status","confirmed");if(processing.error)throw processing.error;
    order=await db.from("orders").select("id,status,updated_at").eq("id",oid).maybeSingle();if(order.error)throw order.error;
  }
  if(uiStatus(order.data?.status)==="processing"){
    const ready=await db.from("orders").update({status:"ready",updated_at:new Date().toISOString()}).eq("id",oid).eq("status","processing");if(ready.error)throw ready.error;
    try{await db.rpc("ops_sync_delivery_stop_v1",{p_order_id:oid,p_order_status:"ready"})}catch{}
  }
  await db.rpc("ops2_mark_order_separation_completion_v2",{p_order_id:oid,p_phase:"ready",p_metadata:{ready_at:new Date().toISOString()}});

  const preflight=await db.rpc("ops2_fiscal_dispatch_preflight_v1",{p_order_id:oid});if(preflight.error)throw preflight.error;
  if(preflight.data?.ready!==true){await markSeparationNeedsAttention(oid,"ready",preflight.data?.blockers||"fiscal_preflight_failed",preflight.data);return {error:"fiscal_dispatch_not_ready",status:409,fiscal_preflight:preflight.data,recovery_scheduled:true}}
  const fiscal=await hub("fiscal_dispatch_gate",{source_order_id:oid});
  if(fiscal.error||fiscal.data?.allowed!==true){await markSeparationNeedsAttention(oid,"ready",fiscal.error||"fiscal_dispatch_not_authorized",fiscal.data||fiscal.detail);return {error:fiscal.error?"fiscal_dispatch_gate_unavailable":"fiscal_dispatch_not_authorized",status:fiscal.status||409,fiscal_dispatch_gate:fiscal.data||null,recovery_scheduled:true}}

  const completionQ=await db.from("order_separation_completions_v1").select("phase,metadata").eq("order_id",oid).maybeSingle();if(completionQ.error)throw completionQ.error;
  if(completionQ.data?.metadata?.physical_stock_launched!==true){
    const dispatchSnap=await buildSnapshot(oid,"dispatch_physical_stock");
    const launch=await hub("ops2_launch_physical_stock",{payload:dispatchSnap});
    if(launch.error){await markSeparationNeedsAttention(oid,"ready",launch.error,launch.data||launch.detail);return {error:launch.error||"physical_stock_launch_failed",status:launch.status||409,detail:launch.data||launch.detail||null,recovery_scheduled:true}}
    await db.rpc("ops2_mark_order_separation_completion_v2",{p_order_id:oid,p_phase:"physical_stock_launched",p_metadata:{physical_stock_launched:true,physical_stock_result:launch.data||null,physical_stock_launched_at:new Date().toISOString()}});
  }

  const moved=await db.from("orders").update({status:"out_for_delivery",updated_at:new Date().toISOString()}).eq("id",oid).eq("status","ready").select("id,status,updated_at").maybeSingle();if(moved.error)throw moved.error;
  const finalOrder=moved.data||((await db.from("orders").select("id,status,updated_at").eq("id",oid).maybeSingle()).data);
  if(uiStatus(finalOrder?.status)!=="out_for_delivery"){await markSeparationNeedsAttention(oid,"physical_stock_launched","out_for_delivery_transition_failed",finalOrder);return {error:"out_for_delivery_transition_failed",status:409,recovery_scheduled:true}}
  try{await db.rpc("ops_sync_delivery_stop_v1",{p_order_id:oid,p_order_status:"out_for_delivery"})}catch{}
  try{await db.rpc("ops2_refresh_order_public_snapshot_v1",{p_order_id:oid})}catch{}
  const done=await db.rpc("ops2_mark_order_separation_completion_v2",{p_order_id:oid,p_phase:"completed",p_metadata:{completed_by:auth?.user_id||null,out_for_delivery_at:new Date().toISOString()}});if(done.error)throw done.error;
  await opsEvent("order.separation_completed","Separação concluída e pedido liberado para entrega.","order",oid,{missing_subtotal:prep.data?.missing_subtotal||0,final_total:prep.data?.final_total||null,status:"out_for_delivery"},tx(p?.operator,80)||"Separação","human","dona_antonia","order-separation-v2-complete:"+oid);
  return {order_id:oid,status:"out_for_delivery",completion:done.data,missing_subtotal:prep.data?.missing_subtotal||0,final_total:prep.data?.final_total||null,recovery_scheduled:false};
}

'''
once('async function adminAuth(r:Request){',helpers+'async function adminAuth(r:Request){','helpers')

once('''if(r.method==="GET"&&a==="order"){const x:any=await orderDetailCanonical(u.searchParams.get("id"));return x.error?js(r,{ok:false,error:x.error},x.status):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="order_registration_link_status")''',
'''if(r.method==="GET"&&a==="order"){const x:any=await orderDetailCanonical(u.searchParams.get("id"));return x.error?js(r,{ok:false,error:x.error},x.status):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="order_separation_get"){const x:any=await orderSeparationGet(u.searchParams.get("id"));return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="order_registration_link_status")''',
'GET router')

once('''let p:any={};try{p=await r.json()}catch{}if(r.method==="POST"&&a==="quote_save")''',
'''let p:any={};try{p=await r.json()}catch{}if(r.method==="POST"&&a==="order_separation_assign"){const x:any=await orderSeparationAssign(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_separation_item_set"){const x:any=await orderSeparationItemSet(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_separation_complete"){const x:any=await orderSeparationComplete(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="quote_save")''',
'POST router')

p.write_text(s,encoding='utf-8')
print('patched admin-products-live-v1 for separation v2')
