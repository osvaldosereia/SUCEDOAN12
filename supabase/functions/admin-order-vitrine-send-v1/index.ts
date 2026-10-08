import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const OFFICIAL_CHANNELS=new Map([["5565998150975","0975"],["5565984491018","1018"]]);
const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"content-type,authorization,apikey","Access-Control-Allow-Methods":"POST,OPTIONS"}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(value:unknown,max=500)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const uuid=(value:unknown)=>{const text=clean(value,64);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)?text:""};
const digits=(value:unknown)=>String(value??"").replace(/\D+/g,"").slice(0,20);
const channelKey=(phone:unknown)=>OFFICIAL_CHANNELS.get(digits(phone))||null;

async function adminAuth(req:Request){
  const header=req.headers.get("Authorization")||"",token=header.replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false as const,status:401,error:"admin_auth_required",header:""};
  const user=await db.auth.getUser(token);
  if(user.error||!user.data?.user?.id)return {ok:false as const,status:401,error:"admin_session_invalid",header:""};
  const row=await db.from("admin_users").select("user_id,role,is_active").eq("user_id",user.data.user.id).eq("is_active",true).maybeSingle();
  if(row.error)return {ok:false as const,status:500,error:"admin_auth_lookup_failed",header:""};
  if(!row.data?.user_id)return {ok:false as const,status:403,error:"admin_not_authorized",header:""};
  if(String(row.data.role||"viewer")==="viewer")return {ok:false as const,status:403,error:"forbidden",header:""};
  return {ok:true as const,status:200,user_id:user.data.user.id,role:row.data.role||"viewer",header:`Bearer ${token}`}
}

function newestConversation(rows:any[]){
  return [...rows].sort((a,b)=>Date.parse(b.last_inbound_at||b.updated_at||b.created_at||0)-Date.parse(a.last_inbound_at||a.updated_at||a.created_at||0))[0]||null
}

async function conversationById(order:any){
  const cid=uuid(order.conversation_id);if(!cid)return null;
  const q=await db.from("conversations").select("id,whatsapp_account_id,customer_id,wa_contact_e164,last_inbound_at,updated_at,created_at").eq("id",cid).maybeSingle();
  if(q.error)throw q.error;if(!q.data)return null;
  if(order.whatsapp_account_id&&String(q.data.whatsapp_account_id||"")!==String(order.whatsapp_account_id))return null;
  const target=digits(order.phone_e164||order.delivery_address?.phone||order.customer_snapshot?.phone_e164),actual=digits(q.data.wa_contact_e164);
  if(target&&actual&&target!==actual&&String(q.data.customer_id||"")!==String(order.customer_id||""))return null;
  return q.data
}

async function conversationByCustomer(order:any){
  if(!order.customer_id)return null;
  let query=db.from("conversations").select("id,whatsapp_account_id,customer_id,wa_contact_e164,last_inbound_at,updated_at,created_at").eq("customer_id",order.customer_id).not("whatsapp_account_id","is",null).order("last_inbound_at",{ascending:false,nullsFirst:false}).order("updated_at",{ascending:false}).limit(20);
  if(order.whatsapp_account_id)query=query.eq("whatsapp_account_id",order.whatsapp_account_id);
  const q=await query;if(q.error)throw q.error;return newestConversation(q.data||[])
}

async function conversationByPhone(order:any){
  const target=digits(order.phone_e164||order.delivery_address?.phone||order.customer_snapshot?.phone_e164);if(!target)return null;
  let query=db.from("conversations").select("id,whatsapp_account_id,customer_id,wa_contact_e164,last_inbound_at,updated_at,created_at").not("whatsapp_account_id","is",null).order("last_inbound_at",{ascending:false,nullsFirst:false}).order("updated_at",{ascending:false}).limit(160);
  if(order.whatsapp_account_id)query=query.eq("whatsapp_account_id",order.whatsapp_account_id);
  const q=await query;if(q.error)throw q.error;
  return newestConversation((q.data||[]).filter((row:any)=>digits(row.wa_contact_e164)===target))
}

