import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const ALLOWED_ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const ALLOWED_SOURCE_HOSTS=new Set(["raw.githubusercontent.com","ssbesxgaijknwsjbsbcz.supabase.co","donaantonia.com.br","www.donaantonia.com.br"]);
const cors=(origin:string|null)=>({
  ...(origin&&ALLOWED_ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),
  "Access-Control-Allow-Headers":"apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Vary":"Origin"
});
const json=(body:unknown,status=200,origin:string|null=null)=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(v:unknown,max=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const uuid=(v:unknown)=>{const x=clean(v,80);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x)?x:""};
const safeSourceUrl=(v:unknown)=>{try{const u=new URL(clean(v,1800));return u.protocol==="https:"&&ALLOWED_SOURCE_HOSTS.has(u.hostname)?u.toString():""}catch{return""}};
const ISSUE_STATUSES=["error","rejected","source_rejected","needs_reprocess"];
const PRODUCT_FIELDS="id,name,sku,gtin,image_url,image_source_url,image_source_origin,image_ai_url,image_ai_status,image_ai_error,image_ai_validation,image_ai_processed_at,image_ai_ignored,image_ai_admin_note,image_ai_admin_updated_at,updated_at";

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json({ok:false,error:"origin_not_allowed"},403,null);
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405,origin);

  const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!service)return json({ok:false,error:"server_config"},500,origin);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth=req.headers.get("authorization")||"",token=auth.replace(/^Bearer\s+/i,"").trim();
  if(!token)return json({ok:false,error:"admin_session_required"},401,origin);
  const {data:userData,error:userError}=await sb.auth.getUser(token),user=userData?.user;
  if(userError||!user)return json({ok:false,error:"admin_session_invalid"},401,origin);
  const {data:admin,error:adminError}=await sb.from("admin_users").select("role,is_active").eq("user_id",user.id).eq("is_active",true).maybeSingle();
  if(adminError||!admin||!["owner","admin"].includes(String(admin.role||"")))return json({ok:false,error:"admin_forbidden"},403,origin);

  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400,origin)}
  const action=clean(body?.action||"status",60).toLowerCase();
  const respond=(payload:unknown,status=200)=>json(payload,status,origin);

  async function queueProduct(productId:string,mode:"individual"|"batch"="individual"){
    const {data:p,error:pe}=await sb.from("products").select("id,image_url,image_source_url,image_ai_status,image_ai_ignored").eq("id",productId).maybeSingle();
    if(pe||!p)return{ok:false,error:"product_not_found"};
    if(String(p.image_ai_status||"")==="processing")return{ok:false,error:"product_processing"};
    const source=clean(p.image_source_url||p.image_url,1800);
    if(!source)return{ok:false,error:"source_required"};
    const now=new Date().toISOString();
    const {data:job,error:je}=await sb.from("product_image_jobs").select("id,status").eq("product_id",productId).maybeSingle();
    if(je)return{ok:false,error:"job_lookup_failed",detail:clean(je.message,240)};
    const patch={status:"pending",force_individual:mode==="individual",attempts:0,grid_attempts:0,last_batch_id:null,error_message:null,processed_at:null,started_at:null,updated_at:now};
    if(job){
      if(String(job.status)==="processing")return{ok:false,error:"job_processing"};
      const q=await sb.from("product_image_jobs").update(patch).eq("id",job.id);
      if(q.error)return{ok:false,error:"job_update_failed",detail:clean(q.error.message,240)};
    }else{
      const q=await sb.from("product_image_jobs").insert({product_id:productId,source_image_url:source,...patch});
      if(q.error)return{ok:false,error:"job_create_failed",detail:clean(q.error.message,240)};
    }
    const pq=await sb.from("products").update({image_ai_status:"pending",image_ai_error:null,image_ai_ignored:false,image_ai_admin_updated_at:now,updated_at:now}).eq("id",productId);
    if(pq.error)return{ok:false,error:"product_queue_failed",detail:clean(pq.error.message,240)};
    return{ok:true,product_id:productId,mode};
  }

  if(action==="status"){
    const [control,completed,rejected,processing,pending,neverProcessed,problems,ignored,jobsProcessing,jobsPending,batches,results,neverRows,problemRows,pendingRows,ignoredRows]=await Promise.all([
      sb.rpc("admin_product_image_automation_control_v1",{p_action:"status",p_enabled:null,p_interval_minutes:null}),
      sb.from("products").select("id",{count:"exact",head:true}).eq("image_ai_status","completed").eq("image_ai_ignored",false),
      sb.from("products").select("id",{count:"exact",head:true}).in("image_ai_status",["rejected","source_rejected"]).eq("image_ai_ignored",false),
      sb.from("products").select("id",{count:"exact",head:true}).eq("image_ai_status","processing").eq("image_ai_ignored",false),
      sb.from("products").select("id",{count:"exact",head:true}).eq("image_ai_status","pending").eq("image_ai_ignored",false),
      sb.from("products").select("id",{count:"exact",head:true}).is("image_ai_status",null).eq("image_ai_ignored",false),
      sb.from("products").select("id",{count:"exact",head:true}).in("image_ai_status",ISSUE_STATUSES).eq("image_ai_ignored",false),
      sb.from("products").select("id",{count:"exact",head:true}).eq("image_ai_ignored",true),
      sb.from("product_image_jobs").select("id",{count:"exact",head:true}).eq("status","processing"),
      sb.from("product_image_jobs").select("id",{count:"exact",head:true}).eq("status","pending"),
      sb.from("product_image_batches").select("id,status,mode,generation_cost_usd,accepted_count,fallback_count,failed_count,created_at,processed_at,error_message").eq("mode","grid_3x6_18").order("created_at",{ascending:false}).limit(10),
      sb.from("products").select(PRODUCT_FIELDS).not("image_ai_status","is",null).order("updated_at",{ascending:false}).limit(30),
      sb.from("products").select(PRODUCT_FIELDS).is("image_ai_status",null).eq("image_ai_ignored",false).order("updated_at",{ascending:false}).limit(100),
      sb.from("products").select(PRODUCT_FIELDS).in("image_ai_status",ISSUE_STATUSES).eq("image_ai_ignored",false).order("updated_at",{ascending:false}).limit(100),
      sb.from("products").select(PRODUCT_FIELDS).eq("image_ai_status","pending").eq("image_ai_ignored",false).order("updated_at",{ascending:false}).limit(100),
      sb.from("products").select(PRODUCT_FIELDS).eq("image_ai_ignored",true).order("image_ai_admin_updated_at",{ascending:false,nullsFirst:false}).limit(100)
    ]);
    const failures=[control.error,completed.error,rejected.error,processing.error,pending.error,neverProcessed.error,problems.error,ignored.error,jobsProcessing.error,jobsPending.error,batches.error,results.error,neverRows.error,problemRows.error,pendingRows.error,ignoredRows.error].filter(Boolean);
    if(failures.length)return respond({ok:false,error:"status_failed",detail:clean((failures[0] as any)?.message,300)},500);
    return respond({ok:true,control:control.data||{},stats:{completed:completed.count||0,rejected:rejected.count||0,processing:processing.count||0,pending:pending.count||0,not_processed:neverProcessed.count||0,problems:problems.count||0,ignored:ignored.count||0,jobs_processing:jobsProcessing.count||0,jobs_pending:jobsPending.count||0},batches:batches.data||[],results:results.data||[],triage:{unprocessed:neverRows.data||[],problems:problemRows.data||[],pending:pendingRows.data||[],ignored:ignoredRows.data||[]}});
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
  if(action==="retry_product"||action==="requeue_product"){
    const productId=uuid(body?.product_id);if(!productId)return respond({ok:false,error:"invalid_product_id"},400);
    const mode=body?.mode==="batch"?"batch":"individual",q=await queueProduct(productId,mode);
    if(!q.ok)return respond(q,q.error==="product_not_found"?404:q.error?.includes("processing")?409:400);
    const {data:dispatch}=await sb.rpc("dispatch_product_image_grid18_worker_v1");
    return respond({ok:true,...q,dispatch:dispatch||null});
  }
  if(action==="replace_source"){
    const productId=uuid(body?.product_id);if(!productId)return respond({ok:false,error:"invalid_product_id"},400);
    const source=safeSourceUrl(body?.source_url);if(!source)return respond({ok:false,error:"invalid_source_url"},400);
    const note=clean(body?.note,1000)||null,now=new Date().toISOString();
    const {data:p,error:pe}=await sb.from("products").select("id,image_ai_status").eq("id",productId).maybeSingle();
    if(pe||!p)return respond({ok:false,error:"product_not_found"},404);
    if(String(p.image_ai_status||"")==="processing")return respond({ok:false,error:"product_processing"},409);
    const u=await sb.from("products").update({image_source_url:source,image_source_origin:"admin_manual_override",image_source_verified_at:null,image_source_sha256:null,image_source_width:null,image_source_height:null,image_ai_admin_note:note,image_ai_admin_updated_at:now,image_ai_ignored:false,updated_at:now}).eq("id",productId);
    if(u.error)return respond({ok:false,error:"source_update_failed",detail:clean(u.error.message,300)},500);
    const mode=body?.mode==="batch"?"batch":"individual",q=await queueProduct(productId,mode);
    if(!q.ok)return respond(q,400);
    const {data:dispatch}=await sb.rpc("dispatch_product_image_grid18_worker_v1");
    return respond({ok:true,...q,source_url:source,dispatch:dispatch||null});
  }
  if(action==="save_note"){
    const productId=uuid(body?.product_id);if(!productId)return respond({ok:false,error:"invalid_product_id"},400);
    const note=clean(body?.note,1000)||null,now=new Date().toISOString();
    const q=await sb.from("products").update({image_ai_admin_note:note,image_ai_admin_updated_at:now,updated_at:now}).eq("id",productId).select("id").maybeSingle();
    if(q.error||!q.data)return respond({ok:false,error:"note_save_failed",detail:clean(q.error?.message||"product_not_found",300)},q.data?500:404);
    return respond({ok:true,product_id:productId});
  }
  if(action==="ignore_product"){
    const productId=uuid(body?.product_id);if(!productId)return respond({ok:false,error:"invalid_product_id"},400);
    const {data:p,error:pe}=await sb.from("products").select("id,image_ai_status").eq("id",productId).maybeSingle();
    if(pe||!p)return respond({ok:false,error:"product_not_found"},404);
    if(String(p.image_ai_status||"")==="processing")return respond({ok:false,error:"product_processing"},409);
    const {data:job}=await sb.from("product_image_jobs").select("id,status").eq("product_id",productId).maybeSingle();
    if(job&&String(job.status)==="processing")return respond({ok:false,error:"job_processing"},409);
    const now=new Date().toISOString(),note=clean(body?.note,1000)||null;
    const pq=await sb.from("products").update({image_ai_ignored:true,image_ai_admin_note:note,image_ai_admin_updated_at:now,updated_at:now}).eq("id",productId);
    if(pq.error)return respond({ok:false,error:"ignore_failed",detail:clean(pq.error.message,300)},500);
    if(job&&["pending","error","rejected"].includes(String(job.status||"")))await sb.from("product_image_jobs").update({status:"rejected",error_message:"ignored_by_admin",processed_at:now,updated_at:now}).eq("id",job.id);
    return respond({ok:true,product_id:productId});
  }
  if(action==="restore_product"){
    const productId=uuid(body?.product_id);if(!productId)return respond({ok:false,error:"invalid_product_id"},400);
    const now=new Date().toISOString();
    const q=await sb.from("products").update({image_ai_ignored:false,image_ai_admin_updated_at:now,updated_at:now}).eq("id",productId).select("id").maybeSingle();
    if(q.error||!q.data)return respond({ok:false,error:"restore_failed",detail:clean(q.error?.message||"product_not_found",300)},q.data?500:404);
    const mode=body?.mode==="individual"?"individual":"batch",queued=await queueProduct(productId,mode);
    if(!queued.ok)return respond(queued,400);
    return respond({ok:true,...queued});
  }
  if(action==="bulk_retry"){
    const filter=clean(body?.filter,30),mode=body?.mode==="individual"?"individual":"batch";
    let query=sb.from("products").select("id").eq("image_ai_ignored",false).limit(50);
    if(filter==="unprocessed")query=query.is("image_ai_status",null);else if(filter==="problems")query=query.in("image_ai_status",ISSUE_STATUSES);else return respond({ok:false,error:"invalid_bulk_filter"},400);
    const {data:rows,error}=await query;if(error)return respond({ok:false,error:"bulk_lookup_failed",detail:clean(error.message,300)},500);
    let queued=0,skipped=0;const errors:Record<string,number>={};
    for(const row of rows||[]){const q=await queueProduct(String(row.id),mode);if(q.ok)queued++;else{skipped++;const k=String(q.error||"unknown");errors[k]=(errors[k]||0)+1;}}
    const {data:dispatch}=queued?await sb.rpc("dispatch_product_image_grid18_worker_v1"):{data:null};
    return respond({ok:true,filter,mode,queued,skipped,errors,dispatch:dispatch||null,limit:50});
  }
  return respond({ok:false,error:"unknown_action"},400);
});
