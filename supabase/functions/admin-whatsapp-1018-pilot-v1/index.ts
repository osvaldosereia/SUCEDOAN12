import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {provision1018MetaFlowDraft} from "../_shared/ana-1018-meta-flow-provision-v1.mjs";
import draft from "./meta-flow-intent-draft.json" with {type:"json"};
import {fetch1018CanonicalStorefront} from "../_shared/ana-1018-storefront-bridge-v1.mjs";
import {map1018CanonicalProducts} from "../_shared/ana-1018-canonical-product-preview-v1.mjs";
import {map1018CanonicalBaskets} from "../_shared/ana-1018-canonical-basket-preview-v1.mjs";
import {quote1018CanonicalCart} from "../_shared/ana-1018-canonical-cart-quote-v1.mjs";
import {prepare1018CheckoutConfirmation} from "../_shared/ana-1018-checkout-confirmation-v1.mjs";
import {build1018CanonicalOrderPayload} from "../_shared/ana-1018-canonical-order-payload-v1.mjs";
const url=Deno.env.get("SUPABASE_URL")||"";
const service=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const token=Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")||"";
const version=Deno.env.get("META_WHATSAPP_GRAPH_VERSION")||"";
const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const headers=(req:Request)=>({"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
 "Access-Control-Allow-Origin":origins.has(req.headers.get("origin")||"")?req.headers.get("origin")!:"https://www.donaantonia.com.br",
 "Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"});
