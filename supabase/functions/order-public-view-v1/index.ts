import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const allowed=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(req:Request)=>{const o=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":allowed.has(o)?o:"https://donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"content-type"}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store, max-age=0","X-Robots-Tag":"noindex, nofollow, noarchive"}});
const validUuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const validToken=(v:string)=>/^[a-f0-9]{16}$/i.test(v);
const text=(v:any,n=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const meta=(v:any)=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
const uiStatus=(s:any)=>String(s||"")==="storefront_received"?"created":String(s||"created");
const paymentLabel=(v:any)=>{const s=text(v,80).toLowerCase();const m:any={pix:"PIX",cash:"Dinheiro",dinheiro:"Dinheiro",credit:"Cartão de crédito",credit_card:"Cartão de crédito",card:"Cartão",food_card:"Cartão alimentação/refeição",meal_card:"Cartão alimentação/refeição"};return m[s]||text(v,80)};

async function sha256(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function separationFingerprint(snapshot:any){
  const items=Array.isArray(snapshot?.items)?snapshot.items:[];
  const compact=items.map((x:any,i:number)=>[i,String(x?.kind||"product"),String(x?.basket_id||""),String(x?.basket_name||""),String(x?.name||""),Number(x?.quantity||0)]);
  return (await sha256(JSON.stringify(compact))).slice(0,32);
}
function checklistComplete(indexes:any,itemCount:number){
  if(!Array.isArray(indexes)||itemCount<1||indexes.length!==itemCount)return false;
  const unique=[...new Set(indexes.map((x:any)=>Number(x)))].sort((a,b)=>a-b);
  if(unique.length!==itemCount)return false;
  return unique.every((x,i)=>Number.isInteger(x)&&x===i);
}
async function stockAuthority(){const q=await db.from("bling_hub_runtime_v2").select("metadata").eq("id",1).maybeSingle();if(q.error)throw q.error;return String(q.data?.metadata?.ops2_stock_authority||"legacy_shadow")}
async function hub(subaction:string,extra:any={}){
  const key=await db.rpc("get_bling_hub_key_v2");
  if(key.error||!key.data)return {error:"bling_bridge_not_configured",status:503};
  const res=await fetch(U+"/functions/v1/admin-service-intelligence-v1",{method:"POST",headers:{"Content-Type":"application/json","x-dona-antonia-bling-hub-key":String(key.data)},body:JSON.stringify({action:"vitrine_bling_hub_internal",subaction,...extra}),signal:AbortSignal.timeout(120000)});
  const data=await res.json().catch(()=>({ok:false,error:"invalid_bling_response"}));
  if(!res.ok||data?.ok===false)return {error:String(data?.error||"bling_hub_unavailable"),status:res.status||502,detail:data?.detail||null,data};
  return {data};
}
async function opsEvent(eventType:string,summary:string,orderId:string,payload:any={}){
  try{await db.rpc("ops_record_event_v1",{p_domain:"order",p_event_type:eventType,p_summary:summary,p_actor_type:"human",p_entity_type:"order",p_entity_id:orderId,p_correlation_id:orderId,p_actor_id:null,p_actor_label:"Separação pela vitrine",p_source_system:"dona_antonia",p_severity:"info",p_payload:payload,p_external_ref:null,p_idempotency_key:eventType+":"+orderId+":"+String(payload?.session_id||payload?.status||"v1"),p_occurred_at:new Date().toISOString()})}catch{}
}
async function buildSnapshot(orderId:string,reason:string){
  const oq=await db.from("orders").select("*").eq("id",orderId).maybeSingle();if(oq.error)throw oq.error;if(!oq.data)throw new Error("order_not_found");
  const iq=await db.from("order_items").select("*").eq("order_id",orderId).order("created_at");if(iq.error)throw iq.error;
  const rows=iq.data||[],pids=[...new Set(rows.map((z:any)=>z.product_id).filter(Boolean))],pm=new Map<string,any>();
  if(pids.length){const pq=await db.from("products").select("id,sku,gtin,name").in("id",pids);if(pq.error)throw pq.error;for(const p of pq.data||[])pm.set(p.id,p)}
  const grouped=new Map<string,any>();
  for(const it of rows){
    if(!it.product_id)continue;
    const im=meta(it.metadata),p=pm.get(it.product_id),unit=im.history_kind==="basket_component"&&Number.isFinite(Number(im.unit_price_cents))?Math.round(Number(im.unit_price_cents)):Math.round(Number(it.unit_price||0)*100),qty=Number(it.quantity||0);
    if(qty<=0)continue;
    const key=it.product_id+"|"+unit,old=grouped.get(key);
    if(old)old.quantity=Math.round((old.quantity+qty)*1000)/1000;
    else grouped.set(key,{product_id:it.product_id,sku:it.sku_snapshot||p?.sku||"",gtin:p?.gtin||"",name:it.name_snapshot||p?.name||"Produto",quantity:qty,unit_price_cents:unit,source_kind:im.history_kind==="basket_component"?"basket_component":"product"});
  }
  const items=[...grouped.values()],individual=items.reduce((s:number,z:any)=>s+Math.round(Number(z.quantity)*Number(z.unit_price_cents)),0),total=Math.round(Number(oq.data.total||0)*100),d=oq.data.delivery_address||{},c=oq.data.customer_snapshot||{};
  const rq=await db.from("vitrine_stock_reservations").select("status,expires_at").eq("order_id",orderId);if(rq.error)throw rq.error;
  const reservations=rq.data||[],consumed=reservations.some((r:any)=>r.status==="consumed"),reserved=consumed||reservations.some((r:any)=>r.status==="reserved"&&(!r.expires_at||Date.parse(r.expires_at)>Date.now()));
  const method=text(oq.data.payment_method,80);
  return {source_order_id:orderId,order_number:oq.data.order_number||"",status:uiStatus(oq.data.status),created_at:oq.data.created_at,queue_reason:reason,issues:[],customer:{source_customer_id:oq.data.customer_id||d.source_customer_id||c.customer_id||null,name:c.name||d.customer_name||d.recipient_name||""},delivery:d,payment:{method,label:paymentLabel(method),timing:"on_delivery",source:text(oq.data.source,80)||"vitrine",stock_reserved:reserved,stock_consumed:consumed,stock_released:false,stock_model:"canonical_vitrine_v1",actual:null},items,totals:{individual_products_cents:individual,commercial_order_cents:total,commercial_delta_cents:total-individual}};
}
async function validateOperationalOrder(order:any){
  const a=order?.delivery_address||{},missing:string[]=[];
  if(!text(a.customer_name??a.recipient_name,180))missing.push("customer_required");
  if(!text(a.street,180))missing.push("delivery_street_required");
  if(!text(a.number,40))missing.push("delivery_number_required");
  if(!text(a.city,120))missing.push("delivery_city_required");
  if(!text(a.state,2))missing.push("delivery_state_required");
  if(!text(order?.payment_method,80))missing.push("payment_method_required");
  return missing;
}
async function ensureApprovedSeparation(orderId:string){
  const snap=await buildSnapshot(orderId,"public_vitrine_separation");
  const h=await hub("ops2_ensure_order_state",{payload:snap,target_key:"approved_separation",canary:false});
  if(h.error)return h;
  const now=new Date().toISOString(),blingId=Number(h.data?.bling_order_id||0)||null;
  const up=await db.from("orders").update({bling_order_id:blingId,bling_synced_at:now,sync_status:"sent_to_bling",updated_at:now}).eq("id",orderId);if(up.error)throw up.error;
  return {ok:true,bling_order_id:blingId};
}
async function syncVerifiedIfEnabled(orderId:string){
  const gate=await db.from("bling_hub_runtime_v2").select("metadata").eq("id",1).maybeSingle();if(gate.error)throw gate.error;
  if(gate.data?.metadata?.ops2_ean_verified_sync_enabled!==true)return {attempted:false,ok:false,reason:"protected_rollout"};
  const snap=await buildSnapshot(orderId,"public_vitrine_verified");
  const h=await hub("ops2_ensure_order_state",{payload:snap,target_key:"verified",canary:false});
  if(h.error){
    await db.from("orders").update({sync_status:"review_bling",updated_at:new Date().toISOString()}).eq("id",orderId);
    try{await db.rpc("ops_open_attention_v1",{p_type:"order_bling_verified_failed",p_summary:"Separação concluída, mas o pedido ainda não foi confirmado como Verificado no Bling.",p_entity_type:"order",p_entity_id:orderId,p_correlation_id:orderId,p_priority:"high",p_owner_role:"supervisor",p_recommended_action:"Não repita a baixa de estoque. A recuperação automática tentará confirmar o status no Bling.",p_evidence:{error:h.error,status:h.status||null},p_source_system:"bling",p_idempotency_key:"ops2:order_bling_verified:"+orderId,p_due_at:null})}catch{}
    return {attempted:true,ok:false,error:h.error,recovery_scheduled:true};
  }
  return {attempted:true,ok:true,bling_order_id:h.data?.bling_order_id||null};
}
async function completeSeparation(orderId:string,row:any,body:any){
  const fingerprint=await separationFingerprint(row.snapshot||{}),items=Array.isArray(row.snapshot?.items)?row.snapshot.items:[];
  if(text(body?.separation_fingerprint,64)!==fingerprint)return {status:409,body:{ok:false,error:"separation_snapshot_changed",separation_fingerprint:fingerprint,item_count:items.length}};
  if(!checklistComplete(body?.checked_indexes,items.length))return {status:409,body:{ok:false,error:"separation_incomplete",item_count:items.length}};

  const oq=await db.from("orders").select("*").eq("id",orderId).maybeSingle();if(oq.error)throw oq.error;if(!oq.data)return {status:404,body:{ok:false,error:"order_not_found"}};
  let current=uiStatus(oq.data.status);
  if(current==="ready")return {status:200,body:{ok:true,status:"ready",already_completed:true,definitive_stock_deducted:false}};
  if(!["confirmed","processing"].includes(current))return {status:409,body:{ok:false,error:"order_not_in_separation",current_status:current}};
  const missing=await validateOperationalOrder(oq.data);if(missing.length)return {status:409,body:{ok:false,error:"order_operational_data_incomplete",blockers:missing}};
  const authority=await stockAuthority();if(authority!=="bling")return {status:409,body:{ok:false,error:"public_separation_requires_bling_stock_authority",stock_authority:authority}};

  if(current==="confirmed"){
    const approval:any=await ensureApprovedSeparation(orderId);
    if(approval.error)return {status:approval.status||409,body:{ok:false,error:"bling_approval_required_before_separation",detail:approval.detail||approval.data||null}};
  }
  const consume=await db.rpc("consume_vitrine_order_stock_v1",{p_order_id:orderId});if(consume.error)throw consume.error;
  if(consume.data?.ok!==true)return {status:409,body:{ok:false,error:String(consume.data?.error||"stock_reservation_consume_failed")}};
  if(consume.data?.physical_stock_changed===true)return {status:409,body:{ok:false,error:"unexpected_physical_stock_change"}};

  if(current==="confirmed"){
    const processing=await db.from("orders").update({status:"processing",updated_at:new Date().toISOString()}).eq("id",orderId).eq("status","confirmed");if(processing.error)throw processing.error;
    current="processing";
    await opsEvent("order.separation_started","Separação iniciada pela vitrine com 3 toques por produto.",orderId,{status:"processing",stock_authority:"bling",physical_stock_changed:false});
  }

  const started=await db.rpc("ops_start_order_check_v1",{p_order_id:orderId,p_operator_label:"Separação pela vitrine"});if(started.error)return {status:409,body:{ok:false,error:String(started.error.message||"check_start_failed")}};
  const sessionId=String(started.data?.session_id||"");if(!validUuid(sessionId))return {status:409,body:{ok:false,error:"check_session_missing"}};
  const checkItems=await db.from("ops_order_check_items").select("id,expected_quantity").eq("session_id",sessionId);if(checkItems.error)throw checkItems.error;
  if(!(checkItems.data||[]).length)return {status:409,body:{ok:false,error:"check_items_missing"}};
  for(const item of checkItems.data||[]){const up=await db.from("ops_order_check_items").update({checked_quantity:item.expected_quantity,updated_at:new Date().toISOString()}).eq("id",item.id);if(up.error)throw up.error}
  const finished=await db.rpc("ops_finish_order_check_v1",{p_order_id:orderId,p_operator_label:"Separação pela vitrine"});if(finished.error)return {status:409,body:{ok:false,error:String(finished.error.message||"check_finish_failed")}};
  if(finished.data?.ok!==true)return {status:409,body:{ok:false,...finished.data}};

  const ready=await db.from("orders").update({status:"ready",updated_at:new Date().toISOString()}).eq("id",orderId).eq("status","processing").select("id,status,updated_at").maybeSingle();if(ready.error)throw ready.error;
  if(!ready.data?.id){const reread=await db.from("orders").select("status").eq("id",orderId).maybeSingle();if(reread.error)throw reread.error;if(uiStatus(reread.data?.status)!=="ready")return {status:409,body:{ok:false,error:"ready_transition_failed"}}}
  try{await db.rpc("ops_sync_delivery_stop_v1",{p_order_id:orderId,p_order_status:"ready"})}catch{}
  await opsEvent("order.check_verified","Separação pela vitrine concluída: todos os produtos foram confirmados com 3 toques.",orderId,{session_id:sessionId,verified:true,status:"ready",verification_mode:"public_vitrine_triple_tap"});
  const bling_verified=await syncVerifiedIfEnabled(orderId);
  return {status:200,body:{ok:true,status:"ready",check_session_id:sessionId,bling_verified,definitive_stock_deducted:false,definitive_stock_timing:"ready_to_out_for_delivery"}};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(!["GET","POST"].includes(req.method))return json(req,{ok:false,error:"method_not_allowed"},405);
  if(!U||!K)return json(req,{ok:false,error:"server_config"},500);

  const url=new URL(req.url);
  const token=(url.searchParams.get("k")||"").trim();
  const legacyOrderId=(url.searchParams.get("o")||"").trim();
  let row:any=null,error:any=null;
  if(validToken(token)){
    const q=await db.from("order_public_snapshots_v1").select("order_id,snapshot,open_count,public_code,public_token").eq("public_token",token).maybeSingle();row=q.data;error=q.error;
  }else if(req.method==="GET"&&validUuid(legacyOrderId)){
    const q=await db.from("order_public_snapshots_v1").select("order_id,snapshot,open_count,public_code,public_token").eq("order_id",legacyOrderId).maybeSingle();row=q.data;error=q.error;
    if(!row&&!error){const refreshed=await db.rpc("ops2_refresh_order_public_snapshot_v1",{p_order_id:legacyOrderId});if(refreshed.error||!refreshed.data)return json(req,{ok:false,error:"not_found"},404);const reread=await db.from("order_public_snapshots_v1").select("order_id,snapshot,open_count,public_code,public_token").eq("order_id",legacyOrderId).maybeSingle();row=reread.data;error=reread.error}
  }else return json(req,{ok:false,error:"not_found"},404);
  if(error)return json(req,{ok:false,error:"snapshot_unavailable"},503);
  if(!row)return json(req,{ok:false,error:"not_found"},404);
  const orderId=String(row.order_id||"");

  if(req.method==="POST"){
    if(!validToken(token))return json(req,{ok:false,error:"public_token_required"},403);
    let body:any={};try{body=await req.json()}catch{return json(req,{ok:false,error:"invalid_json"},400)}
    if(body?.action!=="complete_separation")return json(req,{ok:false,error:"invalid_action"},400);
    try{const result=await completeSeparation(orderId,row,body);return json(req,result.body,result.status)}catch(e){console.error("public_separation_failed",orderId,String((e as Error)?.message||e));return json(req,{ok:false,error:"separation_failed"},500)}
  }

  const [current,channel]=await Promise.all([
    db.from("orders").select("status,updated_at,whatsapp_account_id").eq("id",orderId).maybeSingle(),
    db.from("ops2_whatsapp_outbox_v1").select("channel_origin").eq("order_id",orderId).eq("recipient_kind","customer").order("created_at",{ascending:false}).limit(1).maybeSingle()
  ]);
  let channelOrigin=String(channel.data?.channel_origin||"");
  if(channelOrigin!=="0975"&&channelOrigin!=="1018"){
    const accountId=String(current.data?.whatsapp_account_id||"").trim();if(accountId){const account=await db.from("whatsapp_accounts").select("phone_e164").eq("id",accountId).maybeSingle();const digits=String(account.data?.phone_e164||"").replace(/\D/g,"");if(digits==="5565984491018")channelOrigin="1018";else if(digits==="5565998150975")channelOrigin="0975"}
  }
  if(channelOrigin!=="1018")channelOrigin="0975";
  void db.from("order_public_snapshots_v1").update({open_count:Number(row.open_count||0)+1,last_opened_at:new Date().toISOString()}).eq("order_id",orderId).then(()=>{});
  const snapshot={...(row.snapshot||{})};delete snapshot.order_id;delete snapshot.order_number;snapshot.order_code=row.public_code;
  const separation_fingerprint=await separationFingerprint(snapshot);
  return json(req,{ok:true,public_code:row.public_code,snapshot,channel_origin:channelOrigin,current_status:current.data?.status||null,current_status_updated_at:current.data?.updated_at||null,separation_fingerprint,separation_item_count:Array.isArray(snapshot.items)?snapshot.items.length:0});
});
