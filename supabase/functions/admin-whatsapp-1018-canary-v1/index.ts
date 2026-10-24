import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
const BASE=Deno.env.get("SUPABASE_URL")||"";
const KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const TOKEN=(Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")||"").trim();
const VERSION=(Deno.env.get("META_WHATSAPP_GRAPH_VERSION")||"").trim();
const SENDER="+5565984491018",RECIPIENT="+5565999828360",DIGITS="5565999828360";
const SLUG="dona-antonia-1018",TABLE="whatsapp_1018_interactive_canary_v1";
const SIZES=["economica","mini","pequena","media","grande"];
const LABELS=["Econômica","Mini","Pequena","Média","Grande"];
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const db=createClient(BASE,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const cors=req=>({"Access-Control-Allow-Origin":ORIGINS.has(req.headers.get("origin")||"")?req.headers.get("origin"):"https://www.donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"});
const json=(req,data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const uuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||""))?String(v):null;
const clean=(v,max=100)=>String(v??"").replace(/[\u0000-\u001f\u007f]+/g," ").replace(/\s+/g," ").trim().slice(0,max);
async function adminAuth(req){
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!token)return {ok:false,error:"admin_auth_required",status:401};
 const user=await db.auth.getUser(token);
 if(user.error||!user.data?.user?.id)return {ok:false,error:"admin_session_invalid",status:401};
 const r=await db.from("admin_users").select("user_id,role,is_active").eq("user_id",user.data.user.id).eq("is_active",true).maybeSingle();
 if(r.error)return {ok:false,error:"admin_lookup_error",status:503};
 return r.data?{ok:true,role:r.data.role}:{ok:false,error:"admin_not_authorized",status:403};
}
async function preflight(){
 const a=await db.from("whatsapp_accounts").select("id,phone_e164,phone_number_id,is_active").eq("slug",SLUG).maybeSingle();
 if(a.error)throw Error("account_query_failed");
 const account=a.data;
 if(!account||account.is_active!==true||account.phone_e164!==SENDER)return {ok:false,reason:"sender_not_available"};
 const [r,c]=await Promise.all([
  db.from("whatsapp_channel_runtime_v1").select("outbound_provider,send_enabled,human_send_enabled,homologated_at").eq("whatsapp_account_id",account.id).maybeSingle(),
  db.from("conversations").select("id,mode,human_required,last_inbound_at,wa_contact_e164").eq("whatsapp_account_id",account.id).eq("wa_contact_e164",RECIPIENT).maybeSingle()
 ]);
 if(r.error||c.error)throw Error("canary_preflight_error");
 const runtime=r.data,conversation=c.data;
 let reason=null;
 if(!TOKEN||!/^v\d+\.\d+$/.test(VERSION)||!/^\d{5,30}$/.test(String(account.phone_number_id||"")))reason="meta_transport_unavailable";
 else if(runtime?.outbound_provider!=="meta"||runtime.send_enabled!==true||runtime.human_send_enabled!==true||!runtime.homologated_at)reason="meta_channel_not_ready";
 else if(!conversation?.id)reason="test_conversation_not_found";
 else if(conversation?.mode!=="human"||conversation.human_required!==true)reason="human_mode_required";
 else {
   const inbound=Date.parse(conversation.last_inbound_at||"");
   if(!Number.isFinite(inbound)||Date.now()-inbound>=86400000||inbound>Date.now()+60000)reason="service_window_closed";
 }
 const ts=conversation?.last_inbound_at?Date.parse(conversation.last_inbound_at):NaN;
 return {ok:!reason,reason,accountId:account.id,phoneNumberId:account.phone_number_id,conversationId:conversation?.id||null,windowUntil:Number.isFinite(ts)?new Date(ts+86400000).toISOString():null};
}
function safeInteractive(body){
 const kind=String(body?.kind||"");
 const size=String(body?.size_key||"");
 const input=body?.payload?.interactive;
 if(!["sizes","combinations"].includes(kind)||body?.payload?.type!=="interactive"||input?.type!=="list")throw Error("invalid_canary_kind");
 if(!Array.isArray(input?.action?.sections)||input.action.sections.length!==1)throw Error("invalid_canary_sections");
 const rows=input.action.sections[0]?.rows;
 if(!Array.isArray(rows)||rows.length!==(kind==="sizes"?5:3))throw Error("invalid_canary_rows");
 if(kind==="combinations"&&!SIZES.includes(size))throw Error("invalid_canary_size");
 const validated=rows.map((row,i)=>{
   const id=kind==="sizes"?"da:whatsapp:size:"+SIZES[i]:"da:whatsapp:basket:"+size+":"+(i+1);
   const title=kind==="sizes"?"Cesta "+LABELS[i]:"Combinação "+(i+1);
   const desc=clean(row?.description,72);
   if(row?.id!==id||row?.title!==title||!desc||String(row.description).trim().length>72)throw Error("invalid_canary_row");
   if(!/\bR\$\s*\d/.test(desc))throw Error("invalid_canary_price");
   return {id,title,description:desc};
 });
 return {kind,interactive:{type:"list",
  header:{type:"text",text:kind==="sizes"?"Cestas Dona Antônia":"Cesta "+LABELS[SIZES.indexOf(size)]},
  body:{text:kind==="sizes"?"Escolha o tamanho de cesta básica. Temos três combinações de marcas para cada tamanho.":"Selecione a combinação. Depois você poderá trocar marcas, retirar itens e alterar quantidades."},
  footer:{text:"Teste interno 1018 | Preços sujeitos à confirmação"},
  action:{button:kind==="sizes"?"Escolher cesta":"Ver combinações",sections:[{title:kind==="sizes"?"Tamanhos de cestas":"Opções de marcas",rows:validated}]}
 }};
}
async function sha256(value){
 const bytes=new TextEncoder().encode(JSON.stringify(value)),hash=await crypto.subtle.digest("SHA-256",bytes);
 return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
async function claimAndSend(payload,requestId,pre){
 const outgoing={messaging_product:"whatsapp",recipient_type:"individual",to:DIGITS,type:"interactive",interactive:payload.interactive};
 const claim=await db.from(TABLE).insert({
  request_id:requestId,sender_account_id:pre.accountId,conversation_id:pre.conversationId,
  recipient_e164:RECIPIENT,kind:payload.kind,payload_hash:await sha256(outgoing),status:"claimed"
 });
 if(claim.error){
  if(claim.error.code==="23505")return {ok:false,error:"already_sent_or_attempted_today",http:409};
  return {ok:false,error:"canary_audit_unavailable",http:503};
 }
 let status="uncertain",providerId=null,errorCode="meta_transport_uncertain";
 try{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),11000);
   let response;
   try{
     response=await fetch("https://graph.facebook.com/"+VERSION+"/"+pre.phoneNumberId+"/messages",{
       method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+TOKEN},
       body:JSON.stringify(outgoing),signal:controller.signal
     });
   }finally{clearTimeout(timer);}
   const data=await response.json().catch(()=>({}));
   if(response.ok&&typeof data?.messages?.[0]?.id==="string"&&data.messages[0].id){
     status="sent";providerId=data.messages[0].id;errorCode=null;
   }else{status=response.status>=500?"uncertain":"failed";errorCode="meta_status_"+response.status;}
 }catch(error){errorCode=error instanceof Error&&error.name==="AbortError"?"meta_timeout_uncertain":"meta_transport_uncertain";}
 const update=await db.from(TABLE).update({
   status,provider_message_id:providerId,error_code:errorCode,completed_at:new Date().toISOString()
 }).eq("request_id",requestId).eq("status","claimed");
 if(update.error)return {ok:false,error:"canary_audit_update_uncertain",http:503};
 return status==="sent"?{ok:true,status:"accepted",request_id:requestId,provider:"meta",kind:payload.kind}:
   {ok:false,error:errorCode,uncertain:status==="uncertain",http:502};
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
 if(!["GET","POST"].includes(req.method))return json(req,{ok:false,error:"method_not_allowed"},405);
 if(!BASE||!KEY)return json(req,{ok:false,error:"server_not_configured"},503);
 try{
  const a=await adminAuth(req);if(!a.ok)return json(req,{ok:false,error:a.error},a.status);
  const pre=await preflight();
  if(req.method==="GET"){
    const q=await db.from(TABLE).select("kind,status,created_at").eq("sender_account_id",pre.accountId||"00000000-0000-4000-8000-000000000000").eq("recipient_e164",RECIPIENT).eq("date_utc",new Date().toISOString().slice(0,10)).limit(5);
    return json(req,{ok:true,can_send:pre.ok&&a.role!=="viewer"&&!q.error,reason:pre.reason,window_until:pre.windowUntil,recipient_suffix:"8360",outbound:"1018",sent_today:q.data||[],catalog_linked:false,transport:"meta"});
  }
  if(a.role==="viewer")return json(req,{ok:false,error:"admin_write_required"},403);
  if(!pre.ok)return json(req,{ok:false,error:pre.reason},409);
  const raw=await req.text();if(raw.length>6500)return json(req,{ok:false,error:"payload_too_large"},413);
  const body=JSON.parse(raw||"{}"),requestId=uuid(body.request_id);
  if(!requestId)return json(req,{ok:false,error:"invalid_idempotency_key"},400);
  const payload=safeInteractive(body);
  const result=await claimAndSend(payload,requestId,pre);
  return json(req,result,result.ok?200:result.http||409);
 }catch(error){
  const code=error instanceof SyntaxError?"invalid_json":error instanceof Error?error.message:"internal_error";
  const known=code.startsWith("invalid_canary")||code==="invalid_json";
  if(!known)console.error("admin-whatsapp-1018-canary-v1",code);
  return json(req,{ok:false,error:known?code:"internal_error"},known?400:500);
 }
});
