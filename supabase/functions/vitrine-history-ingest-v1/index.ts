import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
});
const clean=(v:unknown,max=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max);

async function timingSafeEqual(a:string,b:string){
  const enc=new TextEncoder(),aa=enc.encode(a),bb=enc.encode(b);
  if(aa.length!==bb.length)return false;
  let diff=0;
  for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];
  return diff===0;
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return json({ok:false,error:"server_config"},500);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});

  const supplied=clean(req.headers.get("x-vitrine-history-key"),200);
  if(!supplied)return json({ok:false,error:"unauthorized"},401);
  const secretQ=await sb.from("internal_integration_secrets")
    .select("secret_value")
    .eq("integration_key","vitrine_history_bridge")
    .maybeSingle();
  if(secretQ.error||!secretQ.data?.secret_value)return json({ok:false,error:"bridge_secret_missing"},500);
  if(!(await timingSafeEqual(supplied,String(secretQ.data.secret_value))))return json({ok:false,error:"unauthorized"},401);

  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const payload=body?.payload;
  if(!payload||typeof payload!=="object"||Array.isArray(payload))return json({ok:false,error:"payload_required"},400);

  try{
    const result=await sb.rpc("ingest_vitrine_order_history_v1",{p_payload:payload});
    if(result.error)return json({ok:false,error:"ingest_failed",detail:clean(result.error.message,500)},500);
    if(result.data?.ok!==true)return json(result.data||{ok:false,error:"ingest_failed"},400);
    return json(result.data);
  }catch(e){
    return json({ok:false,error:"ingest_failed",detail:clean((e as Error)?.message,500)},500);
  }
});
