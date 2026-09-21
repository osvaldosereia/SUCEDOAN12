import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.112.3';
import {
  TerminalError,arr,clean,resolveTrustedSource,sha256Text,
} from './source.mjs';
import {
  MODEL,VALIDATOR_MODEL,composeSheet,cropCell,generateGrid,generationCost,
  prepareCell,proratedGenerationUsage,inspectSource,validateGenerated,
} from './image.mjs';
import {
  PIPELINE_VERSION,sourceRecoverableForGrid,
} from './policy.mjs';
import {findReplacementSource} from './research.mjs';

const PROJECT_HOST='ssbesxgaijknwsjbsbcz.supabase.co';
const PUBLIC_BUCKET='product-images';
const BATCH_BUCKET='product-image-batches';
const STAGE_CHUNK=6;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const extFor=t=>t==='image/png'?'png':t==='image/jpeg'?'jpg':'webp';

async function upload(sb,bucket,path,bytes,{contentType='image/webp',upsert=false}={}){
  const q=await sb.storage.from(bucket).upload(path,bytes,{contentType,cacheControl:'31536000',upsert});
  if(q.error)throw new Error(`storage_${clean(q.error.message,180)}`);
  return path;
}
async function download(sb,bucket,path){
  const q=await sb.storage.from(bucket).download(path);
  if(q.error||!q.data)throw new Error(`storage_download_${clean(q.error?.message||'missing',180)}`);
  return new Uint8Array(await q.data.arrayBuffer());
}
async function persistExternalSource(sb,product,source){
  const ext=extFor(source.type),path=`sources/grid18/v2/${product.id}/${source.sha256}.${ext}`;
  await upload(sb,PUBLIC_BUCKET,path,source.bytes,{contentType:source.type,upsert:true});
  const url=sb.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
  return{...source,url,field:'storage.researched_source',origin:'web_research_verified_v2'};
}
async function persistSource(sb,product,source,jobId,itemId,isFiller=false){
  const now=new Date().toISOString();
  const aspect=source.width&&source.height?Number((source.width/source.height).toFixed(4)):null;
  let q=await sb.from('products').update({
    image_source_url:source.url,image_source_origin:source.origin,
    image_source_width:source.width||null,image_source_height:source.height||null,
    image_source_sha256:source.sha256,image_source_verified_at:now,
    image_ai_validation:{source_inspection:source.inspection||{}},
  }).eq('id',product.id);
  if(q.error)throw new Error(`source_product_${clean(q.error.message,150)}`);
  if(!isFiller){
    q=await sb.from('product_image_jobs').update({
      source_original_url:source.url,source_origin:source.origin,source_used_url:source.url,
      source_field:source.field,source_width:source.width||null,source_height:source.height||null,
      source_aspect_ratio:aspect,source_sha256:source.sha256,updated_at:now,
    }).eq('id',jobId);
    if(q.error)throw new Error(`source_job_${clean(q.error.message,150)}`);
  }
  q=await sb.from('product_image_batch_items').update({
    source_url:source.url,source_origin:source.origin,source_sha256:source.sha256,
    source_width:source.width||null,source_height:source.height||null,updated_at:now,
  }).eq('id',itemId);
  if(q.error)throw new Error(`source_item_${clean(q.error.message,150)}`);
}

