import test from 'node:test';
import assert from 'node:assert/strict';
import {assessRenderAssets,visualAssetSpecs} from '../render-assets.js';

const req={need:'flower',keywords:['nature'],role:'support',actions:['rise']};

test('accepts raster and SVG visual assets for the first renderer',()=>{
  const assessed=assessRenderAssets([
    {status:'resolved_local',request:req,asset:{id:'a',file_format:'png',local_storage_path:'poly/a.png',asset_type:'image'}},
    {status:'acquired',request:{...req,need:'leaf'},asset:{id:'b',file_format:'svg',local_storage_path:'kenney/b.svg',asset_type:'image'}}
  ]);
  assert.equal(assessed.summary.ready,2);assert.equal(assessed.summary.blocked,0);
});

test('blocks 3d models until a 3d compositor exists',()=>{
  const assessed=assessRenderAssets([{status:'acquired',request:req,asset:{id:'m',file_format:'glb',local_storage_path:'poly/m.glb',asset_type:'3d_model'}}]);
  assert.equal(assessed.items[0].status,'blocked');assert.equal(assessed.items[0].reason,'renderer_format_unsupported');assert.equal(assessed.summary.blocked,1);
});

test('keeps procedural assets renderable without storage download',()=>{
  const assessed=assessRenderAssets([{status:'procedural',request:{...req,need:'confetti'},procedural:{kind:'confetti'}}]);
  assert.equal(assessed.summary.ready,1);assert.equal(assessed.items[0].status,'procedural');
});

test('extracts only stored visual assets with semantic timing hints',()=>{
  const items=assessRenderAssets([{status:'resolved_local',request:{...req,actions:['rise']},asset:{id:'a',file_format:'webp',local_storage_path:'poly/a.webp',asset_type:'image'}}]).items;
  const specs=visualAssetSpecs(items,{duration:18});assert.equal(specs.length,1);assert.equal(specs[0].storage_path,'poly/a.webp');assert.equal(specs[0].motion,'rise');assert.ok(specs[0].end>specs[0].start);
});
