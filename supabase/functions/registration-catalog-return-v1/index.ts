import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {
  "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://donaantonia.com.br",
  "Vary":"Origin",
  "Access-Control-Allow-Headers":"content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS"
}};
const json=(req:Request,body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const uid=(v:any)=>{const s=String(v??"").trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:""};
async function sha(value:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("")}
function ip(req:Request){for(const v of [req.headers.get("cf-connecting-ip"),String(req.headers.get("x-forwarded-for")||"").split(",")[0],req.headers.get("x-real-ip")]){const s=String(v||"").trim();if(s)return s.slice(0,120)}return "unknown"}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);
  if(!U||!K)return json(req,{ok:false,error:"server_config"},500);

  const body=await req.json().catch(()=>({}));
  const customerId=uid(body?.customer_id),registrationJobId=uid(body?.registration_job_id);
  if(!customerId||!registrationJobId)return json(req,{ok:false,error:"registration_receipt_required"},400);

  const [ipKey,jobKey]=await Promise.all([sha(ip(req)),sha(registrationJobId)]);
  const [a,b]=await Promise.all([
    db.rpc("consume_public_rate_limit",{p_rate_key:"registration-catalog-return:ip:"+ipKey,p_bucket:"registration_catalog_return",p_limit:20,p_window_seconds:600}),
    db.rpc("consume_public_rate_limit",{p_rate_key:"registration-catalog-return:job:"+jobKey,p_bucket:"registration_catalog_return",p_limit:6,p_window_seconds:600})
  ]);
  if(a.error||b.error)return json(req,{ok:false,error:"rate_limit_unavailable"},503);
  if(a.data!==true||b.data!==true)return json(req,{ok:false,error:"rate_limited"},429);

  const r=await db.rpc("ops2_issue_registration_catalog_return_v1",{
    p_customer_id:customerId,
    p_registration_job_id:registrationJobId
  });
  if(r.error)return json(req,{ok:false,error:"catalog_return_unavailable"},503);
  const data=r.data||{};
  if(data.ok!==true){
    const error=String(data.error||"catalog_return_failed");
    const status=["invalid_registration_receipt","registration_receipt_expired"].includes(error)?403:error==="registration_incomplete"?409:400;
    return json(req,{ok:false,error},status);
  }

  return json(req,{
    ok:true,
    catalog_url:data.catalog_url||null,
    catalog_path:data.catalog_path||null,
    catalog_expires_at:data.catalog_expires_at||null,
    conversation_found:data.conversation_found===true,
    whatsapp_return_phone:data.channel_phone_e164||null
  });
});
