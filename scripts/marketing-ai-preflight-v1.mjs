import { createHash } from 'node:crypto';

function text(value){return String(value??'').trim().replace(/\s+/g,' ')}
function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
}
function digest(value){return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0,32)}
function finiteNumber(value,name,{min=0,positive=false}={}){
  const n=Number(value);
  if(!Number.isFinite(n)||(positive?n<=min:n<min))throw new Error(name);
  return n;
}
function runtimeSnapshot(runtime={}){
  return {
    enabled:runtime.enabled===true,
    execution_mode:text(runtime.execution_mode)||'off',
    kill_switch:runtime.kill_switch!==false,
    generation_enabled:runtime.generation_enabled===true,
    ai_image_enabled:runtime.ai_image_enabled===true,
    ai_video_enabled:runtime.ai_video_enabled===true,
    max_daily_ai_cost_cents:Number.isFinite(Number(runtime.max_daily_ai_cost_cents))?Number(runtime.max_daily_ai_cost_cents):0,
    max_daily_ai_image_generations:Number.isFinite(Number(runtime.max_daily_ai_image_generations))?Number(runtime.max_daily_ai_image_generations):0,
    max_daily_ai_video_seconds:Number.isFinite(Number(runtime.max_daily_ai_video_seconds))?Number(runtime.max_daily_ai_video_seconds):0
  };
}

export function buildMarketingAiPreflight(input={}){
  const mode=text(input.mode).toLowerCase();
  if(!['no_ai','ai','hybrid'].includes(mode))throw new Error('unsupported_generation_mode');
  const mediaKind=text(input.media_kind).toLowerCase();
  if(!['image','video'].includes(mediaKind))throw new Error('unsupported_media_kind');
  const requestedUnits=finiteNumber(input.requested_units,'requested_units_invalid',{min:0,positive:true});
  const unitCostCents=finiteNumber(input.unit_cost_cents,'unit_cost_invalid',{min:0});
  const runtime=runtimeSnapshot(input.runtime);
  const aiRequested=mode==='ai'||mode==='hybrid';
  const estimatedCostCents=aiRequested?Math.ceil(requestedUnits*unitCostCents):0;
  const blockers=[];

  if(aiRequested){
    if(!runtime.enabled)blockers.push('marketing_disabled');
    if(runtime.kill_switch)blockers.push('kill_switch_on');
    if(runtime.execution_mode!=='live')blockers.push('execution_mode_not_live');
    if(!runtime.generation_enabled)blockers.push('generation_disabled');
    if(mediaKind==='image'&&!runtime.ai_image_enabled)blockers.push('ai_image_gate_off');
    if(mediaKind==='video'&&!runtime.ai_video_enabled)blockers.push('ai_video_gate_off');
    if(runtime.max_daily_ai_cost_cents<=0)blockers.push('ai_cost_budget_zero');
    else if(estimatedCostCents>runtime.max_daily_ai_cost_cents)blockers.push('ai_cost_budget_exceeded');
    if(mediaKind==='image'){
      if(runtime.max_daily_ai_image_generations<=0)blockers.push('ai_image_budget_zero');
      else if(requestedUnits>runtime.max_daily_ai_image_generations)blockers.push('ai_image_budget_exceeded');
    }
    if(mediaKind==='video'){
      if(runtime.max_daily_ai_video_seconds<=0)blockers.push('ai_video_budget_zero');
      else if(requestedUnits>runtime.max_daily_ai_video_seconds)blockers.push('ai_video_budget_exceeded');
    }
  }

  const identity={mode,media_kind:mediaKind,requested_units:requestedUnits,unit_cost_cents:unitCostCents,runtime};
  return {
    schema_version:'marketing-ai-preflight-v1',
    dry_run:true,
    external_side_effect:false,
    network_allowed:false,
    credentials_required_now:false,
    provider_call_allowed:false,
    mode,
    media_kind:mediaKind,
    ai_requested:aiRequested,
    requested_units:requestedUnits,
    unit_cost_cents:unitCostCents,
    estimated_cost_cents:estimatedCostCents,
    runtime_snapshot:runtime,
    blockers:[...new Set(blockers)],
    allowed:blockers.length===0,
    idempotency_key:`marketing-ai-preflight-v1:${digest(identity)}`
  };
}
