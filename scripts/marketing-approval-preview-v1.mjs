import { createHash } from 'node:crypto';
import { buildMarketingChannelPreflight } from './marketing-channel-preflight-v1.mjs';

const CHANNEL_GATES=Object.freeze({
  whatsapp_status:'whatsapp_status_publish_enabled',
  instagram_story:'instagram_story_publish_enabled',
  facebook_story:'facebook_story_publish_enabled',
  instagram_carousel:'instagram_carousel_publish_enabled',
  pinterest_pin:'pinterest_publish_enabled',
  google_business_post:'google_business_publish_enabled'
});
const CHANNEL_RENDER_PROFILES=Object.freeze({
  whatsapp_status:'story_9_16',
  instagram_story:'story_9_16',
  facebook_story:'story_9_16',
  instagram_carousel:'square_1_1',
  pinterest_pin:'pinterest_2_3',
  google_business_post:'square_1_1'
});

function text(value){return String(value??'').trim().replace(/\s+/g,' ')}
function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
}
function digest(value){return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0,32)}
function safeAsset(asset){
  if(!asset||typeof asset!=='object'||Array.isArray(asset)||!text(asset.id))throw new Error('asset_required');
  return {
    id:text(asset.id),
    title:text(asset.title),
    status:text(asset.status),
    media_kind:text(asset.media_kind),
    generation_mode:text(asset.generation_mode)
  };
}
function safeRuntime(runtime={}){
  return {
    enabled:runtime.enabled===true,
    execution_mode:text(runtime.execution_mode)||'off',
    canary_percent:Number.isFinite(Number(runtime.canary_percent))?Number(runtime.canary_percent):0,
    kill_switch:runtime.kill_switch!==false,
    publishing_enabled:runtime.publishing_enabled===true,
    require_approval:runtime.require_approval!==false,
    max_daily_publications:Number.isFinite(Number(runtime.max_daily_publications))?Number(runtime.max_daily_publications):0,
    max_daily_ai_cost_cents:Number.isFinite(Number(runtime.max_daily_ai_cost_cents))?Number(runtime.max_daily_ai_cost_cents):0,
    ...Object.fromEntries(Object.values(CHANNEL_GATES).map(gate=>[gate,runtime[gate]===true]))
  };
}
function runtimeBlockers(runtime,channel){
  const blockers=[];
  if(!runtime.enabled)blockers.push('marketing_disabled');
  if(runtime.kill_switch)blockers.push('kill_switch_on');
  if(runtime.execution_mode!=='live')blockers.push('execution_mode_not_live');
  if(!runtime.publishing_enabled)blockers.push('publishing_disabled');
  const gate=CHANNEL_GATES[channel];
  if(gate&&!runtime[gate])blockers.push(`channel_gate_off:${channel}`);
  if(runtime.max_daily_publications<=0)blockers.push('publication_budget_zero');
  return blockers;
}
function validateRenderManifest(manifest,channel,asset){
  const expectedProfile=CHANNEL_RENDER_PROFILES[channel]||null;
  if(manifest==null)return {manifest:null,validation:{status:'not_provided',expected_profile:expectedProfile,actual_profile:null,error:null}};
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))return {manifest:null,validation:{status:'invalid',expected_profile:expectedProfile,actual_profile:null,error:'invalid_manifest'}};
  const actualProfile=text(manifest.render_profile)||null;
  const checks=[
    ['schema_version',manifest.schema_version==='marketing-render-manifest-v1','schema_version_invalid'],
    ['dry_run',manifest.dry_run===true,'dry_run_not_true'],
    ['external_side_effect',manifest.external_side_effect===false,'external_side_effect_not_false'],
    ['network_allowed',manifest.network_allowed===false,'network_allowed_not_false'],
    ['provider_call_allowed',manifest.provider_call_allowed===false,'provider_call_allowed_not_false'],
    ['executor_allowed',manifest.executor_allowed===false,'executor_allowed_not_false'],
    ['asset_id',text(manifest.asset_id)===asset.id,'asset_id_mismatch']
  ];
  const failed=checks.find(([,ok])=>!ok);
  if(failed)return {manifest:null,validation:{status:'invalid',expected_profile:expectedProfile,actual_profile:actualProfile,error:failed[2]}};
  const safeManifest={
    schema_version:'marketing-render-manifest-v1',
    asset_id:text(manifest.asset_id),
    revision:Number(manifest.revision),
    generation_mode:text(manifest.generation_mode),
    media_kind:text(manifest.media_kind),
    render_profile:actualProfile,
    source_svg:text(manifest.source_svg),
    output:manifest.output&&typeof manifest.output==='object'?stable(manifest.output):null,
    ai_used:manifest.ai_used===true,
    requires_ai_preflight:manifest.requires_ai_preflight===true,
    dry_run:true,
    executor_allowed:false,
    external_side_effect:false,
    network_allowed:false,
    provider_call_allowed:false,
    credentials_required_now:manifest.credentials_required_now===true,
    idempotency_key:text(manifest.idempotency_key)
  };
  if(expectedProfile&&actualProfile!==expectedProfile){
    return {manifest:safeManifest,validation:{status:'incompatible',expected_profile:expectedProfile,actual_profile:actualProfile,error:'channel_format_mismatch'}};
  }
  return {manifest:safeManifest,validation:{status:'compatible',expected_profile:expectedProfile,actual_profile:actualProfile,error:null}};
}