async function activeBatch(sb){
  const q=await sb.from('product_image_batches').select('*').eq('mode','grid_3x6_18')
    .in('status',['processing','prepared','generated']).order('created_at',{ascending:true}).limit(1).maybeSingle();
  if(q.error)throw new Error(`batch_lookup_${clean(q.error.message,150)}`);
  return q.data||null;
}
async function loadItems(sb,batchId){
  const q=await sb.from('product_image_batch_items').select('*').eq('batch_id',batchId).order('position');
  if(q.error)throw new Error(`items_${clean(q.error.message,150)}`);
  return arr(q.data);
}
async function loadProducts(sb,ids){
  if(!ids.length)return new Map();
  const q=await sb.from('products').select('id,name,brand,packaging,gtin,sku,image_url,image_original_url,image_firebase_source_url,image_source_url,image_source_origin,image_ai_status,image_ai_attempts,image_ai_pipeline_version,is_active').in('id',ids);
  if(q.error)throw new Error(`products_${clean(q.error.message,150)}`);
  return new Map(arr(q.data).map(p=>[String(p.id),p]));
}
async function attemptsFor(sb,jobId){
  const q=await sb.from('product_image_jobs').select('attempts').eq('id',jobId).maybeSingle();
  return Number(q.data?.attempts||0);
}
async function requeueWithoutConsumingAttempt(sb,item,errorMessage=null){
  const attempts=await attemptsFor(sb,item.job_id);
  await sb.from('product_image_jobs').update({
    status:'pending',attempts:Math.max(0,attempts-1),force_individual:false,grid_attempts:0,
    error_message:errorMessage,started_at:null,processed_at:null,updated_at:new Date().toISOString(),
  }).eq('id',item.job_id);
}

async function releaseBatchForMember(sb,batch,items,bad,message){
  const now=new Date().toISOString();
  for(const item of items){
    const filler=item.is_filler===true;
    const isBad=String(item.id)===String(bad.id);
    await sb.from('product_image_batch_items').update({
      status:'error',error_message:isBad?message:'grid18_v2_released_for_batch_member',updated_at:now,
    }).eq('id',item.id);
    if(filler)continue;
    if(isBad){
      const attempts=await attemptsFor(sb,item.job_id),terminal=attempts>=3;
      await sb.from('product_image_jobs').update({
        status:terminal?'rejected':'pending',force_individual:false,grid_attempts:0,
        error_message:message,processed_at:terminal?now:null,updated_at:now,
      }).eq('id',item.job_id);
      const update={
        image_ai_status:terminal?'rejected':'source_rejected',
        image_ai_error:terminal?`manual_review:${message}`:message,updated_at:now,
      };
      await sb.from('products').update(update).eq('id',item.product_id);
    }else{
      await requeueWithoutConsumingAttempt(sb,item,null);
      await sb.from('products').update({image_ai_status:'pending',image_ai_error:null,updated_at:now}).eq('id',item.product_id);
    }
  }
  await sb.from('product_image_batches').update({
    status:'error',error_message:message,failed_count:1,processed_at:now,updated_at:now,
  }).eq('id',batch.id);
}

async function technicalReset(sb,batch,items,message){
  const now=new Date().toISOString();
  for(const item of items.filter(i=>['processing','prepared'].includes(i.status))){
    await sb.from('product_image_batch_items').update({status:'error',error_message:message,updated_at:now}).eq('id',item.id);
    if(item.is_filler===true)continue;
    await requeueWithoutConsumingAttempt(sb,item,message);
    await sb.from('products').update({image_ai_status:'pending',image_ai_error:message,updated_at:now}).eq('id',item.product_id);
  }
  await sb.from('product_image_batches').update({
    status:'error',error_message:message,failed_count:items.length,processed_at:now,updated_at:now,
  }).eq('id',batch.id);
}

async function ensureBatch(sb){
  let b=await activeBatch(sb);
  if(b)return b;
  const c=await sb.rpc('claim_product_image_grid18_batch_v2');
  if(c.error)throw new Error(`claim_${clean(c.error.message,150)}`);
  const row=arr(c.data)[0];
  if(!row)return null;
  const q=await sb.from('product_image_batches').select('*').eq('id',row.batch_id).single();
  if(q.error)throw new Error(`claimed_batch_${clean(q.error.message,150)}`);
  return q.data;
}

