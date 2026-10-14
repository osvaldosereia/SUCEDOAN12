import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {provision1018MetaFlowDraft} from "../_shared/ana-1018-meta-flow-provision-v1.mjs";
import draft from "./meta-flow-intent-draft.json" with {type:"json"};
import {fetch1018CanonicalStorefront} from "../_shared/ana-1018-storefront-bridge-v1.mjs";
import {map1018CanonicalProducts} from "../_shared/ana-1018-canonical-product-preview-v1.mjs";
import {map1018CanonicalBaskets} from "../_shared/ana-1018-canonical-basket-preview-v1.mjs";
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
 return reply(req,{ok:false,error:"pilot_write_locked_until_secure_auth"},423);
});
