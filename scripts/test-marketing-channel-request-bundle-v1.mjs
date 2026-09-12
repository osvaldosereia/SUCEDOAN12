import assert from 'node:assert/strict';
import { buildMarketingChannelRequestBundle } from './marketing-channel-request-bundle-v1.mjs';

const base={
  schema_version:'marketing-channel-preflight-v1',
  channel:'instagram_story',
  ok:true,
  dry_run:true,
  external_side_effect:false,
  network_allowed:false,
  credentials_required_now:false,
  publisher_enabled:false,
  publication_path:'official_api_preflight',
  official_api_family:'meta_instagram_content_publishing',
  render_profile:'story_9_16',
  required_gates:['enabled','publishing_enabled','instagram_story_publish_enabled'],
  request:null,
  request_preview:{account_ref:'ig-account',container_type:'STORIES',caption:'Oferta',media:[{url:'https://example.com/a.jpg',mime_type:'image/jpeg'}]},
  validation:{errors:[],warnings:[]},
  idempotency_key:'marketing-preflight-v1:abc'
};

const bundle=buildMarketingChannelRequestBundle(base);
assert.equal(bundle.schema_version,'marketing-channel-request-bundle-v1');
assert.equal(bundle.channel,'instagram_story');
assert.equal(bundle.dry_run,true);
assert.equal(bundle.dispatch_allowed,false);
assert.equal(bundle.external_side_effect,false);
assert.equal(bundle.network_allowed,false);
assert.equal(bundle.credentials_required_now,false);
assert.equal(bundle.endpoint,null);
assert.equal(bundle.authorization,null);
assert.equal(bundle.request_body_preview.container_type,'STORIES');
assert.deepEqual(bundle.required_gates,base.required_gates);
assert.equal(bundle.idempotency_key,'marketing-preflight-v1:abc');
assert.deepEqual(bundle.format_validation,{status:'compatible',render_profile:'story_9_16',accepted_profiles:['story_9_16']});

assert.throws(()=>buildMarketingChannelRequestBundle({...base,external_side_effect:true}),/unsafe_preflight/);
assert.throws(()=>buildMarketingChannelRequestBundle({...base,network_allowed:true}),/unsafe_preflight/);
assert.throws(()=>buildMarketingChannelRequestBundle({...base,publisher_enabled:true}),/unsafe_preflight/);
assert.throws(()=>buildMarketingChannelRequestBundle({...base,ok:false}),/invalid_preflight/);
assert.throws(()=>buildMarketingChannelRequestBundle({...base,request_preview:{token:'secret'}}),/sensitive_material_forbidden/);
assert.throws(()=>buildMarketingChannelRequestBundle({...base,render_profile:'square_1_1'}),/channel_format_mismatch/);

const wa=buildMarketingChannelRequestBundle({...base,channel:'whatsapp_status',render_profile:'story_9_16',publication_path:'manual_confirm',official_api_family:'whatsapp_business_platform',request_preview:null});
assert.equal(wa.operation,'manual_confirmation_only');
assert.equal(wa.dispatch_allowed,false);
assert.equal(wa.format_validation.status,'compatible');

const pin=buildMarketingChannelRequestBundle({...base,channel:'pinterest_pin',render_profile:'pinterest_2_3',request_preview:{board_ref:'board',media:[{url:'https://example.com/p.jpg',mime_type:'image/jpeg'}]}});
assert.equal(pin.format_validation.status,'compatible');
assert.deepEqual(pin.format_validation.accepted_profiles,['pinterest_2_3']);

const square=buildMarketingChannelRequestBundle({...base,channel:'google_business_post',render_profile:'square_1_1',request_preview:{location_ref:'location',media:[{url:'https://example.com/g.jpg',mime_type:'image/jpeg'}]}});
assert.equal(square.format_validation.status,'compatible');

const legacy=buildMarketingChannelRequestBundle({...base,render_profile:undefined});
assert.equal(legacy.format_validation.status,'not_provided');
assert.equal(legacy.dispatch_allowed,false);

console.log('PASS: channel request bundle stays credential-free, endpoint-free, non-dispatching and format-aware.');
