import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { verifyAdminCode } from "../_shared/admin-code-v1.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ORIGINS = new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br","http://localhost:3000","http://127.0.0.1:3000"]);
function headers(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "Access-Control-Allow-Origin": ORIGINS.has(origin) ? origin : "https://donaantonia.com.br",
    "Access-Control-Allow-Headers":"apikey, authorization, content-type, x-admin-code",
    "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
    "Vary":"Origin",
  };
}
const respond=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:headers(req)});
Deno.serve(async (req: Request) => {
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(req)});
  if(req.method!=="GET"&&req.method!=="POST")return respond(req,{ok:false,error:"method_not_allowed"},405);
  const origin=req.headers.get("origin")||"";
  if(origin&&!ORIGINS.has(origin))return respond(req,{ok:false,error:"origin_not_allowed"},403);
  const authorization=verifyAdminCode(req.headers.get("x-admin-code"));
  if(authorization!=="valid")return respond(req,{ok:false,error:authorization==="not_configured"?"admin_auth_not_configured":"admin_code_invalid"},authorization==="not_configured"?503:401);
  try {
    if(!SUPABASE_URL||!SERVICE_KEY)return respond(req,{ok:false,error:"server_config"},503);
    if(req.method==="GET") {
      const result=await db.rpc("whatsapp_papoai_guard_status_v1");
      if(result.error)throw result.error;
      return respond(req,{ok:true,guard:result.data});
    }
    const length=Number(req.headers.get("content-length")||0);
    if(length>1024)return respond(req,{ok:false,error:"request_too_large"},413);
    const payload=await req.json().catch(()=>({}));
    if(payload.action!=="activate"&&payload.action!=="deactivate")return respond(req,{ok:false,error:"invalid_action"},400);
    const enabled=payload.action==="activate";
    const result=await db.rpc("whatsapp_papoai_guard_set_v1",{p_active:enabled,p_minutes:120});
    if(result.error)throw result.error;
    return respond(req,{ok:true,guard:result.data});
  }catch(error) {
    console.error("whatsapp-papoai-guard-v1:",String(error?.message||error).slice(0,160));
    return respond(req,{ok:false,error:"Não foi possível atualizar a proteção. Verifique a conexão com o Supabase."},503);
  }
});