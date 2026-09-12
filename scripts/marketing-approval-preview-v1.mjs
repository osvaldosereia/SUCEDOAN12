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
function isSha(value){return /^[a-f0-9]{64}$/i.test(text(value))}
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
    [manifest.schema_version==='marketing-render-manifest-v1','schema_version_invalid'],
    [manifest.dry_run===true,'dry_run_not_true'],
    [manifest.external_side_effect===false,'external_side_effect_not_false'],
    [manifest.network_allowed===false,'network_allowed_not_false'],
    [manifest.provider_call_allowed===false,'provider_call_allowed_not_false'],
    [manifest.executor_allowed===false,'executor_allowed_not_false'],
    [text(manifest.asset_id)===asset.id,'asset_id_mismatch'],
    [Number.isInteger(Number(manifest.revision))&&Number(manifest.revision)>=1,'revision_invalid'],
    [Boolean(text(manifest.idempotency_key)),'idempotency_key_missing']
  ];
  const failed=checks.find(([ok])=>!ok);
  if(failed)return {manifest:null,validation:{status:'invalid',expected_profile:expectedProfile,actual_profile:actualProfile,error:failed[1]}};
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
function validateRenderPreviewMetadata(metadata,render,asset){
  const expectedProfile=render.validation.expected_profile||null;
  if(metadata==null)return {metadata:null,validation:{status:'not_provided',expected_profile:expectedProfile,actual_profile:null,error:null}};
  if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))return {metadata:null,validation:{status:'invalid',expected_profile:expectedProfile,actual_profile:null,error:'invalid_metadata'}};
  const actualProfile=text(metadata.render_profile)||null;
  const width=Number(metadata.width);
  const height=Number(metadata.height);
  const byteLength=Number(metadata.byte_length);
  const sha=text(metadata.sha256);
  const checks=[
    [metadata.schema_version==='marketing-render-preview-metadata-v1','schema_version_invalid'],
    [metadata.preview_only===true,'preview_only_not_true'],
    [metadata.external_side_effect===false,'external_side_effect_not_false'],
    [metadata.network_allowed===false,'network_allowed_not_false'],
    [metadata.provider_call_allowed===false,'provider_call_allowed_not_false'],
    [metadata.storage_write_allowed===false,'storage_write_allowed_not_false'],
    [text(metadata.asset_id)===asset.id,'asset_id_mismatch'],
    [Number.isInteger(Number(metadata.revision))&&Number(metadata.revision)>=1,'revision_invalid'],
    [Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0,'dimensions_invalid'],
    [text(metadata.mime_type)==='image/png','mime_type_invalid'],
    [Number.isInteger(byteLength)&&byteLength>0,'byte_length_invalid'],
    [isSha(sha),'sha256_invalid'],
    [Boolean(text(metadata.raster_idempotency_key)),'raster_idempotency_key_missing'],
    [Boolean(text(metadata.idempotency_key)),'idempotency_key_missing']
  ];
  if(render.manifest){
    checks.push([Number(metadata.revision)===Number(render.manifest.revision),'revision_mismatch']);
    checks.push([text(metadata.manifest_idempotency_key)===text(render.manifest.idempotency_key),'manifest_idempotency_key_mismatch']);
    checks.push([actualProfile===render.manifest.render_profile,'render_profile_mismatch']);
  }else{
    checks.push([false,'render_manifest_required']);
  }
  const failed=checks.find(([ok])=>!ok);
  if(failed)return {metadata:null,validation:{status:'invalid',expected_profile:expectedProfile,actual_profile:actualProfile,error:failed[1]}};
  const safeMetadata={
    schema_version:'marketing-render-preview-metadata-v1',
    asset_id:text(metadata.asset_id),
    revision:Number(metadata.revision),
    render_profile:actualProfile,
    width,
    height,
    mime_type:'image/png',
    byte_length:byteLength,
    sha256:sha.toLowerCase(),
    manifest_idempotency_key:text(metadata.manifest_idempotency_key),
    raster_idempotency_key:text(metadata.raster_idempotency_key),
    ai_used:metadata.ai_used===true,
    requires_ai_preflight:metadata.requires_ai_preflight===true,
    preview_only:true,
    external_side_effect:false,
    network_allowed:false,
    provider_call_allowed:false,
    storage_write_allowed:false,
    idempotency_key:text(metadata.idempotency_key)
  };
  if(expectedProfile&&actualProfile!==expectedProfile){
    return {metadata:safeMetadata,validation:{status:'incompatible',expected_profile:expectedProfile,actual_profile:actualProfile,error:'channel_format_mismatch'}};
  }
  return {metadata:safeMetadata,validation:{status:'compatible',expected_profile:expectedProfile,actual_profile:actualProfile,error:null}};
}
function validateRenderIntegrity(integrity,render,preview,asset){
  const expectedProfile=render.validation.expected_profile||null;
  if(integrity==null)return {integrity:null,validation:{status:'not_provided',expected_profile:expectedProfile,actual_profile:null,error:null}};
  if(!integrity||typeof integrity!=='object'||Array.isArray(integrity))return {integrity:null,validation:{status:'invalid',expected_profile:expectedProfile,actual_profile:null,error:'invalid_integrity'}};
  const actualProfile=text(integrity.render_profile)||null;
  const revision=Number(integrity.revision);
  const sourceAssets=Array.isArray(integrity.source_assets)?integrity.source_assets:[];
  const budget=integrity.budget&&typeof integrity.budget==='object'&&!Array.isArray(integrity.budget)?integrity.budget:null;
  const limits=budget?.limits&&typeof budget.limits==='object'&&!Array.isArray(budget.limits)?budget.limits:null;
  const safeSources=[];
  let sourceError=null;
  for(const source of sourceAssets){
    const byteLength=Number(source?.byte_length);
    if(!source||typeof source!=='object'||Array.isArray(source)||!text(source.key)||!text(source.mime_type)||!isSha(source.sha256)||!Number.isInteger(byteLength)||byteLength<1){sourceError='source_asset_invalid';break;}
    safeSources.push({key:text(source.key),mime_type:text(source.mime_type),sha256:text(source.sha256).toLowerCase(),byte_length:byteLength});
  }
  const numericBudgetKeys=['input_bytes','svg_bytes','png_bytes','complexity_units'];
  const numericLimitKeys=['max_input_bytes','max_svg_bytes','max_png_bytes','max_complexity_units'];
  const checks=[
    [integrity.schema_version==='marketing-render-integrity-v1','schema_version_invalid'],
    [integrity.preview_only===true,'preview_only_not_true'],
    [integrity.external_side_effect===false,'external_side_effect_not_false'],
    [integrity.network_allowed===false,'network_allowed_not_false'],
    [integrity.provider_call_allowed===false,'provider_call_allowed_not_false'],
    [integrity.storage_write_allowed===false,'storage_write_allowed_not_false'],
    [integrity.filesystem_write_allowed===false,'filesystem_write_allowed_not_false'],
    [text(integrity.asset_id)===asset.id,'asset_id_mismatch'],
    [Number.isInteger(revision)&&revision>=1,'revision_invalid'],
    [Boolean(actualProfile),'render_profile_missing'],
    [isSha(integrity.spec_sha256),'spec_sha256_invalid'],
    [isSha(integrity.svg_sha256),'svg_sha256_invalid'],
    [isSha(integrity.png_sha256),'png_sha256_invalid'],
    [Boolean(text(integrity.manifest_idempotency_key)),'manifest_idempotency_key_missing'],
    [Boolean(text(integrity.svg_idempotency_key)),'svg_idempotency_key_missing'],
    [Boolean(text(integrity.preview_idempotency_key)),'preview_idempotency_key_missing'],
    [Boolean(text(integrity.idempotency_key)),'idempotency_key_missing'],
    [sourceError==null,sourceError||'source_asset_invalid'],
    [Boolean(budget)&&budget.status==='within_budget','budget_not_within_limits'],
    [Boolean(limits),'budget_limits_missing'],
    [Boolean(budget)&&numericBudgetKeys.every(key=>Number.isInteger(Number(budget[key]))&&Number(budget[key])>=0),'budget_values_invalid'],
    [Boolean(limits)&&numericLimitKeys.every(key=>Number.isInteger(Number(limits[key]))&&Number(limits[key])>0),'budget_limits_invalid']
  ];
  if(render.manifest){
    checks.push([revision===Number(render.manifest.revision),'revision_mismatch']);
    checks.push([text(integrity.manifest_idempotency_key)===text(render.manifest.idempotency_key),'manifest_idempotency_key_mismatch']);
    checks.push([actualProfile===render.manifest.render_profile,'render_profile_mismatch']);
  }else checks.push([false,'render_manifest_required']);
  if(preview.metadata){
    checks.push([revision===Number(preview.metadata.revision),'preview_revision_mismatch']);
    checks.push([actualProfile===preview.metadata.render_profile,'preview_render_profile_mismatch']);
    checks.push([text(integrity.png_sha256).toLowerCase()===preview.metadata.sha256,'png_sha256_mismatch']);
    checks.push([text(integrity.preview_idempotency_key)===preview.metadata.idempotency_key,'preview_idempotency_key_mismatch']);
  }else checks.push([false,'render_preview_required']);
  const failed=checks.find(([ok])=>!ok);
  if(failed)return {integrity:null,validation:{status:'invalid',expected_profile:expectedProfile,actual_profile:actualProfile,error:failed[1]}};
  const safeIntegrity={
    schema_version:'marketing-render-integrity-v1',
    asset_id:text(integrity.asset_id),revision,render_profile:actualProfile,
    spec_sha256:text(integrity.spec_sha256).toLowerCase(),source_assets:safeSources,
    manifest_idempotency_key:text(integrity.manifest_idempotency_key),svg_idempotency_key:text(integrity.svg_idempotency_key),svg_sha256:text(integrity.svg_sha256).toLowerCase(),
    png_sha256:text(integrity.png_sha256).toLowerCase(),preview_idempotency_key:text(integrity.preview_idempotency_key),
    budget:{status:'within_budget',...Object.fromEntries(numericBudgetKeys.map(key=>[key,Number(budget[key])])),limits:Object.fromEntries(numericLimitKeys.map(key=>[key,Number(limits[key])]))},
    preview_only:true,external_side_effect:false,network_allowed:false,provider_call_allowed:false,storage_write_allowed:false,filesystem_write_allowed:false,
    idempotency_key:text(integrity.idempotency_key)
  };
  if(expectedProfile&&actualProfile!==expectedProfile)return {integrity:safeIntegrity,validation:{status:'incompatible',expected_profile:expectedProfile,actual_profile:actualProfile,error:'channel_format_mismatch'}};
  return {integrity:safeIntegrity,validation:{status:'compatible',expected_profile:expectedProfile,actual_profile:actualProfile,error:null}};
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
      preflight={schema_version:'marketing-channel-preflight-v1',channel,ok:false,dry_run:true,external_side_effect:false,network_allowed:false,credentials_required_now:false,publisher_enabled:false,request:null,request_preview:null,validation:{errors:[text(error?.message)||'invalid_channel'],warnings:[]},idempotency_key:`marketing-preflight-v1:${digest({channel,error:text(error?.message)})}`};
    }
    blockers.push(...runtimeBlockers(runtime,channel));
    if(!preflight.ok)for(const error of preflight.validation?.errors||['invalid_preflight'])blockers.push(`preflight_invalid:${channel}:${text(error)}`);
    const render=validateRenderManifest(target?.render_manifest,channel,asset);
    if(render.validation.status==='not_provided')blockers.push(`render_manifest_missing:${channel}`);
    if(render.validation.status==='invalid')blockers.push(`render_manifest_invalid:${channel}:${render.validation.error}`);
    if(render.validation.status==='incompatible')blockers.push(`render_manifest_incompatible:${channel}:${render.validation.actual_profile}:${render.validation.expected_profile}`);
    const preview=validateRenderPreviewMetadata(target?.render_preview_metadata,render,asset);
    if(preview.validation.status==='not_provided')blockers.push(`render_preview_missing:${channel}`);
    if(preview.validation.status==='invalid')blockers.push(`render_preview_invalid:${channel}:${preview.validation.error}`);
    if(preview.validation.status==='incompatible')blockers.push(`render_preview_incompatible:${channel}:${preview.validation.actual_profile}:${preview.validation.expected_profile}`);
    const integrity=validateRenderIntegrity(target?.render_integrity,render,preview,asset);
    if(integrity.validation.status==='not_provided')blockers.push(`render_integrity_missing:${channel}`);
    if(integrity.validation.status==='invalid')blockers.push(`render_integrity_invalid:${channel}:${integrity.validation.error}`);
    if(integrity.validation.status==='incompatible')blockers.push(`render_integrity_incompatible:${channel}:${integrity.validation.actual_profile}:${integrity.validation.expected_profile}`);
    return {channel,preflight,render_manifest:render.manifest,render_validation:render.validation,render_preview_metadata:preview.metadata,render_preview_validation:preview.validation,render_integrity:integrity.integrity,render_integrity_validation:integrity.validation};
  });

  const uniqueBlockers=[...new Set(blockers)];
  const identity={asset,runtime,targets:targets.map(({channel,preflight,render_manifest,render_validation,render_preview_metadata,render_preview_validation,render_integrity,render_integrity_validation})=>({channel,preflight_idempotency_key:preflight.idempotency_key,render_manifest_idempotency_key:render_manifest?.idempotency_key||null,render_validation_status:render_validation.status,render_preview_idempotency_key:render_preview_metadata?.idempotency_key||null,render_preview_validation_status:render_preview_validation.status,render_integrity_idempotency_key:render_integrity?.idempotency_key||null,render_integrity_validation_status:render_integrity_validation.status}))};
  return {schema_version:'marketing-approval-preview-v1',preview_only:true,approval_state:'preview_only',ready_for_real_publish:false,external_side_effect:false,network_allowed:false,mutations_allowed:false,asset,runtime_snapshot:runtime,targets,blockers:uniqueBlockers,idempotency_key:`marketing-approval-preview-v1:${digest(identity)}`};
}