async function resolveConversation(order:any){
  const conversation=await conversationById(order)||await conversationByCustomer(order)||await conversationByPhone(order);
  if(!conversation)return {ok:false as const,error:"conversation_not_found"};
  const account=await db.from("whatsapp_accounts").select("id,display_name,phone_e164,is_active").eq("id",conversation.whatsapp_account_id).eq("is_active",true).maybeSingle();
  if(account.error)throw account.error;
  if(!account.data||!channelKey(account.data.phone_e164))return {ok:false as const,error:"channel_unavailable"};
  return {ok:true as const,conversation,account:account.data}
}

async function publicOrderLink(orderId:string){
  const q=await db.rpc("ops2_order_public_link_v1",{p_order_id:orderId});
  if(q.error)throw q.error;
  const data=q.data&&typeof q.data==="object"?q.data:{};
  return {public_order_url:clean(data.public_url,1200)||`https://donaantonia.com.br/pedido/?o=${encodeURIComponent(orderId)}`,public_order_code:clean(data.public_code,120)||null}
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);
  try{
    const auth=await adminAuth(req);if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);
    let body:any={};try{body=await req.json()}catch{return json(req,{ok:false,error:"invalid_json"},400)}
    const orderId=uuid(body?.order_id),requestId=clean(body?.request_id,80);
    if(!orderId)return json(req,{ok:false,error:"invalid_order_id"},400);
    if(requestId&&!/^[A-Za-z0-9-]{8,80}$/.test(requestId))return json(req,{ok:false,error:"invalid_request_id"},400);
    const orderResult=await db.from("orders").select("id,order_number,customer_id,conversation_id,whatsapp_account_id,phone_e164,delivery_address,customer_snapshot").eq("id",orderId).maybeSingle();
    if(orderResult.error)throw orderResult.error;if(!orderResult.data)return json(req,{ok:false,error:"order_not_found"},404);
    const resolved=await resolveConversation(orderResult.data);if(!resolved.ok)return json(req,{ok:false,error:resolved.error},409);
    const link=await publicOrderLink(orderId),publicCode=clean(link.public_order_code,5);
    if(!/^(?:[A-Z]{2}[0-9]{3}|[0-9]{4})$/.test(publicCode))return json(req,{ok:false,error:"public_order_code_missing"},409);
    const text=`Olá! Aqui está a vitrine do seu pedido Dona Antônia.\nPedido: ${publicCode}\n${link.public_order_url}`;
    const idempotencyKey=`order-vitrine:${orderId}:${requestId||Date.now().toString(36)}`.slice(0,120);
    const response=await fetch(`${U}/functions/v1/admin-whatsapp-ops-v1?action=send_text`,{
      method:"POST",headers:{"Content-Type":"application/json","Authorization":auth.header},
      body:JSON.stringify({conversation_id:resolved.conversation.id,text,idempotency_key:idempotencyKey}),signal:AbortSignal.timeout(20000)
    });
    const delivery=await response.json().catch(()=>({}));
    if(!response.ok||delivery?.ok===false){const error=clean(delivery?.error,120)||`attendance_${response.status}`;return json(req,{ok:false,error,message:clean(delivery?.message,300)||null,conversation_id:resolved.conversation.id,channel_phone_e164:resolved.account.phone_e164},response.status||409)}
    return json(req,{ok:true,order_id:orderId,conversation_id:resolved.conversation.id,whatsapp_account_id:resolved.account.id,channel_phone_e164:resolved.account.phone_e164,channel_name:resolved.account.display_name,public_order_url:link.public_order_url,public_order_code:link.public_order_code,delivery})
  }catch(error){console.error("admin-order-vitrine-send-v1",error);return json(req,{ok:false,error:"internal_error"},500)}
});
