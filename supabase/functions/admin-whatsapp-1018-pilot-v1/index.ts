import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {provision1018MetaFlowDraft} from "../_shared/ana-1018-meta-flow-provision-v1.mjs";
import draft from "./meta-flow-intent-draft.json" with {type:"json"};
import {fetch1018CanonicalStorefront} from "../_shared/ana-1018-storefront-bridge-v1.mjs";
import {map1018CanonicalProducts} from "../_shared/ana-1018-canonical-product-preview-v1.mjs";
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
   const preview=await fetch1018CanonicalStorefront({action:"offers",baseUrl:url+"/functions/v1/storefront-v2"});
   if(!preview.ok)return reply(req,{ok:false,error:preview.reason},503);
   const mapped=map1018CanonicalProducts({payload:preview.data,limit:20});
   if(!mapped.ok)return reply(req,{ok:false,error:mapped.reason},503);
   return reply(req,{ok:true,channel:"1018",source:"storefront-v2",read_only:true,offers:mapped.rows});
  }
  if(action!=="status")return reply(req,{ok:false,error:"invalid_action"},400);
  return reply(req,{ok:true,channel:"1018",deployment:"pilot_only",flow_published:false,
   flow_submitted:false,live_activation:false,flow_json:draft});
 }
 const body=await req.json().catch(()=>({}));
 if(body?.action!=="submit_draft"||Object.keys(body).some((key:string)=>key!=="action"))
  return reply(req,{ok:false,error:"invalid_action"},400);
 // Explicit owner action: Meta draft creation only. Never publish or send.
 if(Deno.env.get("WHATSAPP_1018_META_DRAFT_PROVISION_ENABLED")!=="true")
  return reply(req,{ok:false,error:"provision_not_enabled"},409);
 if(!token||!version)return reply(req,{ok:false,error:"meta_not_configured"},503);
 const result=await provision1018MetaFlowDraft({enabled:true,account:account.data,
  expectedAccountId:account.data.id,accessToken:token,graphVersion:version,draft});
 return reply(req,result,result.ok?200:409);
});
