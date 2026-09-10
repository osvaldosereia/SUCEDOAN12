function fail(message){throw new Error(message)}
function assertSupabaseUrl(raw){const u=new URL(String(raw||''));if(u.protocol!=='https:'||!/\.supabase\.co$/i.test(u.hostname))fail('invalid_supabase_url');return u.origin}
function isCarouselJob(job={}){const o=job?.output_spec||{};return Boolean(o.carousel_slide_id&&o.asset_version&&o.slide_no)}

export async function completePersistedRender({supabaseUrl,serviceRoleKey,job,mediaId,actualCostCents=0,actor=null,worker,fetchImpl=globalThis.fetch}){
  if(!fetchImpl)fail('fetch_unavailable');
  const base=assertSupabaseUrl(supabaseUrl);
  if(!serviceRoleKey||String(serviceRoleKey).length<20)fail('service_role_required');
  if(!job?.id)fail('job_id_required');
  if(!mediaId)fail('media_id_required');
  if(!worker||!String(worker).trim())fail('worker_required');
  if(!isCarouselJob(job))fail('carousel_completion_only');
  const payload={p_job_id:job.id,p_worker:String(worker).slice(0,120),p_media_id:mediaId,p_actual_cost_cents:Math.max(0,Number(actualCostCents)||0),p_actor:actor||null};
  const res=await fetchImpl(`${base}/rest/v1/rpc/complete_marketing_carousel_render_v1`,{method:'POST',headers:{Authorization:`Bearer ${serviceRoleKey}`,apikey:serviceRoleKey,'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'error'});
  const body=await res.json().catch(()=>({}));
  if(!res.ok||body?.ok===false)fail(`carousel_completion_failed:${res.status}:${String(body?.error||'unknown').slice(0,120)}`);
  if(body?.external_side_effect!==false)fail('carousel_completion_external_effect_rejected');
  if(String(body?.job_id||'')!==String(job.id))fail('carousel_completion_job_mismatch');
  if(String(body?.media_id||'')!==String(mediaId))fail('carousel_completion_media_mismatch');
  return {...body,external_side_effect:false};
}

export {isCarouselJob};