const reply=(req:Request,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:headers(req)});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(req)});
 if(!["GET","POST"].includes(req.method))return reply(req,{ok:false,error:"method_not_allowed"},405);
 if(!url||!service)return reply(req,{ok:false,error:"server_config"},503);
 const bearer=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!bearer)return reply(req,{ok:false,error:"auth_required"},401);
 const auth=await db.auth.getUser(bearer);
 if(auth.error||!auth.data.user)return reply(req,{ok:false,error:"auth_invalid"},401);
 const role=await db.from("admin_users").select("role,is_active").eq("user_id",auth.data.user.id).eq("is_active",true).maybeSingle();
 if(role.error||!role.data||role.data.role!=="owner")return reply(req,{ok:false,error:"owner_required"},403);
 const account=await db.from("whatsapp_accounts").select("id,slug,phone_e164,waba_id,is_active")
  .eq("slug","dona-antonia-1018").eq("is_active",true).maybeSingle();
 if(account.error||!account.data||account.data.phone_e164!=="+5565984491018"||!account.data.waba_id)return reply(req,{ok:false,error:"account_1018_unavailable"},503);
 if(req.method==="GET"){
  const action=new URL(req.url).searchParams.get("action")||"status";
  if(action==="catalog_preview"){
   const kind=new URL(req.url).searchParams.get("kind")||"offers";
   if(!["offers","products","baskets"].includes(kind))return reply(req,{ok:false,error:"invalid_catalog_kind"},400);
   const sourceAction=kind==="baskets"?"home":kind;
   const params=kind==="products"?{limit:20}:{};
   const preview=await fetch1018CanonicalStorefront({action:sourceAction,params,baseUrl:url+"/functions/v1/storefront-v2"});
   if(!preview.ok)return reply(req,{ok:false,error:preview.reason},503);
   const mapped=kind==="baskets"?map1018CanonicalBaskets({payload:preview.data,limit:20}):map1018CanonicalProducts({payload:preview.data,limit:20});
   if(!mapped.ok)return reply(req,{ok:false,error:mapped.reason},503);
   return reply(req,{ok:true,channel:"1018",source:"storefront-v2",read_only:true,kind,
    rows:mapped.rows});
  }
  if(action==="delivery_preview"){
   const upstream=await fetch1018CanonicalStorefront({action:"delivery_options",baseUrl:url+"/functions/v1/storefront-v2"});
   if(!upstream.ok||!Array.isArray(upstream.data?.options))return reply(req,{ok:false,error:"delivery_options_unavailable"},503);
   return reply(req,{ok:true,channel:"1018",options:upstream.data.options,time_zone:upstream.data.time_zone,
    read_only:true});
  }
  if(action==="meta_preview"){
   if(!token||!/^v\d+\.\d+$/.test(version))return reply(req,{ok:false,error:"meta_not_configured"},503);
   try{
    const meta=await fetch("https://graph.facebook.com/"+version+"/1646700793791407?fields=preview.invalidate(false)",{headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(12000)});
    const body=await meta.json().catch(()=>({}));
    const link=String(body.preview?.preview_url||"");
    if(!meta.ok||!/^https:\/\/business\.facebook\.com\/wa\/manage\/flows\/1646700793791407\/preview\//.test(link))return reply(req,{ok:false,error:"meta_preview_unavailable"},502);
    return reply(req,{ok:true,channel:"1018",flow_id:"1646700793791407",preview_url:link,expires_at:body.preview?.expires_at||null,live_activation:false});
   }catch{return reply(req,{ok:false,error:"meta_preview_connection_failed"},503)}
  }
  if(action==="meta_status"){
   if(!token||!/^v\d+\.\d+$/.test(version))return reply(req,{ok:false,error:"meta_not_configured"},503);
   try{
    const meta=await fetch("https://graph.facebook.com/"+version+"/1646700793791407?fields=id,name,status,validation_errors",{headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(12000)});
    const body=await meta.json().catch(()=>({}));
    if(!meta.ok)return reply(req,{ok:false,error:"meta_status_unavailable",http_status:meta.status},502);
    return reply(req,{ok:true,channel:"1018",flow_id:String(body.id||""),status:String(body.status||"UNKNOWN"),validation_errors:Array.isArray(body.validation_errors)?body.validation_errors:[],live_activation:false});
   }catch{return reply(req,{ok:false,error:"meta_connection_failed"},503)}
  }
  if(action!=="status")return reply(req,{ok:false,error:"invalid_action"},400);
  return reply(req,{ok:true,channel:"1018",deployment:"pilot_only",flow_id:"1646700793791407",flow_submitted:true,
   live_activation:false,flow_json:draft});
 }
 if(req.method==="POST"){
  const body=await req.json().catch(()=>null);
  if(["preview_cart","preview_checkout","submit_pilot_order"].includes(body?.action)){
   const lines=body.lines,city=body.city;
   if(!Array.isArray(lines)||lines.length<1||lines.length>12||typeof city!=="string")return reply(req,{ok:false,error:"invalid_cart"},400);
   const unique=new Map<string,{kind:string,id:string}>();
   const idPattern=/^[0-9a-f]{8}-[0-9a-f-]{27,28}(?:@[1-6])?$/i;
   for(const line of lines){
    if(!line||!["product","basket"].includes(line.kind)||typeof line.id!=="string"||!idPattern.test(line.id)||!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>30)return reply(req,{ok:false,error:"invalid_item"},400);
    if(line.kind==="product"&&line.id.includes("@"))return reply(req,{ok:false,error:"invalid_item"},400);
    unique.set(line.kind+":"+line.id,{kind:line.kind,id:line.id});
   }
   if(unique.size>8)return reply(req,{ok:false,error:"too_many_items"},400);
   const all=[...unique.values()];
   const source=url+"/functions/v1/storefront-v2";
   const requests=await Promise.all(all.filter(x=>x.kind==="product").map(x=>fetch1018CanonicalStorefront({action:"product",params:{product_id:x.id},baseUrl:source})));
   // Resolve every selected basket against the authoritative detail endpoint, never a cached home snapshot.
   // Mold @1..@6 resolves the exact composition and its conditional hidden adjustment server-side.
   const basketRequests=await Promise.all(all.filter(x=>x.kind==="basket").map(x=>fetch1018CanonicalStorefront({action:"basket",params:{basket_id:x.id},baseUrl:source})));
   if(requests.some(x=>!x.ok)||basketRequests.some(x=>!x.ok))return reply(req,{ok:false,error:"canonical_unavailable"},503);
   const products=new Map(all.filter(x=>x.kind==="product").map((x,i)=>[x.id,requests[i]?.data?.product]));
   const basketDetails=new Map(all.filter(x=>x.kind==="basket").map((x,i)=>[x.id,basketRequests[i]?.data]));
   const baskets=new Map([...basketDetails].map(([id,detail])=>[id,detail?.basket]));
   const catalog=all.map(x=>{
    const p=x.kind==="product"?products.get(x.id):baskets.get(x.id);
    return {key:x.kind+":"+x.id,name:String(p?.name||""),priceCents:x.kind==="product"?p?.price_cents:p?.display_price_cents,
     stock:p?.stock_quantity};
   });
   const preview=quote1018CanonicalCart({lines,catalog,city});
   if(body.action==="preview_checkout"||body.action==="submit_pilot_order"){
    if(!preview.ok)return reply(req,{...preview,source:"storefront-v2",channel:"1018"},409);
    const confirmation=prepare1018CheckoutConfirmation({quote:preview,customer:body.customer,delivery:body.delivery,paymentMethod:body.paymentMethod,customerConfirmed:body.customerConfirmed});
    if(!confirmation.ok)return reply(req,{...confirmation,source:"storefront-v2"},409);
    const delivery=await fetch1018CanonicalStorefront({action:"delivery_options",baseUrl:source});
    if(!delivery.ok)return reply(req,{ok:false,error:"delivery_options_unavailable"},503);
    const date=body.deliveryDate;
    if(!Array.isArray(delivery.data?.options)||!delivery.data.options.some((x:any)=>x.date===date))return reply(req,{ok:false,error:"delivery_date_unavailable"},409);
    const prepared=build1018CanonicalOrderPayload({lines,basketDetails,quote:preview,
     customer:body.customer,delivery:body.delivery,
     paymentMethod:confirmation.confirmation.paymentMethod,deliveryDate:date});
    if(!prepared.ok)return reply(req,{ok:false,error:prepared.reason},409);
    if(body.action==="submit_pilot_order"){
     // No public or Flow-triggered writes. Owner-authenticated explicit opt-in only.
     if(Deno.env.get("WHATSAPP_1018_PILOT_ORDER_WRITES_ENABLED")!=="true")
      return reply(req,{ok:false,error:"pilot_order_writes_disabled"},423);
     const key=String(body.requestKey||"");
     if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))
      return reply(req,{ok:false,error:"request_key_required"},400);
     const encoded=new TextEncoder().encode(JSON.stringify(prepared.payload));
     const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",encoded))).map(b=>b.toString(16).padStart(2,"0")).join("");
     const claim=await db.from("whatsapp_1018_checkout_attempts_v1").insert({
      request_key:key,actor_user_id:auth.data.user.id,payload_hash:digest,status:"processing"
     }).select("id").single();
     if(claim.error){
      if(claim.error.code!=="23505")return reply(req,{ok:false,error:"idempotency_storage_unavailable"},503);
      const existing=await db.from("whatsapp_1018_checkout_attempts_v1")
       .select("payload_hash,status,result").eq("request_key",key).maybeSingle();
      if(existing.error||!existing.data)return reply(req,{ok:false,error:"idempotency_lookup_failed"},503);
      if(existing.data.payload_hash!==digest)return reply(req,{ok:false,error:"request_key_reused"},409);
      if(existing.data.status==="succeeded")return reply(req,{ok:true,replayed:true,order:existing.data.result},200);
      return reply(req,{ok:false,error:"order_attempt_already_started",status:existing.data.status},409);
     }
     let result:any=null,status=503;
     try{
      const upstream=await fetch(source+"?action=submit_order",{
       method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+service,"apikey":service},
       body:JSON.stringify(prepared.payload),signal:AbortSignal.timeout(25000)
      });
      result=await upstream.json().catch(()=>null);status=upstream.status;
      if(!upstream.ok||!result?.ok||!result?.order_id){
       await db.from("whatsapp_1018_checkout_attempts_v1").update({status:"failed",result:{error:String(result?.error||"canonical_order_rejected").slice(0,120)},updated_at:new Date().toISOString()}).eq("id",claim.data.id);
       return reply(req,{ok:false,error:"canonical_order_rejected",reason:result?.error||"unknown"},upstream.ok?409:status);
      }
      const publicResult={order_id:result.order_id,order_number:result.order_number||null,
       order_public_url:result.order_public_url||null,total:result.total||null};
      const saved=await db.from("whatsapp_1018_checkout_attempts_v1").update({status:"succeeded",order_id:result.order_id,
       result:publicResult,updated_at:new Date().toISOString()}).eq("id",claim.data.id);
      if(saved.error)return reply(req,{ok:false,error:"order_created_but_receipt_unavailable",requestKey:key},503);
      return reply(req,{ok:true,orderCreated:true,order:publicResult},200);
     }catch{
      // Fail closed: an upstream timeout might still have created an order. Never retry automatically.
      return reply(req,{ok:false,error:"order_result_uncertain_do_not_retry",requestKey:key},503);
     }
    }
    // Internal owner-only staging; never submit automatically or expose basket adjustments to customers.
    return reply(req,{...confirmation,source:"storefront-v2",canonicalOrderPrepared:true,
     canonicalItemCount:prepared.payload.items.length,deliveryDate:date,
     paymentLabel:prepared.payload.payment_method,
     // No document or hidden basket adjustment is returned in the preview.
     orderCreated:false});
   }
   return reply(req,{...preview,source:"storefront-v2",channel:"1018"},preview.ok?200:409);
  }
 }
 return reply(req,{ok:false,error:"pilot_write_locked_until_secure_auth"},423);
});
