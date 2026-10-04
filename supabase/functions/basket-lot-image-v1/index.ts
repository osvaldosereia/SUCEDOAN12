import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.58.0';
import {IMAGE_MODEL,MAX_IMAGE_BYTES,imageManifest,manifestHash,sourceAllowed,validFinalWebp,backgroundPrompt} from './core.ts';
const sb=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
const BUCKET='basket-images';
const origins=new Set(['https://donaantonia.com.br','https://www.donaantonia.com.br']);
const cors=(req:Request)=>({'Access-Control-Allow-Origin':origins.has(req.headers.get('origin')||'')?req.headers.get('origin')!:'https://donaantonia.com.br','Vary':'Origin','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'});
const json=(req:Request,body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),'Content-Type':'application/json','Cache-Control':'no-store'}});
const id=(v:any)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||''))?String(v):'';
const check=(q:any)=>{if(q.error)throw new Error('database_error');return q.data};
const b64=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)};
const unb64=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function auth(req:Request){
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)throw new Error('admin_auth_required');
  const u=await sb.auth.getUser(token);if(u.error||!u.data.user)throw new Error('admin_auth_required');
  const a=check(await sb.from('admin_users').select('role,is_active').eq('user_id',u.data.user.id).maybeSingle());
  if(!a?.is_active||a.role==='viewer')throw new Error('admin_not_authorized');
  return u.data.user.id;
}
async function snapshot(lotId:string,hygieneId:string|null){
  const lot=check(await sb.from('basket_stock_lots').select('id,basket_id,lot_kind,status,short_code,lot_code').eq('id',lotId).maybeSingle());
  if(!lot||!['ready','depleted'].includes(lot.status))throw new Error('lot_not_mounted');
  const basket=lot.basket_id?check(await sb.from('basket_templates').select('name,uses_hygiene_kit').eq('id',lot.basket_id).maybeSingle()):null;
  const needsHygiene=lot.lot_kind==='food'&&basket?.uses_hygiene_kit===true;
  if(needsHygiene&&!hygieneId)throw new Error('hygiene_lot_required');
  if(!needsHygiene&&hygieneId)throw new Error('unexpected_hygiene_lot');
  if(hygieneId){const h=check(await sb.from('basket_stock_lots').select('lot_kind,status').eq('id',hygieneId).maybeSingle());if(!h||h.lot_kind!=='hygiene'||!['ready','depleted'].includes(h.status))throw new Error('invalid_hygiene_lot')}
  const rows=check(await sb.from('basket_stock_lot_items').select('product_id,quantity_per_basket,product:products(name,image_url,packaging)').in('lot_id',hygieneId?[lotId,hygieneId]:[lotId]).order('position_order'));
  const items=imageManifest(rows||[]);
  if(items.some((x:any)=>!sourceAllowed(x.image_url)))throw new Error('source_host_not_allowed');
  return {lot,items,name:basket?.name||'Limpeza e Higiene',hash:await manifestHash(items,lotId,hygieneId)};
}
async function asset(url:string){
  if(!sourceAllowed(url))throw new Error('source_host_not_allowed');
  const r=await fetch(url,{signal:AbortSignal.timeout(25000),redirect:'error'});
  if(!r.ok)throw new Error('product_image_unavailable');
  const type=(r.headers.get('content-type')||'').split(';')[0];
  if(!['image/png','image/jpeg','image/webp'].includes(type))throw new Error('unsupported_source_image');
  if(Number(r.headers.get('content-length')||0)>2_000_000)throw new Error('source_too_large');
  const bytes=new Uint8Array(await r.arrayBuffer());if(!bytes.length||bytes.length>2_000_000)throw new Error('source_too_large');
  return {bytes,type};
}
async function run(job:any){
  try{
    let key=Deno.env.get('OPENAI_API_KEY')||'';
    if(!key){const q=await sb.rpc('get_conversation_worker_provider_secret_v1');if(typeof q.data==='string')key=q.data}
    if(!key)throw new Error('openai_key_missing');
    const r=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:IMAGE_MODEL,prompt:backgroundPrompt(),size:'1024x1024',quality:'low',n:1,output_format:'webp',output_compression:60,background:'opaque'}),signal:AbortSignal.timeout(140000)});
    const d=await r.json();if(!r.ok)throw new Error('openai_http_'+r.status+'_'+String(d.error?.code||'error').slice(0,80));
    const bytes=unb64(d.data?.[0]?.b64_json||'');if(!bytes.length||bytes.length>2_000_000)throw new Error('invalid_background');
    const path='scenes/'+job.id+'/'+crypto.randomUUID()+'.webp';check(await sb.storage.from(BUCKET).upload(path,bytes,{contentType:'image/webp',cacheControl:'31536000',upsert:false}));
    const sceneUrl=sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    check(await sb.from('basket_lot_images').update({status:'scene_ready',scene_url:sceneUrl,usage:d.usage||{},updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','generating').eq('attempts',job.attempts));
  }catch(e){await sb.from('basket_lot_images').update({status:'failed',error:String(e instanceof Error?e.message:e).slice(0,180),updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','generating').eq('attempts',job.attempts)}
}
async function jobRow(jobId:string){const row=check(await sb.from('basket_lot_images').select('*').eq('id',jobId).maybeSingle());if(!row)throw new Error('job_not_found');return row}
async function fresh(job:any){const s=await snapshot(job.lot_id,job.hygiene_lot_id);if(s.hash!==job.composition_key)throw new Error('composition_changed');return s}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=='POST')return json(req,{ok:false,error:'method_not_allowed'},405);
  try{
    const userId=await auth(req);
    if(Number(req.headers.get('content-length')||0)>70_000)return json(req,{ok:false,error:'request_too_large'},413);
    const body=await req.json();const event=body.event;
    if(event==='context'){
      const lotId=id(body.lot_id);const lot=check(await sb.from('basket_stock_lots').select('basket_id,lot_kind,status').eq('id',lotId).maybeSingle());if(!lot)throw new Error('lot_not_found');
      const basket=lot.basket_id?check(await sb.from('basket_templates').select('uses_hygiene_kit').eq('id',lot.basket_id).maybeSingle()):null;
      const needsHygiene=lot.lot_kind==='food'&&basket?.uses_hygiene_kit===true;
      const hygiene=needsHygiene?check(await sb.from('basket_stock_lots').select('id,short_code,sale_enabled,quantity_available').eq('lot_kind','hygiene').eq('status','ready').gt('quantity_available',0).order('sale_enabled',{ascending:false}).order('built_at')):[];
      const jobs=check(await sb.from('basket_lot_images').select('id,status,image_url,hygiene_lot_id,error,created_at').eq('lot_id',lotId).order('created_at',{ascending:false}).limit(8));
      return json(req,{ok:true,needs_hygiene:needsHygiene,hygiene_lots:hygiene,jobs});
    }
    if(event==='start'){
      const lotId=id(body.lot_id),hygieneId=id(body.hygiene_lot_id)||null;const s=await snapshot(lotId,hygieneId);
      const prior=check(await sb.from('basket_lot_images').select('*').eq('composition_key',s.hash).maybeSingle());
      if(prior&&prior.status!=='failed')return json(req,{ok:true,job:prior,reused:true});
      // Only explicit operator requests may incur a new paid generation. Limit retries.
      if(prior&&Number(prior.attempts)>=3)throw new Error('generation_attempt_limit');
      let job;
      if(prior){job=check(await sb.from('basket_lot_images').update({status:'generating',attempts:Number(prior.attempts)+1,error:null,updated_at:new Date().toISOString()}).eq('id',prior.id).eq('status','failed').select('*').maybeSingle());if(!job)return json(req,{ok:false,error:'generation_already_running'},409)}
      else{const q=await sb.from('basket_lot_images').insert({lot_id:lotId,hygiene_lot_id:hygieneId,composition_key:s.hash,manifest:s.items,status:'generating',created_by:userId,model:IMAGE_MODEL}).select('*').single();if(q.error?.code==='23505')return json(req,{ok:true,job:check(await sb.from('basket_lot_images').select('*').eq('composition_key',s.hash).single()),reused:true});job=check(q)}
      EdgeRuntime.waitUntil(run(job));return json(req,{ok:true,job},202);
    }
    const job=await jobRow(id(body.job_id));
    if(event==='status'){
      if(job.status==='generating'&&Date.now()-Date.parse(job.updated_at)>240000){check(await sb.from('basket_lot_images').update({status:'failed',error:'generation_interrupted'}).eq('id',job.id).eq('status','generating').eq('attempts',job.attempts).eq('updated_at',job.updated_at));return json(req,{ok:true,job:await jobRow(job.id)})}
      return json(req,{ok:true,job});
    }
    if(event==='assets'){
      await fresh(job);if(!['scene_ready','preview','published'].includes(job.status))throw new Error('scene_not_ready');
      const scene=await asset(job.scene_url);const items=[];
      for(const item of job.manifest){const a=await asset(item.image_url);items.push({...item,data_url:'data:'+a.type+';base64,'+b64(a.bytes)})}
      return json(req,{ok:true,scene:'data:'+scene.type+';base64,'+b64(scene.bytes),items});
    }
    if(event==='save_preview'){
      await fresh(job);if(job.status!=='scene_ready')throw new Error('preview_not_expected');
      const bytes=unb64(String(body.image_base64||'')),width=Number(body.width);if(!validFinalWebp(bytes,width))throw new Error('invalid_webp_or_size');
      const path='final/'+job.id+'/'+crypto.randomUUID()+'.webp';check(await sb.storage.from(BUCKET).upload(path,bytes,{contentType:'image/webp',cacheControl:'31536000',upsert:false}));
      const url=sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const saved=check(await sb.from('basket_lot_images').update({status:'preview',image_url:url,byte_size:bytes.length,width,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','scene_ready').select('id').maybeSingle());
      if(!saved)throw new Error('preview_already_saved');
      return json(req,{ok:true,job:await jobRow(job.id)});
    }
    if(event==='publish'){
      await fresh(job);if(job.status!=='preview')throw new Error('preview_required');
      const published=check(await sb.from('basket_lot_images').update({status:'published',published_at:new Date().toISOString(),published_by:userId,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','preview').eq('image_url',job.image_url).select('id').maybeSingle());
      if(!published)throw new Error('preview_already_published');
      return json(req,{ok:true,job:await jobRow(job.id)});
    }
    return json(req,{ok:false,error:'unknown_event'},400);
  }catch(e){const error=String(e instanceof Error?e.message:e).slice(0,250);return json(req,{ok:false,error},error==='admin_auth_required'?401:error==='admin_not_authorized'?403:409)}
});