async function bestSource(sb,supabaseUrl,key,product){
  let source=null,inspection=null;
  const forceResearch=product.image_ai_status==='source_rejected';
  if(!forceResearch){
    try{
      source=await resolveTrustedSource(supabaseUrl,PROJECT_HOST,product);
      const checked=await inspectSource(key,product,source);
      inspection=checked.inspection;
      if(checked.accepted)return{...source,inspection};
    }catch(e){
      if(e instanceof TerminalError||String(e instanceof Error?e.message:e).startsWith('source_'))source=null;
      else throw e;
    }
  }
  const researched=await findReplacementSource(key,product,source?.url||'');
  if(researched.found&&researched.source){
    const trusted=await persistExternalSource(sb,product,researched.source);
    return{...trusted,inspection:researched.source.inspection};
  }
  if(source&&sourceRecoverableForGrid(inspection)){
    return{...source,inspection,origin:`${source.origin||'source'}_recoverable_cleanup_v2`};
  }
  throw new TerminalError(researched.reason||`clean_source_not_found:${clean(inspection?.critical_issue,100)}`);
}

async function prepareOne(sb,supabaseUrl,key,batch,item,product){
  if(!product)return{ok:false,item,error:'product_not_found'};
  if(product.is_active!==true)return{ok:false,item,product,error:'product_inactive'};
  try{
    const source=await bestSource(sb,supabaseUrl,key,product);
    await persistSource(sb,product,source,String(item.job_id),String(item.id),item.is_filler===true);
    const cell=await prepareCell(source);
    const path=`grid18/v2/prepared/${batch.id}/p${String(item.position).padStart(2,'0')}.png`;
    await upload(sb,BATCH_BUCKET,path,cell,{contentType:'image/png',upsert:true});
    const now=new Date().toISOString();
    await sb.from('product_image_batch_items').update({
      prepared_storage_path:path,prepared_width:400,prepared_height:400,prepared_at:now,
      status:'prepared',error_message:null,updated_at:now,
    }).eq('id',item.id);
    return{ok:true,item,product,result:{position:item.position,ok:true,filler:item.is_filler===true,source_origin:source.origin}};
  }catch(e){
    return{ok:false,item,product,error:clean(e instanceof Error?e.message:e,260)};
  }
}

async function prepareStage(sb,supabaseUrl,key,batch,items){
  const todo=items.filter(i=>i.status==='processing'&&!i.prepared_storage_path).slice(0,STAGE_CHUNK);
  if(!todo.length){
    await sb.from('product_image_batches').update({status:'prepared',updated_at:new Date().toISOString()}).eq('id',batch.id);
    return{stage:'prepared',prepared:18};
  }
  const products=await loadProducts(sb,todo.map(i=>String(i.product_id)));
  const outcomes=await Promise.all(todo.map(item=>prepareOne(sb,supabaseUrl,key,batch,item,products.get(String(item.product_id)))));
  const failed=outcomes.find(x=>!x.ok);
  if(failed){
    await releaseBatchForMember(sb,batch,items,failed.item,failed.error);
    return{stage:'error',error:failed.error,product_id:failed.product?.id||failed.item.product_id};
  }
  const q=await sb.from('product_image_batch_items').select('id',{count:'exact',head:true}).eq('batch_id',batch.id).eq('status','prepared');
  const n=Number(q.count||0);
  if(n===18)await sb.from('product_image_batches').update({status:'prepared',updated_at:new Date().toISOString()}).eq('id',batch.id);
  return{stage:n===18?'prepared':'preparing',prepared:n,processed:outcomes.length,results:outcomes.map(x=>x.result)};
}

