import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { buildMarketingRenderImagePreviewPipeline } from './marketing-render-image-preview-pipeline-v1.mjs';

const tinyPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nxoAAAAASUVORK5CYII=','base64');
const input={
  asset_id:'asset-memory-1',
  revision:3,
  render_profile:'square_1_1',
  generation_mode:'no_ai',
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

console.log('PASS: Marketing image preview pipeline stays fully in memory, deterministic and fail-closed.');
