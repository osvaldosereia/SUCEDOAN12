import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const ALLOWED_ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const BUCKET="product-images";
const MAX_FILE_BYTES=8_000_000;
const ALLOWED_TYPES=new Set(["image/png","image/jpeg","image/webp"]);
const CORS=(origin:string|null)=>({
  ...(origin&&ALLOWED_ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),
  "Access-Control-Allow-Headers":"apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Vary":"Origin"
});
const respond=(origin:string|null,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS(origin),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(v:unknown,max=1200)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const uuid=(v:unknown)=>{const x=clean(v,80);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x)?x:""};
const fileExt=(type:string)=>type==="image/png"?"png":type==="image/jpeg"?"jpg":"webp";
const defaultPrompt="Refaça esta imagem mantendo exatamente o mesmo produto, embalagem, marca, variante e volume. Use a referência como identidade do produto e aplique o padrão profissional da automação Imagens IA da Dona Antônia.";

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(origin&&!ALLOWED_ORIGINS.has(origin))return respond(null,{ok:false,error:"origin_not_allowed"},403);
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS(origin)});
  if(req.method!=="POST")return respond(origin,{ok:false,error:"method_not_allowed"},405);

  const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!service)return respond(origin,{ok:false,error:"server_config"},500);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});

  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return respond(origin,{ok:false,error:"admin_session_required"},401);
  const {data:userData,error:userError}=await sb.auth.getUser(token),user=userData?.user;
  if(userError||!user)return respond(origin,{ok:false,error:"admin_session_invalid"},401);
  const {data:admin,error:adminError}=await sb.from("admin_users").select("role,is_active").eq("user_id",user.id).eq("is_active",true).maybeSingle();
  if(adminError||!admin||!["owner","admin"].includes(String(admin.role||"")))return respond(origin,{ok:false,error:"admin_forbidden"},403);

  const contentType=req.headers.get("content-type")||"";
  let body:any={},form:FormData|null=null;
  try{
    if(contentType.includes("multipart/form-data")){
      form=await req.formData();
      body={action:form.get("action"),product_id:form.get("product_id"),prompt:form.get("prompt")};
    }else body=await req.json();
  }catch{return respond(origin,{ok:false,error:"invalid_payload"},400)}

  const action=clean(body?.action||"health",60).toLowerCase();
  if(action==="health")return respond(origin,{ok:true,version:1,generator:"product-image-manual-v1"});

  const productId=uuid(body?.product_id);
  if(!productId)return respond(origin,{ok:false,error:"invalid_product_id"},400);

  async function getProduct(){
    const {data,error}=await sb.from("products").select("id,name,is_active,image_url,image_source_url,image_ai_status,image_ai_ignored").eq("id",productId).maybeSingle();
    if(error||!data)return null;
    return data;
  }

  async function remember(imageUrl:unknown,sourceType:string,sourceImageUrl:unknown=null,metadata:Record<string,unknown>={}){
    const image=clean(imageUrl,1800);if(!image)return;
    await sb.from("product_image_versions").insert({product_id:productId,image_url:image,source_type:sourceType,source_image_url:clean(sourceImageUrl,1800)||null,created_by:user.id,metadata});
  }

  async function uploadFile(file:File,folder:string){
    if(!ALLOWED_TYPES.has(file.type))throw new Error("invalid_image_type");
    if(file.size<1||file.size>MAX_FILE_BYTES)throw new Error("invalid_image_size");
    const path=`admin/product-editor/${folder}/${productId}/${Date.now()}-${crypto.randomUUID()}.${fileExt(file.type)}`;
    const bytes=new Uint8Array(await file.arrayBuffer());
    const {error}=await sb.storage.from(BUCKET).upload(path,bytes,{contentType:file.type,cacheControl:"31536000",upsert:false});
    if(error)throw new Error(`upload_failed:${clean(error.message,200)}`);
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async function queueGeneration(product:any,sourceUrl:string,promptInput:unknown){
    if(product.is_active!==true)return{ok:false,error:"product_inactive"};
    if(String(product.image_ai_status||"")==="processing")return{ok:false,error:"product_processing"};
    const source=clean(sourceUrl,1800);if(!source)return{ok:false,error:"source_required"};
    const prompt=clean(promptInput,1200)||defaultPrompt;
    const now=new Date().toISOString();
    const {data:job,error:jobError}=await sb.from("product_image_jobs").select("id,status").eq("product_id",productId).maybeSingle();
    if(jobError)return{ok:false,error:"job_lookup_failed",detail:clean(jobError.message,240)};
    if(job&&String(job.status)==="processing")return{ok:false,error:"job_processing"};
    const patch={status:"pending",force_individual:true,attempts:0,grid_attempts:0,last_batch_id:null,error_message:null,processed_at:null,started_at:null,source_image_url:source,updated_at:now};
    if(job){const q=await sb.from("product_image_jobs").update(patch).eq("id",job.id);if(q.error)return{ok:false,error:"job_update_failed",detail:clean(q.error.message,240)};}
    else{const q=await sb.from("product_image_jobs").insert({product_id:productId,...patch});if(q.error)return{ok:false,error:"job_create_failed",detail:clean(q.error.message,240)};}
    const q=await sb.from("products").update({
      image_source_url:source,
      image_source_origin:"admin_product_editor",
      image_ai_manual_review_required:true,
      image_ai_manual_review_reason:"admin_product_editor",
      image_ai_manual_prompt:prompt,
      image_ai_manual_requested_at:now,
      image_ai_manual_requested_by:user.id,
      image_ai_manual_resolved_at:null,
      image_ai_status:"pending",
      image_ai_error:null,
      image_ai_ignored:false,
      image_ai_admin_updated_at:now,
      updated_at:now
    }).eq("id",productId);
    if(q.error)return{ok:false,error:"product_queue_failed",detail:clean(q.error.message,240)};
    const {data:dispatch,error:dispatchError}=await sb.rpc("dispatch_product_image_manual_worker_v1");
    if(dispatchError)return{ok:false,error:"manual_dispatch_failed",detail:clean(dispatchError.message,240)};
    return{ok:true,queued:true,source_url:source,dispatch:dispatch||null};
  }

  if(action==="history"){
    const {data,error}=await sb.from("product_image_versions").select("id,image_url,source_type,source_image_url,metadata,created_at").eq("product_id",productId).order("created_at",{ascending:false}).limit(20);
    if(error)return respond(origin,{ok:false,error:"history_failed",detail:clean(error.message,240)},400);
    const product=await getProduct();
    return respond(origin,{ok:true,product,versions:data||[]});
  }

  if(action==="generate_current"){
    const product=await getProduct();if(!product)return respond(origin,{ok:false,error:"product_not_found"},404);
    if(!product.image_url)return respond(origin,{ok:false,error:"source_required"},400);
    await remember(product.image_url,"before_generation",product.image_url,{mode:"current"});
    const result=await queueGeneration(product,product.image_url,body?.prompt);
    return respond(origin,result,result.ok?200:409);
  }

  if(action==="restore"){
    const versionId=uuid(body?.version_id);if(!versionId)return respond(origin,{ok:false,error:"invalid_version_id"},400);
    const product=await getProduct();if(!product)return respond(origin,{ok:false,error:"product_not_found"},404);
    const {data:version,error}=await sb.from("product_image_versions").select("id,image_url").eq("id",versionId).eq("product_id",productId).maybeSingle();
    if(error||!version)return respond(origin,{ok:false,error:"version_not_found"},404);
    await remember(product.image_url,"before_restore",version.image_url,{restored_version_id:versionId});
    const now=new Date().toISOString();
    const q=await sb.from("products").update({image_url:version.image_url,image_source_url:version.image_url,image_source_origin:"admin_restore",image_ai_admin_updated_at:now,updated_at:now}).eq("id",productId);
    if(q.error)return respond(origin,{ok:false,error:"restore_failed",detail:clean(q.error.message,240)},400);
    await remember(version.image_url,"restore",version.image_url,{restored_version_id:versionId});
    return respond(origin,{ok:true,image_url:version.image_url});
  }

  if(action==="upload_replace"||action==="upload_generate"){
    const product=await getProduct();if(!product)return respond(origin,{ok:false,error:"product_not_found"},404);
    const file=form?.get("file");
    if(!(file instanceof File))return respond(origin,{ok:false,error:"file_required"},400);
    let uploaded="";
    try{uploaded=await uploadFile(file,action==="upload_replace"?"current":"reference")}catch(e){return respond(origin,{ok:false,error:clean(e instanceof Error?e.message:e,240)},400)}
    if(action==="upload_replace"){
      await remember(product.image_url,"before_manual_replace",uploaded,{filename:clean(file.name,240)});
      const now=new Date().toISOString();
      const q=await sb.from("products").update({image_url:uploaded,image_source_url:uploaded,image_source_origin:"admin_upload",image_ai_admin_updated_at:now,updated_at:now}).eq("id",productId);
      if(q.error)return respond(origin,{ok:false,error:"replace_failed",detail:clean(q.error.message,240)},400);
      await remember(uploaded,"manual_upload",uploaded,{filename:clean(file.name,240)});
      return respond(origin,{ok:true,image_url:uploaded});
    }
    await remember(uploaded,"generation_source_upload",uploaded,{filename:clean(file.name,240)});
    const result=await queueGeneration(product,uploaded,body?.prompt);
    return respond(origin,result,result.ok?200:409);
  }

  return respond(origin,{ok:false,error:"unknown_action"},400);
});
