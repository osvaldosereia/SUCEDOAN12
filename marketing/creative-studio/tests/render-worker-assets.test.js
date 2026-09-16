import test from 'node:test';
import assert from 'node:assert/strict';
import {storedAssetDownloads} from '../render-worker-assets.js';

test('extracts only renderable stored assets from a resolved job',()=>{
  const job={duration_seconds:18,resolved_assets:{items:[
    {status:'resolved_local',request:{need:'flower',role:'support',actions:['rise']},asset:{id:'a',file_format:'png',local_storage_path:'poly/a.png',asset_type:'image'}},
    {status:'procedural',request:{need:'confetti'},procedural:{kind:'confetti'}},
    {status:'blocked',request:{need:'model'},asset:{id:'m',file_format:'glb',local_storage_path:'poly/m.glb',asset_type:'3d_model'}}
  ]}};
  const specs=storedAssetDownloads(job);
  assert.equal(specs.length,1);
  assert.equal(specs[0].storage_path,'poly/a.png');
  assert.equal(specs[0].motion,'rise');
  assert.equal(specs[0].bucket,'creative-studio-assets');
});

test('preserves explicit storage bucket and semantic timing',()=>{
  const job={duration_seconds:20,resolved_assets:{items:[{status:'acquired',request:{need:'ice',role:'foreground',actions:['drop']},asset:{id:'b',file_format:'webp',local_storage_path:'ice/b.webp',storage_bucket:'custom-assets',asset_type:'image'}}]}};
  const [spec]=storedAssetDownloads(job);
  assert.equal(spec.bucket,'custom-assets');
  assert.equal(spec.motion,'drop');
  assert.ok(spec.end>spec.start);
});
