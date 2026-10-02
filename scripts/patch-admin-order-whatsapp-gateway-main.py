from pathlib import Path

path = Path('supabase/functions/admin-products-live-v1/index.ts')
s = path.read_text()

if 'async function orderWhatsappGatewayReadiness()' in s:
    print('Admin WhatsApp gateway already present; nothing to patch')
    raise SystemExit(0)

def replace_once(old: str, new: str, label: str):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 anchor, found {count}')
    s = s.replace(old, new, 1)

replace_once(
    '"manual_order_create","ops_papoai_capture_status"',
    '"manual_order_create","order_whatsapp_send","order_registration_link_issue","order_registration_link_status","ops_papoai_capture_status"',
    'LOCAL actions'
)
replace_once(
    '"manual_order_create","papoai_issue_catalog_link"',
    '"manual_order_create","order_whatsapp_send","order_registration_link_issue","papoai_issue_catalog_link"',
    'WRITE actions'
)

helpers_anchor = 'async function adminAuth(r:Request){'
helpers = r'''async function orderWhatsappGatewayReadiness(){
  try{
    const res=await fetch(U+"/functions/v1/admin-orders-v1",{
      method:"GET",headers:{"apikey":K,"x-internal-key":K},signal:AbortSignal.timeout(8000)
    });
    const data=await res.json().catch(()=>({ok:false,error:"invalid_gateway_response"}));
    return {ready:res.ok&&data?.ready===true,providers:data?.providers||{},error:res.ok?null:(data?.error||"gateway_unavailable")};
  }catch(e){return {ready:false,providers:{},error:"gateway_unreachable"}}
}
async function orderWhatsappRegistrationStatus(rawId:any){
  const oid=id(rawId);if(!oid)return {error:"invalid_order",status:400};
  const oq=await db.from("orders").select("id,customer_id,phone_e164,conversation_id").eq("id",oid).maybeSingle();
  if(oq.error)throw oq.error;if(!oq.data?.id)return {error:"order_not_found",status:404};
  let phone=tx(oq.data.phone_e164,40),registrationComplete=false;
  if(oq.data.customer_id){
    const cq=await db.from("ops2_admin_customer_registration_v1").select("primary_whatsapp_e164,registration_complete").eq("customer_id",oq.data.customer_id).maybeSingle();
    if(cq.error)throw cq.error;phone=phone||tx(cq.data?.primary_whatsapp_e164,40);registrationComplete=cq.data?.registration_complete===true;
  }
  const [wq,lq,gateway]=await Promise.all([
    db.from("ops2_whatsapp_outbox_v1").select("recipient_kind,status,attempt_count,sent_at,last_error,channel_origin,phone_e164,updated_at").eq("order_id",oid).eq("message_kind","order_received").order("created_at",{ascending:false}),
    db.from("ops2_order_registration_links_v1").select("id,phone_e164,expires_at,consumed_at,consumed_customer_id,revoked_at,created_at").eq("order_id",oid).order("created_at",{ascending:false}).limit(1),
    orderWhatsappGatewayReadiness()
  ]);
  if(wq.error)throw wq.error;if(lq.error)throw lq.error;
  const whatsapp:any={};for(const row of wq.data||[])if(!whatsapp[row.recipient_kind])whatsapp[row.recipient_kind]=row;
  const link:any=(lq.data||[])[0]||null;
  let linkState="none";
  if(link){
    if(link.consumed_at)linkState="consumed";
    else if(link.revoked_at)linkState="revoked";
    else if(Date.parse(link.expires_at)<=Date.now())linkState="expired";
    else linkState="active";
  }
  return {order_id:oid,phone_e164:phone,registration_complete:registrationComplete,whatsapp_ready:gateway.ready===true,whatsapp_provider:gateway,whatsapp,registration_link:link?{...link,state:linkState}:null};
}
async function dispatchOrderWhatsapp(oid:string){
  const deliveries:any[]=[];
  for(let i=0;i<2;i++){
    try{
      const res=await fetch(U+"/functions/v1/admin-orders-v1",{
        method:"POST",headers:{"Content-Type":"application/json","apikey":K,"x-internal-key":K},
        body:JSON.stringify({order_id:oid}),signal:AbortSignal.timeout(20000)
      });
      const data=await res.json().catch(()=>({ok:false,error:"invalid_gateway_response"}));
      deliveries.push({...data,http_status:res.status});
    }catch(e){deliveries.push({ok:false,error:"gateway_unreachable",detail:tx((e as Error)?.message||e,180)})}
  }
  return deliveries;
}
async function orderWhatsappSend(p:any){
  const oid=id(p?.id);if(!oid)return {error:"invalid_order",status:400};
  const gateway=await orderWhatsappGatewayReadiness();
  if(gateway.ready!==true)return {error:"order_whatsapp_provider_not_configured",status:409,provider:gateway};
  const q=await db.rpc("ops2_enqueue_admin_order_whatsapp_v1",{p_order_id:oid});
  if(q.error)throw q.error;if(q.data?.ok!==true)return {error:q.data?.error||"whatsapp_enqueue_failed",status:409};
  const deliveries=await dispatchOrderWhatsapp(oid),current:any=await orderWhatsappRegistrationStatus(oid);
  const relevant=deliveries.filter(x=>x?.status!=="idle");
  return {queued:q.data,deliveries,delivery_ok:relevant.length>0&&relevant.every(x=>x?.ok===true),status_snapshot:current};
}
async function orderRegistrationLinkIssue(p:any,adminAuthorization:string){
  const oid=id(p?.id);if(!oid)return {error:"invalid_order",status:400};
  const q=await db.rpc("ops2_issue_order_registration_link_v1",{p_order_id:oid});
  if(q.error)throw q.error;if(q.data?.ok!==true)return {error:q.data?.error||"registration_link_failed",status:409};
  const link=q.data||{};
  const order=await db.from("orders").select("id,conversation_id,phone_e164").eq("id",oid).maybeSingle();
  if(order.error)throw order.error;
  let conversationId=order.data?.conversation_id||null;
  const targetDigits=dg(link.phone_e164||order.data?.phone_e164,20);
  if(!conversationId&&targetDigits){
    const conv=await db.from("conversations").select("id,wa_contact_e164,updated_at").not("whatsapp_account_id","is",null).order("updated_at",{ascending:false}).limit(120);
    if(conv.error)throw conv.error;
    const match=(conv.data||[]).find((x:any)=>dg(x.wa_contact_e164,20)===targetDigits);conversationId=match?.id||null;
  }
  let papoaiSend:any={ok:false,error:"conversation_not_found"};
  if(conversationId&&adminAuthorization){
    try{
      const text="Olá! Para concluir seu cadastro da Dona Antônia e vincular ao seu pedido, acesse: "+String(link.registration_url||"");
      const res=await fetch(U+"/functions/v1/admin-whatsapp-ops-v1?action=send_text",{
        method:"POST",headers:{"Content-Type":"application/json","Authorization":adminAuthorization,"apikey":K},
        body:JSON.stringify({conversation_id:conversationId,text,idempotency_key:"order-registration:"+oid+":"+String(link.link_id||"")}),
        signal:AbortSignal.timeout(20000)
      });
      const data=await res.json().catch(()=>({ok:false,error:"invalid_papoai_response"}));
      papoaiSend={...data,http_status:res.status,ok:res.ok&&data?.ok!==false&&data?.dispatch?.ok!==false};
    }catch(e){papoaiSend={ok:false,error:"papoai_unreachable",detail:tx((e as Error)?.message||e,180)}}
  }
  return {link_id:link.link_id,registration_url:link.registration_url,expires_at:link.expires_at,phone_e164:link.phone_e164,conversation_id:conversationId,papoai_send:papoaiSend};
}

'''
replace_once(helpers_anchor, helpers + helpers_anchor, 'helper insertion')

get_anchor = 'if(r.method==="GET"&&a==="order_stock_shortages")'
get_route = 'if(r.method==="GET"&&a==="order_registration_link_status"){const x:any=await orderWhatsappRegistrationStatus(u.searchParams.get("id"));return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}'
replace_once(get_anchor, get_route + get_anchor, 'GET status route')

post_anchor = 'if(r.method==="POST"&&a==="papoai_issue_catalog_link")'
post_routes = 'if(r.method==="POST"&&a==="order_whatsapp_send"){const x:any=await orderWhatsappSend(p);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_registration_link_issue"){const x:any=await orderRegistrationLinkIssue(p,r.headers.get("Authorization")||"");return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}'
replace_once(post_anchor, post_routes + post_anchor, 'POST order WhatsApp routes')

path.write_text(s)
print('Admin order WhatsApp gateway patch applied')
