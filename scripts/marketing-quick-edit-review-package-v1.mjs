import { createHash } from 'node:crypto';
import { buildMarketingApprovalPreview } from './marketing-approval-preview-v1.mjs';

function fail(message){throw new Error(message)}
function text(value){return String(value??'').trim()}
function isSha(value){return /^[a-f0-9]{64}$/i.test(text(value))}
function stable(value){if(Array.isArray(value))return value.map(stable);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]))}
function sha256(value){return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}

function validateQuickEdit(value){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('quick_edit_required');
  if(value.schema_version!=='marketing-quick-edit-result-v1')fail('quick_edit_schema_invalid');
  if(value.preview_only!==true||value.mutations_allowed!==false||value.external_side_effect!==false||value.network_allowed!==false||value.provider_call_allowed!==false||value.storage_write_allowed!==false||value.filesystem_write_allowed!==false)fail('unsafe_quick_edit');
  if(!text(value.asset_id)||!Number.isInteger(Number(value.from_revision))||!Number.isInteger(Number(value.revision))||Number(value.revision)!==Number(value.from_revision)+1)fail('quick_edit_revision_invalid');
  if(!isSha(value.base_spec_sha256)||!isSha(value.spec_sha256)||!isSha(value.patch_sha256))fail('quick_edit_hash_invalid');
  if(!Array.isArray(value.diff)||value.diff.length<1)fail('quick_edit_diff_invalid');
  const diff=value.diff.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item)||!text(item.path)||typeof item.changed!=='boolean'||!isSha(item.before_sha256)||!isSha(item.after_sha256))fail('quick_edit_diff_invalid');
    return Object.freeze({path:text(item.path),changed:item.changed,before_type:text(item.before_type),after_type:text(item.after_type),before_sha256:text(item.before_sha256).toLowerCase(),after_sha256:text(item.after_sha256).toLowerCase()});
  });
  return Object.freeze({schema_version:'marketing-quick-edit-result-v1',asset_id:text(value.asset_id),from_revision:Number(value.from_revision),revision:Number(value.revision),render_profile:text(value.render_profile),generation_mode:text(value.generation_mode),change_note:text(value.change_note),base_spec_sha256:text(value.base_spec_sha256).toLowerCase(),spec_sha256:text(value.spec_sha256).toLowerCase(),patch_sha256:text(value.patch_sha256).toLowerCase(),diff:Object.freeze(diff),idempotency_key:text(value.idempotency_key)});
}

function validateRenderPipeline(value,quick){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('render_pipeline_required');
  if(value.schema_version!=='marketing-render-image-preview-pipeline-v1')fail('render_pipeline_schema_invalid');
  if(value.preview_only!==true||value.external_side_effect!==false||value.network_allowed!==false||value.provider_call_allowed!==false||value.storage_write_allowed!==false||value.filesystem_write_allowed!==false)fail('unsafe_render_pipeline');
  if(text(value.asset_id)!==quick.asset_id)fail('asset_id_mismatch');
  if(Number(value.revision)!==quick.revision)fail('revision_mismatch');
  if(text(value.render_profile)!==quick.render_profile)fail('render_profile_mismatch');
  const integrity=value.render_integrity;
  const preview=value.preview_metadata;
  const manifest=value.manifest;
  if(!integrity||integrity.schema_version!=='marketing-render-integrity-v1'||!preview||preview.schema_version!=='marketing-render-preview-metadata-v1'||!manifest||manifest.schema_version!=='marketing-render-manifest-v1')fail('render_integrity_missing');
  if(text(integrity.asset_id)!==quick.asset_id||Number(integrity.revision)!==quick.revision||text(integrity.render_profile)!==quick.render_profile)fail('render_integrity_mismatch');
  if(text(integrity.spec_sha256).toLowerCase()!==quick.spec_sha256)fail('spec_sha256_mismatch');
  if(!isSha(integrity.svg_sha256)||!isSha(integrity.png_sha256)||!isSha(preview.sha256))fail('render_integrity_mismatch');
  if(text(integrity.png_sha256).toLowerCase()!==text(preview.sha256).toLowerCase())fail('render_integrity_mismatch');
  if(text(integrity.manifest_idempotency_key)!==text(manifest.idempotency_key)||text(integrity.preview_idempotency_key)!==text(preview.idempotency_key))fail('render_integrity_mismatch');
  return Object.freeze({schema_version:'marketing-render-integrity-v1',asset_id:quick.asset_id,revision:quick.revision,render_profile:quick.render_profile,spec_sha256:quick.spec_sha256,svg_sha256:text(integrity.svg_sha256).toLowerCase(),png_sha256:text(integrity.png_sha256).toLowerCase(),manifest_idempotency_key:text(integrity.manifest_idempotency_key),preview_idempotency_key:text(integrity.preview_idempotency_key),budget:integrity.budget&&typeof integrity.budget==='object'?stable(integrity.budget):null,idempotency_key:text(integrity.idempotency_key)});
}

