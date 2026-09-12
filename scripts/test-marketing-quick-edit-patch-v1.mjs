import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { applyMarketingQuickEditPatch } from './marketing-quick-edit-patch-v1.mjs';
import { buildMarketingRenderImagePreviewPipeline } from './marketing-render-image-preview-pipeline-v1.mjs';

const base={
  asset_id:'asset-quick-edit-1',
  revision:4,
  generation_mode:'no_ai',
  render_profile:'square_1_1',
  spec:{
    width:1080,
    height:1080,
    background:'#f2f2f2',
    layers:[
      {type:'rect',x:40,y:40,width:1000,height:1000,fill:'#ffffff',radius:32},
      {type:'text',text:'Oferta Dona Antônia',x:110,y:610,width:860,fontSize:72,fontWeight:700,color:'#111827'},
      {type:'text',text:'Peça pelo WhatsApp',x:110,y:760,width:860,fontSize:42,fontWeight:600,color:'#173f2a'}
    ]
  }
};

const patch={
  change_note:'Atualiza chamada e CTA sem IA',
  operations:[
    {op:'replace',path:'/layers/1/text',value:'Ofertas de hoje'},
    {op:'replace',path:'/layers/2/text',value:'Encomende pelo WhatsApp'},
    {op:'replace',path:'/layers/1/fontSize',value:68},
    {op:'replace',path:'/background',value:'#eeeeee'}
  ]
};

const first=applyMarketingQuickEditPatch(base,patch);
const second=applyMarketingQuickEditPatch(base,patch);
assert.equal(first.schema_version,'marketing-quick-edit-result-v1');
assert.equal(first.asset_id,base.asset_id);
assert.equal(first.from_revision,4);
assert.equal(first.revision,5);
assert.equal(first.generation_mode,'no_ai');
assert.equal(first.preview_only,true);
assert.equal(first.external_side_effect,false);
assert.equal(first.network_allowed,false);
assert.equal(first.provider_call_allowed,false);
assert.equal(first.storage_write_allowed,false);
assert.equal(first.filesystem_write_allowed,false);
assert.match(first.base_spec_sha256,/^[0-9a-f]{64}$/);
assert.match(first.spec_sha256,/^[0-9a-f]{64}$/);
assert.notEqual(first.spec_sha256,first.base_spec_sha256);
assert.equal(first.idempotency_key,second.idempotency_key);
assert.equal(first.spec_sha256,second.spec_sha256);
assert.equal(first.spec.layers[1].text,'Ofertas de hoje');
assert.equal(first.spec.layers[2].text,'Encomende pelo WhatsApp');
assert.equal(first.spec.layers[1].fontSize,68);
assert.equal(first.spec.background,'#eeeeee');
assert.deepEqual(base.spec.layers[1].text,'Oferta Dona Antônia');
assert.equal(first.diff.length,4);
for(const item of first.diff){
  assert.match(item.before_sha256,/^[0-9a-f]{64}$/);
  assert.match(item.after_sha256,/^[0-9a-f]{64}$/);
  assert.equal(item.changed,true);
  assert.ok(!Object.hasOwn(item,'before'));
  assert.ok(!Object.hasOwn(item,'after'));
  assert.ok(!Object.hasOwn(item,'value'));
}
assert.ok(!JSON.stringify(first.diff).includes('Ofertas de hoje'));
assert.ok(!JSON.stringify(first.diff).includes('Encomende pelo WhatsApp'));

const rendered=await buildMarketingRenderImagePreviewPipeline({
  asset_id:first.asset_id,
  revision:first.revision,
  render_profile:first.render_profile,
  generation_mode:first.generation_mode,
  spec:first.spec,
  image_assets:{},
  resource_budget:{max_input_bytes:12_000_000,max_svg_bytes:2_000_000,max_png_bytes:8_000_000,max_complexity_units:200}
});
assert.equal(rendered.revision,5);
assert.equal(rendered.render_integrity.spec_sha256,first.spec_sha256);
assert.equal(rendered.preview_only,true);
assert.equal(rendered.external_side_effect,false);

await assert.rejects(async()=>applyMarketingQuickEditPatch({...base,generation_mode:'ai'},patch),/ai_mode_forbidden/);
assert.throws(()=>applyMarketingQuickEditPatch(base,{...patch,operations:[{op:'add',path:'/layers/0/text',value:'x'}]}),/operation_not_allowed/);
assert.throws(()=>applyMarketingQuickEditPatch(base,{...patch,operations:[{op:'replace',path:'/width',value:999}]}),/path_not_allowed/);
assert.throws(()=>applyMarketingQuickEditPatch(base,{...patch,operations:[{op:'replace',path:'/layers/1/type',value:'image'}]}),/path_not_allowed/);
assert.throws(()=>applyMarketingQuickEditPatch(base,{...patch,operations:[{op:'replace',path:'/layers/__proto__/text',value:'x'}]}),/path_not_allowed/);
assert.throws(()=>applyMarketingQuickEditPatch(base,{...patch,operations:Array.from({length:25},()=>({op:'replace',path:'/background',value:'#fff'}))}),/too_many_operations/);
assert.throws(()=>applyMarketingQuickEditPatch(base,{...patch,operations:[{op:'replace',path:'/layers/1/fontSize',value:9999}]}),/invalid_patch_value/);
assert.throws(()=>applyMarketingQuickEditPatch(base,{...patch,operations:[{op:'replace',path:'/layers/1/text',value:'x'.repeat(501)}]}),/invalid_patch_value/);
assert.throws(()=>applyMarketingQuickEditPatch(base,{...patch,change_note:''}),/change_note_required/);

const source=await fs.readFile('scripts/marketing-quick-edit-patch-v1.mjs','utf8');
for(const forbidden of [
  "from 'node:fs'",
  "from 'node:fs/promises'",
  'writeFile(',
  'fetch(',
  'XMLHttpRequest',
  'axios',
  'https.request',
  'http.request',
  'api.openai.com',
  'graph.facebook.com',
  'api.pinterest.com',
  'googleapis.com'
]) assert.ok(!source.includes(forbidden),`quick edit must remain local-only: ${forbidden}`);

console.log('PASS: Marketing quick edit patches are allowlisted, versioned, deterministic, metadata-only and re-render through the guarded in-memory pipeline.');
