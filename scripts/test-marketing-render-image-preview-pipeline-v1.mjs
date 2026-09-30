import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { buildMarketingRenderImagePreviewPipeline } from './marketing-render-image-preview-pipeline-v1.mjs';

const tinyPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nxoAAAAASUVORK5CYII=','base64');
const input={
  asset_id:'asset-memory-1',
  revision:3,
  render_profile:'square_1_1',
  generation_mode:'no_ai',
  resource_budget:{max_input_bytes:12_000_000,max_svg_bytes:2_000_000,max_png_bytes:8_000_000,max_complexity_units:200},
  spec:{
    width:1080,
    height:1080,
    background:'#f2f2f2',
    layers:[
      {type:'rect',x:40,y:40,width:1000,height:1000,fill:'#ffffff',radius:32},
      {type:'image',asset_ref:'produto',x:110,y:120,width:420,height:420,fit:'contain',alt:'Produto'},
      {type:'text',text:'Cesta Dona Antônia',x:110,y:610,width:860,fontSize:72,fontWeight:700,color:'#111827'}
    ]
  },
  image_assets:{
    produto:{mime_type:'image/png',bytes:tinyPng}
  }
};

const first=await buildMarketingRenderImagePreviewPipeline(input);
const second=await buildMarketingRenderImagePreviewPipeline(input);

assert.equal(first.schema_version,'marketing-render-image-preview-pipeline-v1');
assert.equal(first.preview_only,true);
assert.equal(first.external_side_effect,false);
assert.equal(first.network_allowed,false);
assert.equal(first.provider_call_allowed,false);
assert.equal(first.storage_write_allowed,false);
assert.equal(first.filesystem_write_allowed,false);
assert.equal(first.asset_id,'asset-memory-1');
assert.equal(first.revision,3);
assert.equal(first.render_profile,'square_1_1');
assert.equal(first.svg_metadata.mime_type,'image/svg+xml');
assert.equal(first.svg_metadata.width,1080);
assert.equal(first.svg_metadata.height,1080);
assert.match(first.svg_metadata.sha256,/^[0-9a-f]{64}$/);
assert.equal(first.preview_metadata.mime_type,'image/png');
assert.equal(first.preview_metadata.width,1080);
assert.equal(first.preview_metadata.height,1080);
assert.match(first.preview_metadata.sha256,/^[0-9a-f]{64}$/);
assert.ok(Buffer.isBuffer(first.png_bytes));
assert.ok(first.png_bytes.length>100);
assert.equal(first.idempotency_key,second.idempotency_key);
assert.equal(first.svg_metadata.sha256,second.svg_metadata.sha256);
assert.equal(first.preview_metadata.sha256,second.preview_metadata.sha256);
assert.ok(!Object.hasOwn(first.preview_metadata,'png_bytes'));
assert.ok(!Object.hasOwn(first.svg_metadata,'svg_bytes'));

assert.equal(first.render_integrity.schema_version,'marketing-render-integrity-v1');
assert.match(first.render_integrity.spec_sha256,/^[0-9a-f]{64}$/);
assert.equal(first.render_integrity.svg_sha256,first.svg_metadata.sha256);
assert.equal(first.render_integrity.png_sha256,first.preview_metadata.sha256);
assert.equal(first.render_integrity.manifest_idempotency_key,first.manifest.idempotency_key);
assert.equal(first.render_integrity.preview_idempotency_key,first.preview_metadata.idempotency_key);
assert.equal(first.render_integrity.external_side_effect,false);
assert.equal(first.render_integrity.network_allowed,false);
assert.equal(first.render_integrity.storage_write_allowed,false);
assert.equal(first.render_integrity.filesystem_write_allowed,false);
assert.equal(first.render_integrity.budget.status,'within_budget');
assert.ok(first.render_integrity.budget.complexity_units>0);
assert.ok(first.render_integrity.budget.input_bytes>0);
assert.equal(first.render_integrity.idempotency_key,second.render_integrity.idempotency_key);
assert.ok(!JSON.stringify(first.render_integrity).includes(tinyPng.toString('base64')));

await assert.rejects(
  ()=>buildMarketingRenderImagePreviewPipeline({...input,spec:{...input.spec,width:1081}}),
  /render_profile_canvas_mismatch/
);
await assert.rejects(
  ()=>buildMarketingRenderImagePreviewPipeline({...input,spec:{...input.spec,layers:[{type:'image',asset_ref:'missing'}]}}),
  /image_asset_missing/
);
await assert.rejects(
  ()=>buildMarketingRenderImagePreviewPipeline({...input,image_assets:{produto:{mime_type:'image/png',bytes:Buffer.alloc(4_000_001)}}}),
  /image_asset_too_large/
);
await assert.rejects(
  ()=>buildMarketingRenderImagePreviewPipeline({...input,spec:{...input.spec,layers:[{type:'image',src:'https://example.test/a.png'}]}}),
  /remote_source_forbidden/
);
await assert.rejects(
  ()=>buildMarketingRenderImagePreviewPipeline({...input,resource_budget:{...input.resource_budget,max_complexity_units:1}}),
  /render_complexity_budget_exceeded/
);
await assert.rejects(
  ()=>buildMarketingRenderImagePreviewPipeline({...input,resource_budget:{...input.resource_budget,max_svg_bytes:32}}),
  /svg_budget_exceeded/
);
await assert.rejects(
  ()=>buildMarketingRenderImagePreviewPipeline({...input,resource_budget:{...input.resource_budget,max_png_bytes:32}}),
  /png_budget_exceeded/
);

const source=await fs.readFile('scripts/marketing-render-image-preview-pipeline-v1.mjs','utf8');
for(const forbidden of [
  "from 'node:fs'",
  "from 'node:fs/promises'",
  'writeFile(',
  'mkdir(',
  'fetch(',
  'XMLHttpRequest',
  'axios',
  'https.request',
  'http.request',
  'api.openai.com',
  'generativelanguage.googleapis.com'
]){
  assert.ok(!source.includes(forbidden),`in-memory preview pipeline must not use filesystem/network/provider: ${forbidden}`);
}

console.log('PASS: Marketing image preview pipeline stays fully in memory, budgeted, integrity-linked, deterministic and fail-closed.');