function safeApproval(value){
  const targets=Array.isArray(value.targets)?value.targets.map(target=>Object.freeze({channel:text(target.channel),preflight_ok:target.preflight?.ok===true,render_validation_status:text(target.render_validation?.status),render_preview_validation_status:text(target.render_preview_validation?.status),render_integrity_validation_status:text(target.render_integrity_validation?.status),preflight_idempotency_key:text(target.preflight?.idempotency_key),render_manifest_idempotency_key:text(target.render_manifest?.idempotency_key),render_preview_idempotency_key:text(target.render_preview_metadata?.idempotency_key),render_integrity_idempotency_key:text(target.render_integrity?.idempotency_key)})):[];
  return Object.freeze({schema_version:'marketing-approval-preview-v1',preview_only:value.preview_only===true,approval_state:text(value.approval_state),ready_for_real_publish:value.ready_for_real_publish===true,external_side_effect:value.external_side_effect===true,network_allowed:value.network_allowed===true,mutations_allowed:value.mutations_allowed===true,targets:Object.freeze(targets),blockers:Object.freeze([...(value.blockers||[]).map(text)]),idempotency_key:text(value.idempotency_key)});
}

export function buildMarketingQuickEditReviewPackage(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))fail('invalid_review_input');
  const quick=validateQuickEdit(input.quick_edit);
  const integrity=validateRenderPipeline(input.render_pipeline,quick);
  const approvalRaw=buildMarketingApprovalPreview({asset:{id:quick.asset_id,title:'',status:'review',media_kind:'image',generation_mode:quick.generation_mode},runtime:input.runtime||{},targets:input.targets||[]});
  if(approvalRaw.preview_only!==true||approvalRaw.ready_for_real_publish!==false||approvalRaw.external_side_effect!==false||approvalRaw.network_allowed!==false||approvalRaw.mutations_allowed!==false)fail('unsafe_approval_preview');
  const approval=safeApproval(approvalRaw);
  const blockers=[...new Set(approval.blockers)];
  const basis={asset_id:quick.asset_id,from_revision:quick.from_revision,revision:quick.revision,render_profile:quick.render_profile,quick_edit_key:quick.idempotency_key,spec_sha256:quick.spec_sha256,render_integrity_key:integrity.idempotency_key,approval_preview_key:approval.idempotency_key,blockers};
  const packageSha=sha256(basis);
  return Object.freeze({schema_version:'marketing-quick-edit-review-package-v1',asset_id:quick.asset_id,from_revision:quick.from_revision,revision:quick.revision,render_profile:quick.render_profile,generation_mode:quick.generation_mode,quick_edit:quick,render_integrity:integrity,approval_preview:approval,review_status:blockers.length?'blocked':'preview_only',blockers:Object.freeze(blockers),package_sha256:packageSha,preview_only:true,mutations_allowed:false,external_side_effect:false,network_allowed:false,provider_call_allowed:false,storage_write_allowed:false,filesystem_write_allowed:false,idempotency_key:`marketing-quick-edit-review-package-v1:${packageSha.slice(0,32)}`});
}
