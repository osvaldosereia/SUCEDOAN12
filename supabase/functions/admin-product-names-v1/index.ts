import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const ALLOWED_ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const JOB_STATUSES=new Set(["queued","processing","applied","unchanged","review","error","skipped"]);
const cors=(origin:string|null)=>({
  ...(origin&&ALLOWED_ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),
  "Access-Control-Allow-Headers":"apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Vary":"Origin"
});
const json=(body:unknown,status=200,origin:string|null=null)=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(v:unknown,max=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const safeSearch=(v:unknown,max=100)=>clean(v,max).replace(/[,%()]/g," ").trim();
const appendNote=(current:unknown,note:string)=>[clean(current,3500),note].filter(Boolean).join(" · ").slice(0,4000);

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json({ok:false,error:"origin_not_allowed"},403,null);
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405,origin);

  const url=Deno.env.get("SUPABASE_URL");
  const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!serviceRole)return json({ok:false,error:"server_config"},500,origin);
  const sb=createClient(url,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});

  let body:any={};
  try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400,origin)}
  const action=clean(body?.action||"health",80).toLowerCase();
  const respond=(payload:unknown,status=200)=>json(payload,status,origin);

  if(action==="health")return respond({ok:true,version:1,mode:"admin_product_names"});

  if(action==="product_name_normalization"){
    const q=safeSearch(body?.q);
    const requestedStatus=clean(body?.status,30).toLowerCase();
    const status=JOB_STATUSES.has(requestedStatus)?requestedStatus:"";
    const limit=Math.min(100,Math.max(20,Number.parseInt(String(body?.limit??80),10)||80));

    const statusKeys=["queued","processing","applied","unchanged","review","error","skipped"] as const;
    const [statusCounts,totalProductsResult,runsResult,reviewsResult,recentResult]=await Promise.all([
      Promise.all(statusKeys.map(async(status)=>{
        const result=await sb.from("product_name_normalization_jobs").select("id",{count:"exact",head:true}).eq("status",status);
        return {status,count:result.count||0,error:result.error};
      })),
      sb.from("products").select("id",{count:"exact",head:true}),
      sb.from("product_name_normalization_runs").select("id,normalization_version,model,batch_size,processed,applied,unchanged,review,failed,ean_lookups,batch_input_tokens,batch_output_tokens,batch_total_tokens,ean_input_tokens,ean_output_tokens,ean_total_tokens,metadata,started_at,finished_at").order("started_at",{ascending:false}).limit(12),
      sb.from("product_name_normalization_jobs").select("id,product_id,normalization_version,original_name,proposed_name,status,confidence,identity_preserved,used_ean_lookup,ean_lookup_reason,model,explanation,issues,error,claimed_at,processed_at,applied_at,created_at,updated_at,response_snapshot,product:products(id,name,gtin,brand,packaging,image_url,category)").eq("status","review").order("updated_at",{ascending:false}).limit(40),
      sb.from("product_name_normalization_jobs").select("id,product_id,normalization_version,original_name,proposed_name,status,confidence,identity_preserved,used_ean_lookup,ean_lookup_reason,model,explanation,issues,error,claimed_at,processed_at,applied_at,created_at,updated_at,response_snapshot,product:products(id,name,gtin,brand,packaging,image_url,category)").in("status",["applied","unchanged","review","error","skipped"]).order("updated_at",{ascending:false}).limit(80)
    ]);

    const countError=statusCounts.find(row=>row.error)?.error;
    if(countError)return respond({ok:false,error:"normalization_counts_failed",detail:countError.message},400);
    if(totalProductsResult.error)return respond({ok:false,error:"normalization_products_count_failed",detail:totalProductsResult.error.message},400);
    if(runsResult.error)return respond({ok:false,error:"normalization_runs_failed",detail:runsResult.error.message},400);
    if(reviewsResult.error)return respond({ok:false,error:"normalization_reviews_failed",detail:reviewsResult.error.message},400);
    if(recentResult.error)return respond({ok:false,error:"normalization_recent_failed",detail:recentResult.error.message},400);

    const counts:{[key:string]:number}={queued:0,processing:0,applied:0,unchanged:0,review:0,error:0,skipped:0};
    for(const row of statusCounts)counts[row.status]=row.count;
    const totalProducts=totalProductsResult.count||0;
    const tracked=statusCounts.reduce((sum,row)=>sum+row.count,0);
    counts.untracked=Math.max(0,totalProducts-tracked);
    counts.total_products=totalProducts;
    counts.tracked_jobs=tracked;

    let jobsQuery=sb.from("product_name_normalization_jobs").select("id,product_id,normalization_version,original_name,proposed_name,status,confidence,identity_preserved,used_ean_lookup,ean_lookup_reason,model,explanation,issues,error,claimed_at,processed_at,applied_at,created_at,updated_at,response_snapshot,product:products(id,name,gtin,brand,packaging,image_url,category)").order("updated_at",{ascending:false}).limit(limit);
    if(status)jobsQuery=jobsQuery.eq("status",status);
    if(q){
      const productMatches=await sb.from("products").select("id").or(`name.ilike.%${q}%,gtin.ilike.%${q}%,brand.ilike.%${q}%`).limit(100);
      const ids=(productMatches.data||[]).map((row:any)=>row.id).filter(Boolean);
      const clauses=[`original_name.ilike.%${q}%`,`proposed_name.ilike.%${q}%`,`explanation.ilike.%${q}%`];
      if(ids.length)clauses.push(`product_id.in.(${ids.join(",")})`);
      jobsQuery=jobsQuery.or(clauses.join(","));
    }
    const jobsResult=await jobsQuery;
    if(jobsResult.error)return respond({ok:false,error:"normalization_jobs_failed",detail:jobsResult.error.message},400);

    return respond({
      ok:true,
      generated_at:new Date().toISOString(),
      counts,
      jobs:jobsResult.data||[],
      review_jobs:reviewsResult.data||[],
      recent_jobs:recentResult.data||[],
      runs:runsResult.data||[]
    });
  }

  if(action==="product_name_normalization_review"){
    const jobId=clean(body?.job_id,80);
    const decision=clean(body?.decision,30).toLowerCase();
    if(!jobId)return respond({ok:false,error:"job_id_required"},400);
    if(!["approve","keep","edit_apply"].includes(decision))return respond({ok:false,error:"invalid_review_decision"},400);

    const {data:job,error:jobError}=await sb.from("product_name_normalization_jobs").select("*").eq("id",jobId).maybeSingle();
    if(jobError||!job)return respond({ok:false,error:"normalization_job_not_found"},404);
    if(job.status!=="review")return respond({ok:false,error:"normalization_job_not_in_review",status:job.status},409);

    const {data:product,error:productError}=await sb.from("products").select("id,name,metadata").eq("id",job.product_id).maybeSingle();
    if(productError||!product)return respond({ok:false,error:"product_not_found"},404);
    const now=new Date().toISOString();
    const responseSnapshot=job.response_snapshot&&typeof job.response_snapshot==="object"?job.response_snapshot:{};

    if(decision==="keep"){
      const note=`[Admin ${now}] Nome atual mantido manualmente.`;
      const {error}=await sb.from("product_name_normalization_jobs").update({
        status:"skipped",
        processed_at:job.processed_at||now,
        updated_at:now,
        explanation:appendNote(job.explanation,note),
        response_snapshot:{...responseSnapshot,admin_review:{decision:"keep",reviewed_at:now,current_name:product.name}}
      }).eq("id",jobId).eq("status","review");
      if(error)return respond({ok:false,error:"normalization_review_save_failed",detail:error.message},400);
      return respond({ok:true,decision:"keep",product_name:product.name});
    }

    const finalName=clean(decision==="approve"?job.proposed_name:body?.name,180);
    if(!finalName)return respond({ok:false,error:"review_name_required"},400);
    if(product.name!==job.original_name&&product.name!==finalName){
      return respond({ok:false,error:"product_name_changed",current_name:product.name,original_name:job.original_name},409);
    }

    if(product.name!==finalName){
      const metadata=product.metadata&&typeof product.metadata==="object"?product.metadata:{};
      const existing=(metadata as any).product_name_normalization&&typeof (metadata as any).product_name_normalization==="object"?(metadata as any).product_name_normalization:{};
      const nextMetadata={...metadata,product_name_normalization:{...existing,version:job.normalization_version,original_name:job.original_name,normalized_name:finalName,confidence:job.confidence,admin_reviewed_at:now,admin_review_action:decision,source:"admin"}};
      const updateProduct=await sb.from("products").update({name:finalName,metadata:nextMetadata,updated_at:now,last_admin_edit_at:now,last_admin_edit_by:null}).eq("id",job.product_id).eq("name",job.original_name).select("id,name").maybeSingle();
      if(updateProduct.error)return respond({ok:false,error:"product_name_apply_failed",detail:updateProduct.error.message},400);
      if(!updateProduct.data)return respond({ok:false,error:"product_name_changed",current_name:product.name},409);
    }

    const note=`[Admin ${now}] ${decision==="approve"?"Sugestão aprovada":"Nome editado e aplicado"} manualmente.`;
    const {error:updateJobError}=await sb.from("product_name_normalization_jobs").update({
      proposed_name:finalName,
      status:"applied",
      applied_at:now,
      processed_at:job.processed_at||now,
      updated_at:now,
      explanation:appendNote(job.explanation,note),
      response_snapshot:{...responseSnapshot,admin_review:{decision,reviewed_at:now,final_name:finalName}}
    }).eq("id",jobId).eq("status","review");
    if(updateJobError)return respond({ok:false,error:"normalization_review_save_failed",detail:updateJobError.message},400);
    return respond({ok:true,decision,product_name:finalName});
  }

  if(action==="product_name_normalization_process_now"){
    const {data,error}=await sb.rpc("dispatch_product_name_normalizer_v1");
    if(error)return respond({ok:false,error:"normalization_dispatch_failed",detail:error.message},400);
    return respond({ok:true,dispatch:data});
  }

  return respond({ok:false,error:"unknown_action"},400);
});
