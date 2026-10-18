import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

// P0: a public Origin header is not authentication. Never return a service-issued
// magic-link token hash or an owner access token to an unauthenticated request.
const ROOT="https://ssbesxgaijknwsjbsbcz.supabase.co";
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const REDIRECT="https://www.donaantonia.com.br/vitrine/admin/";
const headers=(origin:string)=>({
  "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br",
  "Access-Control-Allow-Headers":"apikey,authorization,content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Vary":"Origin","Cache-Control":"no-store",
  "Content-Type":"application/json; charset=utf-8",
});
const answer=(origin:string,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:headers(origin)});
const safe=(v:unknown,max=200)=>String(v??"").trim().slice(0,max);
const ip=(r:Request)=>safe((r.headers.get("cf-connecting-ip")||r.headers.get("x-real-ip")||
  r.headers.get("x-forwarded-for")||"unknown").split(",")[0],120);

Deno.serve(async(req:Request)=>{
  const origin=safe(req.headers.get("origin"),200);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
  if(req.method!=="POST")return answer(origin,{ok:false,error:"method_not_allowed"},405);
  if(origin&&!ORIGINS.has(origin))return answer(origin,{ok:false,error:"origin_not_allowed"},403);

  const url=Deno.env.get("SUPABASE_URL")||ROOT;
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!key)return answer(origin,{ok:false,error:"server_config"},503);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  let input:Record<string,unknown>={};
  try{input=await req.json()}catch{return answer(origin,{ok:false,error:"invalid_json"},400)}
  const action=safe(input?.action,32);

  if(action==="validate"){
    const bearer=safe(req.headers.get("Authorization"),4096).replace(/^Bearer\s+/i,"");
    if(!bearer)return answer(origin,{ok:false,error:"authentication_required"},401);
    const u=await db.auth.getUser(bearer);
    if(u.error||!u.data?.user?.id)return answer(origin,{ok:false,error:"invalid_session"},401);
    const a=await db.from("admin_users").select("role,is_active").eq("user_id",u.data.user.id).maybeSingle();
    if(a.error||a.data?.is_active!==true)return answer(origin,{ok:false,error:"not_authorized"},403);
    return answer(origin,{ok:true,role:a.data.role});
  }

  if(action!=="request_login"&&action!=="verify_login")
    return answer(origin,{ok:false,error:"legacy_credential_exchange_retired"},403);

  // Independent IP and global quotas; no body-supplied identity is trusted.
  const kind=action==="request_login"?"request":"verify";
  const limits=kind==="request"?{ip:3,global:24}:{ip:8,global:100};
  const [a,b]=await Promise.all([
    db.rpc("consume_public_rate_limit",{p_rate_key:"p0-admin-auth-"+kind+":ip:"+ip(req),p_bucket:"admin_login",p_limit:limits.ip,p_window_seconds:3600}),
    db.rpc("consume_public_rate_limit",{p_rate_key:"p0-admin-auth-"+kind+":global",p_bucket:"admin_login",p_limit:limits.global,p_window_seconds:3600}),
  ]);
  if(a.error||b.error)return answer(origin,{ok:false,error:"rate_limit_unavailable"},503);
  if(a.data!==true||b.data!==true)return answer(origin,{ok:false,error:"rate_limited"},429);

  const owner=await db.from("admin_users").select("user_id").eq("role","owner").eq("is_active",true).limit(1).maybeSingle();
  if(owner.error||!owner.data?.user_id)return answer(origin,{ok:false,error:"admin_unavailable"},503);
  const user=await db.auth.admin.getUserById(owner.data.user_id);
  const email=safe(user.data?.user?.email,254);
  if(user.error||!email)return answer(origin,{ok:false,error:"admin_unavailable"},503);

  if(action==="request_login"){
    const sent=await db.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:REDIRECT}});
    if(sent.error){console.error("admin_auth_email_delivery_failed",safe(sent.error.code,80));return answer(origin,{ok:false,error:"email_delivery_unavailable"},503)}
    return answer(origin,{ok:true,delivery:"email",message:"Use o e-mail da conta proprietária para entrar."});
  }

  const token=safe(input?.code,12).replace(/\s/g,"");
  if(!/^\d{6,8}$/.test(token))return answer(origin,{ok:false,error:"invalid_code"},400);
  const v=await db.auth.verifyOtp({email,token,type:"email"});
  if(v.error||!v.data?.session?.access_token||v.data.user?.id!==owner.data.user_id)
    return answer(origin,{ok:false,error:"invalid_code"},401);
  return answer(origin,{ok:true,access_token:v.data.session.access_token,
    refresh_token:v.data.session.refresh_token,expires_at:v.data.session.expires_at});
});
