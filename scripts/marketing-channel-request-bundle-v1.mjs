const CHANNEL_OPERATIONS=Object.freeze({
  whatsapp_status:'manual_confirmation_only',
  instagram_story:'create_story_container_preview',
  facebook_story:'create_story_preview',
  instagram_carousel:'create_carousel_container_preview',
  pinterest_pin:'create_pin_preview',
  google_business_post:'create_local_post_preview'
});
const CHANNEL_PROFILES=Object.freeze({
  whatsapp_status:Object.freeze(['story_9_16']),
  instagram_story:Object.freeze(['story_9_16']),
  facebook_story:Object.freeze(['story_9_16']),
  instagram_carousel:Object.freeze(['square_1_1']),
  pinterest_pin:Object.freeze(['pinterest_2_3']),
  google_business_post:Object.freeze(['square_1_1'])
});
const SENSITIVE_KEYS=/(^|_)(token|secret|password|credential|authorization|private_key|api_key)(_|$)/i;
function sensitive(value){
  if(!value||typeof value!=='object')return false;
  if(Array.isArray(value))return value.some(sensitive);
  return Object.entries(value).some(([key,child])=>SENSITIVE_KEYS.test(key)||sensitive(child));
}
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value))}
function formatValidation(channel,renderProfile){
  const accepted=[...CHANNEL_PROFILES[channel]];
  const profile=String(renderProfile||'').trim();
  if(!profile)return Object.freeze({status:'not_provided',render_profile:null,accepted_profiles:accepted});
  if(!accepted.includes(profile))throw new Error('channel_format_mismatch');
  return Object.freeze({status:'compatible',render_profile:profile,accepted_profiles:accepted});
}
export function buildMarketingChannelRequestBundle(preflight={}){
  if(!preflight||typeof preflight!=='object'||Array.isArray(preflight)||preflight.schema_version!=='marketing-channel-preflight-v1'||preflight.ok!==true)throw new Error('invalid_preflight');
  if(preflight.external_side_effect!==false||preflight.network_allowed!==false||preflight.publisher_enabled!==false||preflight.dry_run!==true||preflight.credentials_required_now!==false)throw new Error('unsafe_preflight');
  if(!Object.hasOwn(CHANNEL_OPERATIONS,preflight.channel))throw new Error('unsupported_channel');
  if(sensitive(preflight.request_preview))throw new Error('sensitive_material_forbidden');
  const requestBodyPreview=clone(preflight.request_preview);
  const format=formatValidation(preflight.channel,preflight.render_profile);
  return Object.freeze({
    schema_version:'marketing-channel-request-bundle-v1',
    channel:preflight.channel,
    official_api_family:String(preflight.official_api_family||''),
    publication_path:String(preflight.publication_path||''),
    operation:CHANNEL_OPERATIONS[preflight.channel],
    dry_run:true,
    dispatch_allowed:false,
    external_side_effect:false,
    network_allowed:false,
    credentials_required_now:false,
    endpoint:null,
    authorization:null,
    request_body_preview:requestBodyPreview,
    render_profile:format.render_profile,
    format_validation:format,
    required_gates:Array.isArray(preflight.required_gates)?[...preflight.required_gates]:[],
    validation:clone(preflight.validation||{errors:[],warnings:[]}),
    idempotency_key:String(preflight.idempotency_key||'')
  });
}
