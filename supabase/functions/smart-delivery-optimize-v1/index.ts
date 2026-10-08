import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { buildGoogleOptimizeToursRequest, readGoogleOptimizedOrder } from "../_shared/smart-delivery-google-adapter.mjs";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const GOOGLE_PROJECT_ID=Deno.env.get("GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID")||"";
const GOOGLE_ACCESS_TOKEN=Deno.env.get("GOOGLE_ROUTE_OPTIMIZATION_ACCESS_TOKEN")||"";
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const uuid=(v:unknown)=>{const s=String(v||"");return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:""};

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return json({ok:false,error:"method_not_allowed"},405);
  if(!U||!K) return json({ok:false,error:"supabase_not_configured"},500);
  if(!GOOGLE_PROJECT_ID||!GOOGLE_ACCESS_TOKEN) return json({ok:false,error:"google_route_optimization_not_configured"},503);

  let body:any={};
  try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const runId=uuid(body?.run_id);
  if(!runId) return json({ok:false,error:"invalid_run_id"},400);

  const {data:prepared,error:prepareError}=await db.rpc("smart_delivery_prepare_optimization_v1",{p_run_id:runId});
  if(prepareError) return json({ok:false,error:"prepare_failed",detail:prepareError.message},409);

  const stops=(prepared?.stops||[]).map((s:any)=>({id:String(s.id),lat:Number(s.lat),lng:Number(s.lng)}));
  const serviceDate=String(prepared?.service_date||"");
  const startTime=body?.start_time||serviceDate+"T08:00:00-04:00";
  const endTime=body?.end_time||serviceDate+"T18:00:00-04:00";
  let googleRequest;
  try{googleRequest=buildGoogleOptimizeToursRequest(stops,{startTime,endTime})}
  catch(e){return json({ok:false,error:"invalid_route_model",detail:String(e?.message||e)},422)}

  let googleResponse:any;
  try{
    const response=await fetch("https://routeoptimization.googleapis.com/v1/projects/"+encodeURIComponent(GOOGLE_PROJECT_ID)+":optimizeTours",{
      method:"POST",
      headers:{"authorization":"Bearer "+GOOGLE_ACCESS_TOKEN,"content-type":"application/json"},
      body:JSON.stringify(googleRequest),
      signal:AbortSignal.timeout(25000)
    });
    googleResponse=await response.json().catch(()=>({}));
    if(!response.ok) return json({ok:false,error:"google_optimizer_failed",status:response.status},502);
  }catch(e){return json({ok:false,error:"google_optimizer_unreachable",detail:String(e?.message||e)},502)}

  let stopIds:string[];
  try{stopIds=readGoogleOptimizedOrder(googleResponse,stops)}
  catch(e){return json({ok:false,error:"unsafe_optimizer_result",detail:String(e?.message||e)},422)}

  const result={
    fingerprint:prepared.fingerprint,
    provider:"google_route_optimization",
    job_ref:crypto.randomUUID(),
    stop_ids:stopIds,
    optimized_at:new Date().toISOString()
  };
  const {data:applied,error:applyError}=await db.rpc("smart_delivery_apply_optimization_v1",{p_run_id:runId,p_result:result});
  if(applyError) return json({ok:false,error:"route_changed_before_apply",detail:applyError.message},409);
  return json({ok:true,run_id:runId,stop_count:stopIds.length,applied});
});