async function generateStage(sb,key,batch,items){
  try{
    if(items.length!==18)throw new Error('grid18_requires_exactly_18_items');
    const cells=[];
    for(const item of items){
      if(!item.prepared_storage_path)throw new Error(`missing_prepared_${item.position}`);
      cells.push(await download(sb,BATCH_BUCKET,item.prepared_storage_path));
    }
    const sheet=await composeSheet(cells);
    const inputPath=`grid18/v2/input/${batch.id}.png`;
    await upload(sb,BATCH_BUCKET,inputPath,sheet,{contentType:'image/png',upsert:true});
    const generated=await generateGrid(key,sheet);
    const gridPath=`grid18/v2/output/${batch.id}.webp`;
    await upload(sb,BATCH_BUCKET,gridPath,generated.bytes,{contentType:'image/webp',upsert:true});
    const cost=generationCost(generated.usage),now=new Date().toISOString();
    await sb.from('product_image_batches').update({
      status:'generated',quality:'medium',input_storage_path:inputPath,input_url:null,
      grid_storage_path:gridPath,grid_url:null,openai_usage:generated.usage,
      generation_cost_usd:cost,updated_at:now,
    }).eq('id',batch.id);
    return{stage:'generated',generation_cost_usd:cost,request_id:generated.requestId,size:'2400x1200',quality:'medium'};
  }catch(e){
    const message=clean(e instanceof Error?e.message:e,260);
    await technicalReset(sb,batch,items,message);
    return{stage:'error',error:message};
  }
}

async function failGeneratedItem(sb,batch,item,product,crop,check){
  const now=new Date().toISOString();
  const reason=check?.validation?.critical_issue||'grid18_v2_validation_rejected';
  const path=`grid18/v2/rejected/${product.id}/${batch.id}-p${item.position}.webp`;
  await upload(sb,BATCH_BUCKET,path,crop,{contentType:'image/webp',upsert:true});
  const attempts=await attemptsFor(sb,item.job_id),terminal=attempts>=3;
  await sb.from('product_image_batch_items').update({
    crop_storage_path:path,crop_url:null,validation:check.validation,validation_usage:check.usage,
    status:'error',error_message:reason,updated_at:now,
  }).eq('id',item.id);
  await sb.from('product_image_jobs').update({
    status:terminal?'rejected':'pending',force_individual:false,grid_attempts:0,model:MODEL,
    validation:check.validation,validation_usage:check.usage,output_storage_path:path,output_url:null,
    error_message:terminal?`manual_review:${reason}`:reason,processed_at:terminal?now:null,updated_at:now,
  }).eq('id',item.job_id);
  await sb.from('products').update({
    image_source_url:null,image_source_origin:'invalidated_after_grid18_v2_validation',
    image_source_sha256:null,image_source_verified_at:null,
    image_ai_status:terminal?'rejected':'source_rejected',
    image_ai_error:terminal?`manual_review:${reason}`:reason,image_ai_validation:check.validation,
    image_ai_model:MODEL,image_ai_pipeline_version:null,updated_at:now,
  }).eq('id',product.id);
  return{position:item.position,name:product.name,accepted:false,terminal,validation:check.validation};
}

