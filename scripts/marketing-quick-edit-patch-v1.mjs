import { createHash } from 'node:crypto';

const MAX_OPERATIONS=24;
const MAX_SPEC_BYTES=256_000;
const MAX_TEXT_LENGTH=500;
const MAX_LAYERS=24;
const FORBIDDEN_SEGMENTS=new Set(['__proto__','prototype','constructor']);
const LAYER_FIELDS=new Set(['text','x','y','width','height','fontSize','fontWeight','color','fill','radius','hidden','align','lineHeight']);

function fail(message){throw new Error(message)}
function sha256(value){return createHash('sha256').update(value).digest('hex')}
function stable(value){if(Array.isArray(value))return value.map(stable);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]))}
function canonical(value){return JSON.stringify(stable(value))}
function hashValue(value){return sha256(canonical(value))}
function clone(value){return structuredClone(value)}
function finite(value){return typeof value==='number'&&Number.isFinite(value)}

function validateBase(input){
  if(!input||typeof input!=='object'||Array.isArray(input))fail('invalid_edit_input');
  const assetId=String(input.asset_id??'').trim();
  if(!/^[A-Za-z0-9._:-]{1,160}$/.test(assetId))fail('invalid_asset_id');
  const revision=Number(input.revision);
  if(!Number.isInteger(revision)||revision<1||revision>1_000_000)fail('invalid_revision');
  const generationMode=String(input.generation_mode??'').trim();
  if(!['no_ai','manual'].includes(generationMode))fail('ai_mode_forbidden');
  const renderProfile=String(input.render_profile??'').trim();
  if(!['square_1_1','story_9_16','pinterest_2_3'].includes(renderProfile))fail('invalid_render_profile');
  if(!input.spec||typeof input.spec!=='object'||Array.isArray(input.spec))fail('invalid_spec');
  if(!Array.isArray(input.spec.layers)||input.spec.layers.length>MAX_LAYERS)fail('invalid_layers');
  if(Buffer.byteLength(canonical(input.spec),'utf8')>MAX_SPEC_BYTES)fail('spec_too_large');
  return {assetId,revision,generationMode,renderProfile};
}

function parsePath(path,spec){
  if(typeof path!=='string'||path.length<1||path.length>120||!path.startsWith('/'))fail('path_not_allowed');
  const parts=path.slice(1).split('/');
  if(parts.some(part=>FORBIDDEN_SEGMENTS.has(part)))fail('path_not_allowed');
  if(parts.length===1&&parts[0]==='background')return {kind:'background',parts};
  if(parts.length!==3||parts[0]!=='layers'||!/^(0|[1-9][0-9]*)$/.test(parts[1])||!LAYER_FIELDS.has(parts[2]))fail('path_not_allowed');
  const index=Number(parts[1]);
  if(index<0||index>=spec.layers.length)fail('path_not_allowed');
  return {kind:'layer',parts,index,field:parts[2]};
}

function validateValue(target,value){
  if(target.kind==='background'){
    if(typeof value!=='string'||value.length<1||value.length>80)fail('invalid_patch_value');
    return;
  }
  const field=target.field;
  if(field==='text'){
    if(typeof value!=='string'||value.length>MAX_TEXT_LENGTH)fail('invalid_patch_value');
    return;
  }
  if(field==='hidden'){
    if(typeof value!=='boolean')fail('invalid_patch_value');
    return;
  }
  if(field==='align'){
    if(!['left','center','right'].includes(value))fail('invalid_patch_value');
    return;
  }
  if(field==='color'||field==='fill'){
    if(typeof value!=='string'||value.length<1||value.length>80)fail('invalid_patch_value');
    return;
  }
  if(!finite(value))fail('invalid_patch_value');
  const ranges={x:[-2160,2160],y:[-2160,2160],width:[1,2160],height:[1,2160],fontSize:[10,240],fontWeight:[100,900],radius:[0,1080],lineHeight:[0.8,2]};
  const [min,max]=ranges[field]||[];
  if(min===undefined||value<min||value>max)fail('invalid_patch_value');
}

function getValue(spec,target){
  if(target.kind==='background')return spec.background;
  return spec.layers[target.index][target.field];
}
function setValue(spec,target,value){
  if(target.kind==='background')spec.background=value;
  else spec.layers[target.index][target.field]=value;
}

export function applyMarketingQuickEditPatch(input={},patch={}){
  const {assetId,revision,generationMode,renderProfile}=validateBase(input);
  if(!patch||typeof patch!=='object'||Array.isArray(patch))fail('invalid_patch');
  const changeNote=String(patch.change_note??'').trim();
  if(changeNote.length<1||changeNote.length>1000)fail('change_note_required');
  const operations=Array.isArray(patch.operations)?patch.operations:null;
  if(!operations||operations.length<1)fail('operations_required');
  if(operations.length>MAX_OPERATIONS)fail('too_many_operations');
  const nextSpec=clone(input.spec);
  const diff=[];
  for(const operation of operations){
    if(!operation||typeof operation!=='object'||Array.isArray(operation))fail('invalid_operation');
    if(operation.op!=='replace')fail('operation_not_allowed');
    const target=parsePath(operation.path,nextSpec);
    validateValue(target,operation.value);
    const before=getValue(nextSpec,target);
    const after=operation.value;
    setValue(nextSpec,target,after);
    diff.push(Object.freeze({
      path:operation.path,
      changed:canonical(before)!==canonical(after),
      before_type:before===null?'null':Array.isArray(before)?'array':typeof before,
      after_type:after===null?'null':Array.isArray(after)?'array':typeof after,
      before_sha256:hashValue(before),
      after_sha256:hashValue(after)
    }));
  }
  if(Buffer.byteLength(canonical(nextSpec),'utf8')>MAX_SPEC_BYTES)fail('spec_too_large');
  const baseSpecSha256=hashValue(input.spec);
  const specSha256=hashValue(nextSpec);
  if(baseSpecSha256===specSha256)fail('no_effective_change');
  const revisionNext=revision+1;
  const patchDigest=hashValue({asset_id:assetId,from_revision:revision,revision:revisionNext,render_profile:renderProfile,generation_mode:generationMode,change_note:changeNote,operations});
  return Object.freeze({
    schema_version:'marketing-quick-edit-result-v1',
    asset_id:assetId,
    from_revision:revision,
    revision:revisionNext,
    render_profile:renderProfile,
    generation_mode:generationMode,
    change_note:changeNote,
    spec:Object.freeze(nextSpec),
    base_spec_sha256:baseSpecSha256,
    spec_sha256:specSha256,
    patch_sha256:patchDigest,
    diff:Object.freeze(diff),
    preview_only:true,
    mutations_allowed:false,
    external_side_effect:false,
    network_allowed:false,
    provider_call_allowed:false,
    storage_write_allowed:false,
    filesystem_write_allowed:false,
    idempotency_key:`marketing-quick-edit-v1:${patchDigest.slice(0,32)}`
  });
}
