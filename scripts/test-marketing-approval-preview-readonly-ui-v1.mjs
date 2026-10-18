import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const path='admin-v3/marketing-approval-preview-readonly-v1.js';
assert.ok(fs.existsSync(path),'readonly approval preview UI must exist');
const source=fs.readFileSync(path,'utf8');

for(const forbidden of [
  'fetch(', 'XMLHttpRequest', 'axios', 'https.request', 'http.request',
  'Authorization', 'Bearer ', 'access_token', 'client_secret', 'service_role',
  'graph.facebook.com', 'api.pinterest.com', 'mybusiness.googleapis.com', 'api.openai.com',
  'approve_asset', 'schedule_job', 'publish(', 'execute(', 'requeue('
]) assert.ok(!source.includes(forbidden),`readonly approval preview UI must stay local and non-mutating: ${forbidden}`);

const context={window:{}};
vm.createContext(context);
vm.runInContext(source,context,{filename:path});
const ui=context.window.DAMarketingApprovalPreviewReadonlyV1;
assert.ok(ui,'readonly approval preview UI API must be exported');
assert.equal(typeof ui.validatePacket,'function');
assert.equal(typeof ui.renderHtml,'function');

const renderMetadata={
  schema_version:'marketing-render-preview-metadata-v1',asset_id:'asset-1',revision:1,render_profile:'story_9_16',width:1080,height:1920,mime_type:'image/png',byte_length:54321,
  sha256:'a'.repeat(64),manifest_idempotency_key:'marketing-render-manifest-v1:test',raster_idempotency_key:'marketing-raster-png-buffer-v1:test',
  ai_used:false,requires_ai_preflight:false,preview_only:true,external_side_effect:false,network_allowed:false,provider_call_allowed:false,storage_write_allowed:false,idempotency_key:'marketing-render-preview-metadata-v1:test'
};
const packet={
  schema_version:'marketing-approval-preview-v1',
  preview_only:true,
  approval_state:'preview_only',
  ready_for_real_publish:false,
  external_side_effect:false,
  network_allowed:false,
  mutations_allowed:false,
  asset:{id:'asset-1',title:'Oferta <script>alert(1)</script>',status:'review',media_kind:'image',generation_mode:'no_ai'},
  runtime_snapshot:{enabled:false,execution_mode:'off',canary_percent:0,kill_switch:true,publishing_enabled:false,require_approval:true,max_daily_publications:0,max_daily_ai_cost_cents:0},
  targets:[{
    channel:'instagram_story',
    preflight:{ok:true,dry_run:true,external_side_effect:false,network_allowed:false,publisher_enabled:false,idempotency_key:'marketing-preflight-v1:test',validation:{errors:[],warnings:[]}},
    render_validation:{status:'compatible',expected_profile:'story_9_16',actual_profile:'story_9_16',error:null},
    render_preview_metadata:renderMetadata,
    render_preview_validation:{status:'compatible',expected_profile:'story_9_16',actual_profile:'story_9_16',error:null}
  }],
  blockers:['marketing_disabled','kill_switch_on','publishing_disabled'],
  idempotency_key:'marketing-approval-preview-v1:test'
};

const safe=ui.validatePacket(packet);
assert.equal(safe.external_side_effect,false);
assert.equal(safe.preview_only,true);
assert.equal(safe.ready_for_real_publish,false);
const html=ui.renderHtml(packet);
assert.match(html,/Oferta &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.match(html,/instagram_story/);
assert.match(html,/story_9_16/);
assert.match(html,/1080×1920/);
assert.match(html,/aaaaaaaaaaaaaaaa/);
assert.match(html,/marketing_disabled/);
assert.ok(!html.includes('<script>alert(1)</script>'));

for(const [field,value] of [
  ['preview_only',false],
  ['ready_for_real_publish',true],
  ['external_side_effect',true],
  ['network_allowed',true],
  ['mutations_allowed',true]
]) assert.throws(()=>ui.validatePacket({...packet,[field]:value}),/unsafe_preview_packet/);

const unsafeTarget={...packet,targets:[{...packet.targets[0],render_preview_metadata:{...renderMetadata,storage_write_allowed:true}}]};
assert.throws(()=>ui.validatePacket(unsafeTarget),/unsafe_render_preview_metadata/);
assert.throws(()=>ui.validatePacket({...packet,schema_version:'other'}),/unsupported_preview_schema/);
assert.throws(()=>ui.validatePacket({...packet,targets:[]}),/preview_targets_required/);

console.log('PASS: dormant approval preview UI is local-only, fail-closed, escaped, render-integrity-aware and non-mutating.');
