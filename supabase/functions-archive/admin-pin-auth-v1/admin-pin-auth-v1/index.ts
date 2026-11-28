import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS=new Set([
  "https://donaantonia.com.br",
  "https://www.donaantonia.com.br"
]);
const cors=(origin:string)=>({
  "Access-Control-Allow-Origin":ALLOWED_ORIGINS.has(origin)?origin:"https://donaantonia.com.br",
  "Access-Control-Allow-Headers":"apikey,content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Vary":"Origin",
});
const json=(origin:string,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=200)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g,"").trim().slice(0,max);

Deno.serve(async(req:Request)=>{
  const origin=clean(req.headers.get("origin"),200);
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
  if(req.method!=="POST")return json(origin,{ok:false,error:"method_not_allowed"},405);
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json(origin,{ok:false,error:"origin_not_allowed"},403);

  const url=Deno.env.get("SUPABASE_URL")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!service)return json(origin,{ok:false,error:"server_config"},500);

  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:owner,error:ownerError}=await sb.from("admin_users").select("user_id").eq("role","owner").eq("is_active",true).limit(1).maybeSingle();
  if(ownerError||!owner?.user_id)return json(origin,{ok:false,error:"owner_unavailable"},500);

  const {data:userData,error:userError}=await sb.auth.admin.getUserById(owner.user_id);
  const email=userData?.user?.email;
  if(userError||!email)return json(origin,{ok:false,error:"owner_auth_unavailable"},500);

  const {data:link,error:linkError}=await sb.auth.admin.generateLink({type:"magiclink",email,options:{redirectTo:"https://donaantonia.com.br/vitrine/admin/"}});
  const tokenHash=link?.properties?.hashed_token;
  if(linkError||!tokenHash)return json(origin,{ok:false,error:"session_bootstrap_failed"},500);

  const exchange=new URL(req.url).searchParams.get("exchange")==="1";
  if(!exchange)return json(origin,{ok:true,token_hash:tokenHash,verification_type:"email",passwordless:true},200);

  const {data:verified,error:verifyError}=await sb.auth.verifyOtp({token_hash:tokenHash,type:"email"});
  const accessToken=verified?.session?.access_token||"";
  if(verifyError||!accessToken)return json(origin,{ok:false,error:"session_exchange_failed"},500);
  return json(origin,{
    ok:true,
    access_token:accessToken,
    expires_at:verified.session?.expires_at||null,
    passwordless:true,
  },200);
});
