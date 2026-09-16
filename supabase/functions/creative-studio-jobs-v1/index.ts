import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2';

const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,'Content-Type':'application/json','Cache-Control':'no-store'}});
const clean=(v:unknown,max=500)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const finite=(v:unknown,fallback=0)=>{const n=Number(v);return Number.isFinite(n)?n:fallback};
const clampInt=(v:unknown,min:number,max:number,fallback:number)=>Math.min(max,Math.max(min,Math.floor(finite(v,fallback))));

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
  if(!clean(job?.creative_plan?.concept,500))errors.push('concept_required');
  return errors;
}

async function idempotencyKey(userId:string,job:any){
  const plan=job?.creative_plan||{};
  const raw=[userId,job?.product_id,clean(plan.concept,500),clean(plan.hook,500),clean(plan.payoff,500),finite(job?.duration_seconds,18)].join('|');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
  return `studio:${Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,40)}`;
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
    const productId=clean(body?.product_id,80),category=clean(body?.category,160);const limit=clampInt(body?.limit,1,12,8);
    let q=sb.from('creative_studio_memory').select('product_id,product_name,product_category,territory,concept,hook,story_signature,duration_seconds,motions,created_at').order('created_at',{ascending:false}).limit(limit);
    if(productId)q=q.eq('product_id',productId);else if(category)q=q.eq('product_category',category);
    const {data,error}=await q;if(error)return json({ok:false,error:'memory_failed',detail:error.message},400);return json({ok:true,memory:data||[]});
  }

  if(action==='create'){
    const job=body?.job||{};const errors=validateJob(job);if(errors.length)return json({ok:false,error:'invalid_job',errors},400);
    const {data:product,error:productError}=await sb.from('products').select('id,name,category,is_active').eq('id',job.product_id).maybeSingle();
    if(productError||!product)return json({ok:false,error:'product_not_found'},404);
    if(product.is_active!==true)return json({ok:false,error:'product_not_active'},409);
    const key=await idempotencyKey(user.id,job);
    const {data:existing}=await sb.from('creative_studio_jobs').select('id,status,created_at,duration_seconds,estimated_cost_brl,requires_paid_approval,paid_approved,attempt_count,max_attempts,idempotency_key').eq('idempotency_key',key).maybeSingle();
    if(existing)return json({ok:true,job:existing,reused:true});
    const requiresApproval=job.requires_paid_approval===true;
    const row={
      product_id:product.id,product_snapshot:job.product_snapshot||{},creative_plan:job.creative_plan||{},resolved_assets:job.resolved_assets||{},timeline:job.timeline||{},
      status:'ready',width:1080,height:1920,fps:30,duration_seconds:finite(job.duration_seconds,18),external_assets_used:finite(job.external_assets_used),
      provider_usage:job.provider_usage||{},estimated_cost_brl:Math.max(0,finite(job.estimated_cost_brl)),requires_paid_approval:requiresApproval,paid_approved:!requiresApproval,
      render_strategy:'ffmpeg_svg',output_bucket:'creative-studio-renders',created_by:user.id,idempotency_key:key,attempt_count:0,max_attempts:3
    };
    const {data,error}=await sb.from('creative_studio_jobs').insert(row).select('id,status,created_at,duration_seconds,estimated_cost_brl,requires_paid_approval,paid_approved,attempt_count,max_attempts,idempotency_key').single();
    if(error){
      if(error.code==='23505'){
        const {data:race}=await sb.from('creative_studio_jobs').select('id,status,created_at,duration_seconds,estimated_cost_brl,requires_paid_approval,paid_approved,attempt_count,max_attempts,idempotency_key').eq('idempotency_key',key).maybeSingle();
        if(race)return json({ok:true,job:race,reused:true});
      }
      return json({ok:false,error:'job_create_failed',detail:error.message},400);
    }
    await sb.from('creative_studio_job_events').insert({job_id:data.id,event_type:'created',payload:{source:'creative_studio_admin',idempotency_key:key}});
    const plan=job.creative_plan||{};
    await sb.from('creative_studio_memory').insert({product_id:product.id,product_name:product.name,product_category:product.category||null,territory:clean(plan.territory,120)||'unknown',concept:clean(plan.concept,500)||'untitled',hook:clean(plan.hook,500)||null,story_signature:clean([plan.territory,plan.concept,plan.hook,plan.payoff].filter(Boolean).join('|'),1200)||null,duration_seconds:finite(job.duration_seconds,18),asset_ids:[],motions:(plan.scenes||[]).flatMap((s:any)=>(s.actors||[]).map((a:any)=>clean(a.motion,60))).filter(Boolean).slice(0,60)});
    return json({ok:true,job:data,reused:false},201);
  }

  if(action==='queue'){
    const id=clean(body?.id,80);if(!id)return json({ok:false,error:'id_required'},400);
    const {data:current,error:getError}=await sb.from('creative_studio_jobs').select('id,status,requires_paid_approval,paid_approved,attempt_count,max_attempts,idempotency_key').eq('id',id).maybeSingle();
    if(getError)return json({ok:false,error:'job_read_failed',detail:getError.message},400);
    if(!current)return json({ok:false,error:'job_not_found'},404);
    if(['queued','rendering','completed'].includes(current.status))return json({ok:true,job:current,idempotent:true});
    if(!['ready','failed'].includes(current.status))return json({ok:false,error:'job_not_queueable',status:current.status},409);
    if(Number(current.attempt_count||0)>=Number(current.max_attempts||3))return json({ok:false,error:'max_attempts_reached',attempt_count:current.attempt_count,max_attempts:current.max_attempts},409);
    const paidApproved=current.requires_paid_approval!==true||current.paid_approved===true||body?.paid_approved===true;
    if(current.requires_paid_approval===true&&!paidApproved)return json({ok:false,error:'paid_approval_required'},409);
    const patch={status:'queued',queued_at:new Date().toISOString(),paid_approved:paidApproved,error_code:null,error_detail:null,last_error:null,failed_at:null,worker_id:null,claimed_at:null,lease_expires_at:null,updated_at:new Date().toISOString()};
    const {data,error}=await sb.from('creative_studio_jobs').update(patch).eq('id',id).in('status',['ready','failed']).select('id,status,queued_at,paid_approved,attempt_count,max_attempts,idempotency_key').maybeSingle();
    if(error)return json({ok:false,error:'queue_failed',detail:error.message},400);
    if(!data){const {data:latest}=await sb.from('creative_studio_jobs').select('id,status,attempt_count,max_attempts,idempotency_key').eq('id',id).maybeSingle();return json({ok:true,job:latest,idempotent:true})}
    await sb.from('creative_studio_job_events').insert({job_id:id,event_type:'queued',payload:{paid_approved:paidApproved,attempt_count:data.attempt_count,max_attempts:data.max_attempts}});
    return json({ok:true,job:data,idempotent:false});
  }

  if(action==='get'){
    const id=clean(body?.id,80);if(!id)return json({ok:false,error:'id_required'},400);
    const {data,error}=await sb.from('creative_studio_jobs').select('*').eq('id',id).maybeSingle();if(error||!data)return json({ok:false,error:'job_not_found'},404);
    let output_url:string|null=null;
    if(data.output_bucket&&data.output_path){const signed=await sb.storage.from(data.output_bucket).createSignedUrl(data.output_path,3600);output_url=signed.data?.signedUrl||null}
    return json({ok:true,job:data,output_url});
  }

  if(action==='list'){
    const limit=clampInt(body?.limit,1,100,30);const status=clean(body?.status,30);
    let q=sb.from('creative_studio_jobs').select('id,product_id,status,duration_seconds,estimated_cost_brl,actual_cost_brl,requires_paid_approval,paid_approved,attempt_count,max_attempts,last_error,worker_id,lease_expires_at,output_bucket,output_path,error_code,error_detail,created_at,queued_at,render_started_at,completed_at,failed_at,product_snapshot').order('created_at',{ascending:false}).limit(limit);
    if(status)q=q.eq('status',status);const {data,error}=await q;if(error)return json({ok:false,error:'jobs_failed',detail:error.message},400);return json({ok:true,jobs:data||[]});
  }

  return json({ok:false,error:'unknown_action'},400);
});
