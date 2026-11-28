import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {sendTemplateViaMeta,MetaTransportError} from "../_shared/whatsapp-meta-transport-v1.mjs";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const M=Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")||"";
const VERSION=Deno.env.get("META_WHATSAPP_GRAPH_VERSION")||"v24.0";
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),
  {status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||""));
const money=(v:unknown)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v||0));
const nonce=()=>[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,"0")).join("");
async function hash(token:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
 return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");}

async function done(orderId:string,status:string,nonceHash:string|null=null,order:any=null,providerId:string|null=null,error:string|null=null){
 const response=await db.rpc("ops4_complete_postorder_confirm_send_v1",{
  p_order_id:orderId,p_status:status,p_nonce_hash:nonceHash,
  p_expected_total:status==="sent"?Number(order.total):null,
  p_expected_updated_at:status==="sent"?order.updated_at:null,
  p_provider_message_id:providerId,p_error:error
 });
 if(response.error||response.data!==true)throw Error("confirmation_ledger_update_failed");
}
async function processFollowup(item:any){
 const orderId=String(item.order_id||"");
 if(!uuid(orderId))return {status:"invalid"};
 const r=await db.from("orders").select("id,source,status,confirmed_at,cancelled_at,total,updated_at,order_number,phone_e164")
   .eq("id",orderId).maybeSingle();
 if(r.error)throw Error("order_lookup_failed");
 const order=r.data;
 if(!order||!["vitrine","storefront_v2"].includes(order.source)||
   order.status!=="storefront_received"||order.confirmed_at||order.cancelled_at||
   String(order.phone_e164||"").replace(/\D/g,"")!==String(item.phone_e164||"")){
   await done(orderId,"suppressed",null,null,null,"order_not_pending");
   return {status:"suppressed"};
 }
 const a=await db.from("whatsapp_accounts").select("id,slug,phone_number_id,is_active")
   .eq("id",item.whatsapp_account_id).eq("is_active",true).maybeSingle();
 if(a.error||!a.data||a.data.slug!=="dona-antonia-"+item.channel){
   await done(orderId,"suppressed",null,null,null,"account_unavailable");
   return {status:"suppressed"};
 }
 const templateName="pedidoconfirmacao"+item.channel+"v1";
 const t=await db.from("whatsapp_templates_v1").select("name,status,components")
   .eq("whatsapp_account_id",item.whatsapp_account_id).eq("name",templateName)
   .eq("language","pt_BR").maybeSingle();
 const buttons=Array.isArray(t.data?.components)?
   t.data.components.find((x:any)=>String(x.type||"").toUpperCase()==="BUTTONS")?.buttons:[];
 const validButtons=Array.isArray(buttons)&&
   buttons.length===2&&buttons[0]?.type==="QUICK_REPLY"&&
   buttons[0]?.text==="Confirmar pedido"&&buttons[1]?.type==="QUICK_REPLY"&&
   buttons[1]?.text==="Preciso alterar";
 if(t.error||t.data?.status!=="APPROVED"||!validButtons){
   await done(orderId,"failed",null,null,null,"template_not_approved");
   return {status:"not_approved"};
 }
 const key=nonce();
 const components=[
   {type:"body",parameters:[
     {type:"text",text:String(order.order_number||"Pedido").slice(0,45)},
     {type:"text",text:money(order.total)}]},
   {type:"button",sub_type:"quick_reply",index:"0",parameters:[
     {type:"payload",payload:"DA4:C:"+orderId+":"+key}]},
   {type:"button",sub_type:"quick_reply",index:"1",parameters:[
     {type:"payload",payload:"DA4:E:"+orderId+":"+key}]}
 ];
 try{
   const sent=await sendTemplateViaMeta({
     accessToken:M,phoneNumberId:String(a.data.phone_number_id),
     toE164:String(item.phone_e164),templateName,
     languageCode:"pt_BR",components,graphVersion:VERSION,timeoutMs:15000
   });
   await done(orderId,"sent",await hash(key),order,String(sent.providerMessageId||""));
   return {status:"sent"};
 }catch(error){
   // Never automatically repeat an uncertain Meta send: duplicate confirmation
   // buttons would produce an ambiguous customer experience.
   const code=error instanceof MetaTransportError?error.code:"meta_send_unknown";
   await done(orderId,"failed",null,null,null,code);
   return {status:"failed",code};
 }
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return reply({ok:false,error:"method_not_allowed"},405);
 if(!U||!K||!M)return reply({ok:false,error:"server_not_configured"},503);
 const secret=String(req.headers.get("x-postorder-once")||"");
 if(!/^[a-f0-9]{64}$/.test(secret))return reply({ok:false,error:"unauthorized"},403);
 const claim=await db.rpc("ops4_claim_postorder_dispatch_command_v1",{p_token_hash:await hash(secret)});
 if(claim.error||claim.data!==true)return reply({ok:false,error:"command_invalid"},403);
 try{
   const jobs=await db.rpc("ops4_claim_due_postorder_followups_v1",{p_limit:5});
   if(jobs.error||jobs.data?.ok!==true)throw Error("followup_claim_failed");
   const output:any[]=[];
   for(const item of jobs.data.items||[]){
     try{output.push({order_id:item.order_id,...await processFollowup(item)})}
     catch(error){output.push({order_id:item.order_id,status:"error"});
       try{await done(item.order_id,"failed",null,null,null,"internal_dispatch_error")}catch{}}
   }
   return reply({ok:true,processed:output.length,results:output});
 }catch(error){console.error("postorder_scheduler",String((error as Error)?.message||error).slice(0,140));
   return reply({ok:false,error:"scheduler_unavailable"},503)}
});
