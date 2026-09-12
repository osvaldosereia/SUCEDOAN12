import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMarketingApprovalPreview } from './marketing-approval-preview-v1.mjs';

const image={url:'https://cdn.example.test/cesta.webp',mime_type:'image/webp',alt_text:'Cesta Dona Antônia'};
const runtime={
  enabled:false,
  execution_mode:'off',
  canary_percent:0,
  kill_switch:true,
  publishing_enabled:false,
  require_approval:true,
  instagram_story_publish_enabled:false,
  max_daily_publications:0,
  max_daily_ai_cost_cents:0
};

const packet=buildMarketingApprovalPreview({
  asset:{id:'asset-1',title:'Oferta da semana',status:'review',media_kind:'image',generation_mode:'no_ai'},
  runtime,
  targets:[{channel:'instagram_story',input:{account_ref:'ig:principal',caption:'Oferta da semana',media:[image]}}]
});

assert.equal(packet.schema_version,'marketing-approval-preview-v1');
assert.equal(packet.external_side_effect,false);
assert.equal(packet.network_allowed,false);
assert.equal(packet.mutations_allowed,false);
assert.equal(packet.preview_only,true);
assert.equal(packet.approval_state,'preview_only');
assert.equal(packet.ready_for_real_publish,false);
assert.equal(packet.asset.id,'asset-1');
assert.equal(packet.targets.length,1);
assert.equal(packet.targets[0].channel,'instagram_story');
assert.equal(packet.targets[0].preflight.ok,true);
assert.equal(packet.targets[0].preflight.publisher_enabled,false);
assert.ok(packet.blockers.includes('marketing_disabled'));
assert.ok(packet.blockers.includes('kill_switch_on'));
assert.ok(packet.blockers.includes('execution_mode_not_live'));
assert.ok(packet.blockers.includes('publishing_disabled'));
assert.ok(packet.blockers.includes('channel_gate_off:instagram_story'));
assert.ok(packet.blockers.includes('publication_budget_zero'));
assert.equal(typeof packet.idempotency_key,'string');
assert.ok(packet.idempotency_key.startsWith('marketing-approval-preview-v1:'));

const same=buildMarketingApprovalPreview({
  asset:{id:'asset-1',title:' Oferta   da semana ',status:'review',media_kind:'image',generation_mode:'no_ai'},
  runtime,
  targets:[{channel:'instagram_story',input:{account_ref:'ig:principal',caption:'Oferta da semana',media:[image]}}]
});
assert.equal(packet.idempotency_key,same.idempotency_key);

const invalid=buildMarketingApprovalPreview({
  asset:{id:'asset-2',title:'Carrossel',status:'review',media_kind:'carousel'},
  runtime,
  targets:[{channel:'instagram_carousel',input:{account_ref:'ig:principal',media:[image]}}]
});
assert.equal(invalid.targets[0].preflight.ok,false);
assert.ok(invalid.blockers.some(x=>x.startsWith('preflight_invalid:instagram_carousel:')));

const sensitive=buildMarketingApprovalPreview({
  asset:{id:'asset-3',title:'Story',status:'review',media_kind:'image'},
  runtime,
  targets:[{channel:'instagram_story',input:{account_ref:'ig:principal',access_token:'never-copy-me',media:[image]}}]
});
assert.equal(sensitive.targets[0].preflight.ok,false);
assert.ok(!JSON.stringify(sensitive).includes('never-copy-me'));

assert.throws(()=>buildMarketingApprovalPreview({asset:null,runtime,targets:[]}),/asset_required/);
assert.throws(()=>buildMarketingApprovalPreview({asset:{id:'a'},runtime,targets:[]}),/target_required/);

const source=fs.readFileSync('scripts/marketing-approval-preview-v1.mjs','utf8');
for(const forbidden of [
  'fetch(', 'XMLHttpRequest', 'axios', 'https.request', 'http.request',
  'Authorization', 'Bearer ', 'access_token', 'client_secret', 'service_role',
  'graph.facebook.com', 'api.pinterest.com', 'mybusiness.googleapis.com', 'api.openai.com'
]) assert.ok(!source.includes(forbidden),`approval preview must stay local/read-only: ${forbidden}`);

console.log('PASS: Marketing approval preview is deterministic, credential-free, read-only and rollout-blocked.');