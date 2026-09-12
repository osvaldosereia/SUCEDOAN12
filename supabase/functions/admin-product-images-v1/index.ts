import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const ALLOWED_ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(origin:string|null)=>({
  ...(origin&&ALLOWED_ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),
  "Access-Control-Allow-Headers":"apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Vary":"Origin"
});
const json=(body:unknown,status=200,origin:string|null=null)=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(v:unknown,max=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const uuid=(v:unknown)=>{const x=clean(v,80);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x)?x:""};

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json({ok:false,error:"origin_not_allowed"},403,null);
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405,origin);

  const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!service)return json({ok:false,error:"server_config"},500,origin);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth=req.headers.get("authorization")||"";
  const token=auth.replace(/^Bearer\s+/i,"").trim();
  if(!token)return json({ok:false,error:"admin_session_required"},401,origin);
  const {data:userData,error:userError}=await sb.auth.getUser(token);
  const user=userData?.user;
  if(userError||!user)return json({ok:false,error:"admin_session_invalid"},401,origin);
  const {data:admin,error:adminError}=await sb.from("admin_users").select("role,is_active").eq("user_id",user.id).eq("is_active",true).maybeSingle();
  if(adminError||!admin||!['owner','admin'].includes(String(admin.role||'')))return json({ok:false,error:"admin_forbidden"},403,origin);

  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400,origin)}
  const action=clean(body?.action||"status",60).toLowerCase();
  const respond=(payload:unknown,status=200)=>json(payload,status,origin);

  if(action==="status"){
    const [control,completed,rejected,processing,pending,jobsProcessing,jobsPending,batches,results]=await Promise.all([
      sb.rpc("admin_product_image_automation_control_v1",{p_action:"status",p_enabled:null,p_interval_minutes:null}),
      sb.from("products").select("id",{count:"exact",head:true}).eq("image_ai_status","completed"),
      sb.from("products").select("id",{count:"exact",head:true}).in("image_ai_status",["rejected","source_rejected"]),
      sb.from("products").select("id",{count:"exact",head:true}).eq("image_ai_status","processing"),
      sb.from("products").select("id",{count:"exact",head:true}).eq("image_ai_status","pending"),
      sb.from("product_image_jobs").select("id",{count:"exact",head:true}).eq("status","processing"),
      sb.from("product_image_jobs").select("id",{count:"exact",head:true}).eq("status","pending"),
      sb.from("product_image_batches").select("id,status,mode,generation_cost_usd,accepted_count,fallback_count,failed_count,created_at,processed_at,error_message").eq("mode","grid_3x6_18").order("created_at",{ascending:false}).limit(10),
      sb.from("products").select("id,name,image_url,image_ai_url,image_ai_status,image_ai_error,image_ai_validation,image_ai_cost_usd,image_ai_validation_cost_usd,image_ai_processed_at,updated_at").not("image_ai_status","is",null).order("updated_at",{ascending:false}).limit(30)
    ]);
    const failures=[control.error,completed.error,rejected.error,processing.error,pending.error,jobsProcessing.error,jobsPending.error,batches.error,results.error].filter(Boolean);
    if(failures.length)return respond({ok:false,error:"status_failed",detail:clean((failures[0] as any)?.message,300)},500);
    return respond({ok:true,control:control.data||{},stats:{completed:completed.count||0,rejected:rejected.count||0,processing:processing.count||0,pending:pending.count||0,jobs_processing:jobsProcessing.count||0,jobs_pending:jobsPending.count||0},batches:batches.data||[],results:results.data||[]});
  }
  if(action==="run_now"){
    const {data,error}=await sb.rpc("dispatch_product_image_grid18_worker_v1");
    if(error)return respond({ok:false,error:"dispatch_failed",detail:clean(error.message,300)},500);
    return respond({ok:true,dispatch:data});
  }
  if(action==="configure"){
    const enabled=body?.enabled===true,interval=Number(body?.interval_minutes);
    if(![1,3,5,10,15,30,60].includes(interval))return respond({ok:false,error:"invalid_interval"},400);
    const {data,error}=await sb.rpc("admin_product_image_automation_control_v1",{p_action:"configure",p_enabled:enabled,p_interval_minutes:interval});
    if(error)return respond({ok:false,error:"configure_failed",detail:clean(error.message,300)},500);
    return respond({ok:true,control:data});
  }
  if(action==="retry_product"){
    const productId=uuid(body?.product_id);if(!productId)return respond({ok:false,error:"invalid_product_id"},400);
    const {data:product,error:productError}=await sb.from("products").select("id,image_ai_status").eq("id",productId).maybeSingle();
    if(productError||!product)return respond({ok:false,error:"product_not_found"},404);
    if(!["rejected","source_rejected"].includes(String(product.image_ai_status||"")))return respond({ok:false,error:"product_not_rejected"},409);
    const now=new Date().toISOString();
    const {data:job,error:jobError}=await sb.from("product_image_jobs").select("id").eq("product_id",productId).maybeSingle();
    if(jobError||!job)return respond({ok:false,error:"job_not_found"},404);
    const j=await sb.from("product_image_jobs").update({status:"pending",force_individual:true,attempts:0,error_message:null,processed_at:null,started_at:null,updated_at:now}).eq("id",job.id);
    if(j.error)return respond({ok:false,error:"retry_failed",detail:clean(j.error.message,300)},500);
    const p=await sb.from("products").update({image_ai_status:"pending",image_ai_error:null,updated_at:now}).eq("id",productId);
    if(p.error)return respond({ok:false,error:"retry_product_update_failed",detail:clean(p.error.message,300)},500);
    const {data:dispatch}=await sb.rpc("dispatch_product_image_grid18_worker_v1");
    return respond({ok:true,product_id:productId,dispatch:dispatch||null});
  }
  return respond({ok:false,error:"unknown_action"},400);
});