async function validateOne(sb,supabaseUrl,key,batch,item,product,grid,shared){
  if(!product){
    await sb.from('product_image_batch_items').update({status:'error',error_message:'product_not_found'}).eq('id',item.id);
    return{position:item.position,error:'product_not_found'};
  }
  if(item.is_filler===true){
    await sb.from('product_image_batch_items').update({status:'completed',validation:{filler:true},updated_at:new Date().toISOString()}).eq('id',item.id);
    return{position:item.position,filler:true,accepted:true};
  }
  try{
    if(product.is_active!==true){
      const now=new Date().toISOString();
      await sb.from('product_image_batch_items').update({status:'error',error_message:'product_inactive',updated_at:now}).eq('id',item.id);
      await sb.from('product_image_jobs').update({status:'rejected',force_individual:false,error_message:'product_inactive',processed_at:now,updated_at:now}).eq('id',item.job_id);
      await sb.from('products').update({image_ai_status:'error',image_ai_error:'product_inactive',updated_at:now}).eq('id',product.id);
      return{position:item.position,accepted:false,error:'product_inactive'};
    }
    const source=await resolveTrustedSource(supabaseUrl,PROJECT_HOST,product);
    const crop=await cropCell(grid,item.position);
    const check=await validateGenerated(key,source,crop);
    const now=new Date().toISOString();
    if(!check.accepted)return failGeneratedItem(sb,batch,item,product,crop,check);
    const path=`openai/grid18/v2/final/${product.id}/${batch.id}-p${item.position}.webp`;
    await upload(sb,PUBLIC_BUCKET,path,crop,{contentType:'image/webp',upsert:false});
    const url=sb.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
    await sb.from('product_image_batch_items').update({
      crop_storage_path:path,crop_url:url,validation:check.validation,validation_usage:check.usage,
      status:'completed',error_message:null,updated_at:now,
    }).eq('id',item.id);
    await sb.from('product_image_jobs').update({
      status:'completed',force_individual:false,model:MODEL,openai_usage:shared,
      validation:check.validation,validation_usage:check.usage,output_storage_path:path,
      output_url:url,error_message:null,processed_at:now,updated_at:now,
    }).eq('id',item.job_id);
    await sb.from('products').update({
      image_url:url,image_original_url:source.url,image_ai_url:url,image_ai_status:'completed',
      image_ai_error:null,image_ai_validation:check.validation,image_ai_model:MODEL,
      image_ai_processed_at:now,image_ai_attempts:Number(product.image_ai_attempts||0)+1,
      image_ai_pipeline_version:PIPELINE_VERSION,updated_at:now,
    }).eq('id',product.id);
    return{position:item.position,name:product.name,accepted:true,url,validation:check.validation};
  }catch(e){
    const reason=clean(e instanceof Error?e.message:e,260);
    const attempts=await attemptsFor(sb,item.job_id),terminal=attempts>=3,now=new Date().toISOString();
    await sb.from('product_image_batch_items').update({status:'error',error_message:reason,updated_at:now}).eq('id',item.id);
    await sb.from('product_image_jobs').update({
      status:terminal?'rejected':'pending',force_individual:false,grid_attempts:0,
      error_message:reason,processed_at:terminal?now:null,updated_at:now,
    }).eq('id',item.job_id);
    await sb.from('products').update({
      image_ai_status:terminal?'rejected':'source_rejected',
      image_ai_error:terminal?`manual_review:${reason}`:reason,image_ai_pipeline_version:null,updated_at:now,
    }).eq('id',product.id);
    return{position:item.position,accepted:false,terminal,error:reason};
  }
}

async function validateStage(sb,supabaseUrl,key,batch,items){
  const todo=items.filter(i=>i.status==='prepared').slice(0,STAGE_CHUNK);
  if(!todo.length){
    const fresh=await loadItems(sb,batch.id);
    const accepted=fresh.filter(i=>i.status==='completed'&&i.is_filler!==true).length;
    const failed=fresh.filter(i=>i.status==='error').length;
    const status=failed?'partial':'completed',now=new Date().toISOString();
    await sb.from('product_image_batches').update({status,accepted_count:accepted,failed_count:failed,fallback_count:0,processed_at:now,updated_at:now}).eq('id',batch.id);
    return{stage:status,accepted,failed};
  }
  const grid=await download(sb,BATCH_BUCKET,batch.grid_storage_path);
  const products=await loadProducts(sb,todo.map(i=>String(i.product_id)));
  const shared=proratedGenerationUsage(batch.openai_usage||{},18);
  const out=await Promise.all(todo.map(item=>validateOne(sb,supabaseUrl,key,batch,item,products.get(String(item.product_id)),grid,shared)));
  const rem=await sb.from('product_image_batch_items').select('id',{count:'exact',head:true}).eq('batch_id',batch.id).eq('status','prepared');
  if(Number(rem.count||0)===0){
    const fresh=await loadItems(sb,batch.id);
    const accepted=fresh.filter(i=>i.status==='completed'&&i.is_filler!==true).length;
    const failed=fresh.filter(i=>i.status==='error').length;
    const status=failed?'partial':'completed',now=new Date().toISOString();
    await sb.from('product_image_batches').update({status,accepted_count:accepted,failed_count:failed,fallback_count:0,processed_at:now,updated_at:now}).eq('id',batch.id);
    return{stage:status,accepted,failed,processed:out.length,results:out};
  }
  return{stage:'validating',remaining:Number(rem.count||0),processed:out.length,results:out};
}