export function buildMarketingApprovalPreview(input={}){
  const asset=safeAsset(input.asset);
  const runtime=safeRuntime(input.runtime);
  if(!Array.isArray(input.targets)||input.targets.length===0)throw new Error('target_required');

  const blockers=[];
  const targets=input.targets.map(target=>{
    const channel=text(target?.channel);
    let preflight;
    try{preflight=buildMarketingChannelPreflight(channel,target?.input||{})}
    catch(error){
      preflight={
        schema_version:'marketing-channel-preflight-v1',
        channel,
        ok:false,
        dry_run:true,
        external_side_effect:false,
        network_allowed:false,
        credentials_required_now:false,
        publisher_enabled:false,
        request:null,
        request_preview:null,
        validation:{errors:[text(error?.message)||'invalid_channel'],warnings:[]},
        idempotency_key:`marketing-preflight-v1:${digest({channel,error:text(error?.message)})}`
      };
    }
    blockers.push(...runtimeBlockers(runtime,channel));
    if(!preflight.ok){
      for(const error of preflight.validation?.errors||['invalid_preflight'])blockers.push(`preflight_invalid:${channel}:${text(error)}`);
    }
    const render=validateRenderManifest(target?.render_manifest,channel,asset);
    if(render.validation.status==='not_provided')blockers.push(`render_manifest_missing:${channel}`);
    if(render.validation.status==='invalid')blockers.push(`render_manifest_invalid:${channel}:${render.validation.error}`);
    if(render.validation.status==='incompatible')blockers.push(`render_manifest_incompatible:${channel}:${render.validation.actual_profile}:${render.validation.expected_profile}`);
    return {channel,preflight,render_manifest:render.manifest,render_validation:render.validation};
  });

  const uniqueBlockers=[...new Set(blockers)];
  const identity={asset,runtime,targets:targets.map(({channel,preflight,render_manifest,render_validation})=>({
    channel,
    preflight_idempotency_key:preflight.idempotency_key,
    render_manifest_idempotency_key:render_manifest?.idempotency_key||null,
    render_validation_status:render_validation.status
  }))};
  return {
    schema_version:'marketing-approval-preview-v1',
    preview_only:true,
    approval_state:'preview_only',
    ready_for_real_publish:false,
    external_side_effect:false,
    network_allowed:false,
    mutations_allowed:false,
    asset,
    runtime_snapshot:runtime,
    targets,
    blockers:uniqueBlockers,
    idempotency_key:`marketing-approval-preview-v1:${digest(identity)}`
  };
}
