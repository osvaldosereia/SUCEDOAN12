import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2';

const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,'Content-Type':'application/json','Cache-Control':'no-store'}});
const clean=(v:unknown,max=500)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const finite=(v:unknown,fallback=0)=>{const n=Number(v);return Number.isFinite(n)?n:fallback};

async function authorized(req:Request){
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return {error:json({ok:false,error:'server_config'},500)};
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!token)return {error:json({ok:false,error:'missing_token'},401)};
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData}=await sb.auth.getUser(token);const user=userData?.user;
  if(!user)return {error:json({ok:false,error:'invalid_user'},401)};
  const {data:admin}=await sb.from('admin_users').select('role,is_active').eq('user_id',user.id).maybeSingle();
  if(!admin?.is_active||!['owner','operator'].includes(admin.role))return {error:json({ok:false,error:'admin_not_authorized'},403)};
  return {sb,user};
}

function validateJob(job:any){
  const errors:string[]=[];
  if(!job?.product_id)errors.push('product_required');
  const duration=finite(job?.duration_seconds,-1);if(duration<15||duration>25)errors.push('duration_out_of_range');
  if(job?.timeline?.audio?.voice===true)errors.push('voice_forbidden');
  const s=job?.resolved_assets?.summary||{};
  if(finite(s.missing)>0||finite(s.blocked)>0||finite(s.ready)!==finite(s.total))errors.push('assets_not_ready');
  if(finite(job?.external_assets_used)>10)errors.push('external_assets_limit');
  return errors;
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});
  if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
  const auth=await authorized(req);if(auth.error)return auth.error;const {sb,user}=auth as any;
  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:'invalid_json'},400)}
  const action=clean(body?.action||'list',40).toLowerCase();

  if(action==='settings'){
    const {data,error}=await sb.from('creative_studio_settings').select('*').eq('id',1).maybeSingle();
    if(error)return json({ok:false,error:'settings_failed',detail:error.message},400);return json({ok:true,settings:data});
  }

  if(action==='memory'){
    const productId=clean(body?.product_id,80),category=clean(body?.category,160);const limit=Math.min(12,Math.max(1,finite(body?.limit,8)));
    let q=sb.from('creative_studio_memory').select('product_id,product_name,product_category,territory,concept,hook,story_signature,duration_seconds,motions,created_at').order('created_at',{ascending:false}).limit(limit);
    if(productId)q=q.eq('product_id',productId);else if(category)q=q.eq('product_category',category);
    const {data,error}=await q;if(error)return json({ok:false,error:'memory_failed',detail:error.message},400);return json({ok:true,memory:data||[]});
  }

  if(action==='create'){
    const job=body?.job||{};const errors=validateJob(job);if(errors.length)return json({ok:false,error:'invalid_job',errors},400);
    const {data:product,error:productError}=await sb.from('products').select('id,name,category,is_active').eq('id',job.product_id).maybeSingle();
    if(productError||!product)return json({ok:false,error:'product_not_found'},404);
    if(product.is_active!==true)return json({ok:false,error:'product_not_active'},409);
    const row={
      product_id:product.id,product_snapshot:job.product_snapshot||{},creative_plan:job.creative_plan||{},resolved_assets:job.resolved_assets||{},timeline:job.timeline||{},
      status:'ready',width:1080,height:1920,fps:30,duration_seconds:finite(job.duration_seconds,18),external_assets_used:finite(job.external_assets_used),
      provider_usage:job.provider_usage||{},estimated_cost_brl:finite(job.estimated_cost_brl),requires_paid_approval:job.requires_paid_approval===true,
      render_strategy:'ffmpeg_svg',output_bucket:'creative-studio-renders',created_by:user.id
    };
    const {data,error}=await sb.from('creative_studio_jobs').insert(row).select('id,status,created_at,duration_seconds,estimated_cost_brl,requires_paid_approval').single();
    if(error)return json({ok:false,error:'job_create_failed',detail:error.message},400);
    await sb.from('creative_studio_job_events').insert({job_id:data.id,event_type:'created',payload:{source:'creative_studio_admin'}});
    const plan=job.creative_plan||{};
    await sb.from('creative_studio_memory').insert({product_id:product.id,product_name:product.name,product_category:product.category||null,territory:clean(plan.territory,120)||'unknown',concept:clean(plan.concept,500)||'untitled',hook:clean(plan.hook,500)||null,story_signature:clean([plan.territory,plan.concept,plan.hook,plan.payoff].filter(Boolean).join('|'),1200)||null,duration_seconds:finite(job.duration_seconds,18),asset_ids:[],motions:(plan.scenes||[]).flatMap((s:any)=>(s.actors||[]).map((a:any)=>clean(a.motion,60))).filter(Boolean).slice(0,60)});
    return json({ok:true,job:data});
  }

  if(action==='queue'){
    const id=clean(body?.id,80);if(!id)return json({ok:false,error:'id_required'},400);
    const {data:current}=await sb.from('creative_studio_jobs').select('id,status,requires_paid_approval').eq('id',id).maybeSingle();
    if(!current)return json({ok:false,error:'job_not_found'},404);
    if(current.requires_paid_approval===true&&body?.paid_approved!==true)return json({ok:false,error:'paid_approval_required'},409);
    if(!['ready','failed'].includes(current.status))return json({ok:false,error:'job_not_queueable',status:current.status},409);
    const {data,error}=await sb.from('creative_studio_jobs').update({status:'queued',queued_at:new Date().toISOString(),error_code:null,error_detail:null,updated_at:new Date().toISOString()}).eq('id',id).select('id,status,queued_at').single();
    if(error)return json({ok:false,error:'queue_failed',detail:error.message},400);
    await sb.from('creative_studio_job_events').insert({job_id:id,event_type:'queued',payload:{paid_approved:body?.paid_approved===true}});
    return json({ok:true,job:data});
  }

  if(action==='get'){
    const id=clean(body?.id,80);if(!id)return json({ok:false,error:'id_required'},400);
    const {data,error}=await sb.from('creative_studio_jobs').select('*').eq('id',id).maybeSingle();if(error||!data)return json({ok:false,error:'job_not_found'},404);
    let output_url:string|null=null;
    if(data.output_bucket&&data.output_path){const signed=await sb.storage.from(data.output_bucket).createSignedUrl(data.output_path,3600);output_url=signed.data?.signedUrl||null}
    return json({ok:true,job:data,output_url});
  }

  if(action==='list'){
    const limit=Math.min(100,Math.max(1,finite(body?.limit,30)));const status=clean(body?.status,30);
    let q=sb.from('creative_studio_jobs').select('id,product_id,status,duration_seconds,estimated_cost_brl,actual_cost_brl,output_bucket,output_path,error_code,created_at,completed_at,product_snapshot').order('created_at',{ascending:false}).limit(limit);
    if(status)q=q.eq('status',status);const {data,error}=await q;if(error)return json({ok:false,error:'jobs_failed',detail:error.message},400);return json({ok:true,jobs:data||[]});
  }

  return json({ok:false,error:'unknown_action'},400);
});