async function advance(sb,supabaseUrl,key){
  const batch=await ensureBatch(sb);
  if(!batch)return{processed:0,reason:'no_grid18_work'};
  const items=await loadItems(sb,batch.id);
  if(items.length!==18){
    await technicalReset(sb,batch,items,'grid18_batch_not_complete');
    return{stage:'error',error:'grid18_batch_not_complete'};
  }
  if(batch.status==='processing')return prepareStage(sb,supabaseUrl,key,batch,items);
  if(batch.status==='prepared')return generateStage(sb,key,batch,items);
  if(batch.status==='generated')return validateStage(sb,supabaseUrl,key,batch,items);
  return{stage:batch.status};
}

async function maintainSupabaseCatalog(sb){
  const activeResult=await sb.from('products').select('id',{count:'exact',head:true}).eq('is_active',true);
  if(activeResult.error)throw new Error(`product_maintenance_read_${clean(activeResult.error.message,140)}`);
  const enq=await sb.rpc('enqueue_product_image_jobs_v3',{p_limit:500});
  if(enq.error)throw new Error(`enqueue_v3_${clean(enq.error.message,180)}`);
  return{source:'supabase',active_products:Number(activeResult.count||0),enqueued:Number(enq.data||0)};
}

async function authorized(sb,supplied){
  if(!supplied)return false;
  const s=await sb.from('system_secrets').select('key_hash,is_active').eq('key_name','product_image_worker_webhook_v1').maybeSingle();
  return !s.error&&s.data?.is_active&&(await sha256Text(supplied))===s.data.key_hash;
}

Deno.serve(async req=>{
  if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
  const supabaseUrl=Deno.env.get('SUPABASE_URL')||'',serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!supabaseUrl||!serviceKey)return json({ok:false,error:'server_config'},500);
  const sb=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  if(!(await authorized(sb,req.headers.get('x-da-product-image-key')||'')))return json({ok:false,error:'unauthorized'},401);
  let body={};try{body=await req.json();}catch{return json({ok:false,error:'invalid_json'},400);}
  if(body?.event==='healthcheck')return json({ok:true,pipeline_version:PIPELINE_VERSION,model:MODEL,validator_model:VALIDATOR_MODEL,grid:'3x6/18',individual_generation:false,stage_chunk:STAGE_CHUNK,product_source:'supabase_only'});
  if(body?.event==='fallback')return json({ok:false,error:'individual_generation_disabled',pipeline_version:PIPELINE_VERSION},409);
  if(!['advance','maintenance'].includes(body?.event))return json({ok:false,error:'unknown_event'},400);

  const lock=await sb.rpc('try_acquire_product_image_worker_v2');
  if(lock.error)return json({ok:false,error:`worker_lock_${clean(lock.error.message,160)}`},500);
  const token=lock.data?String(lock.data):'';
  if(!token)return json({ok:true,processed:0,reason:'worker_busy',pipeline_version:PIPELINE_VERSION});

  try{
    let key=Deno.env.get('OPENAI_API_KEY')||'';
    if(!key){try{const q=await sb.rpc('get_conversation_worker_provider_secret_v1');if(typeof q.data==='string')key=q.data;}catch{}}
    if(body?.event==='maintenance'){
      const result=await maintainSupabaseCatalog(sb);
      return json({ok:true,event:'maintenance',pipeline_version:PIPELINE_VERSION,...result});
    }
    if(!key)return json({ok:false,error:'openai_key_missing'},500);
    const result=await advance(sb,supabaseUrl,key);
    return json({ok:true,event:'advance',pipeline_version:PIPELINE_VERSION,...result});
  }catch(e){
    return json({ok:false,error:clean(e instanceof Error?e.message:e,260),pipeline_version:PIPELINE_VERSION},500);
  }finally{
    try{await sb.rpc('release_product_image_worker_v2',{p_token:token});}catch{}
  }
});
