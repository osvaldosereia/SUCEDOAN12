import test from 'node:test';
import assert from 'node:assert/strict';
import {createPolyHavenProvider} from '../providers/polyhaven.js';

const assets={
  floral_field:{name:'Floral Field',description:'flowers and grass',category:'nature',tags:['flower','field','grass'],type:1},
  brick_wall:{name:'Brick Wall',description:'red brick',category:'urban',tags:['brick','wall'],type:1}
};
const files={diff:{'1k':{jpg:{url:'https://dl.polyhaven.org/floral_field_1k.jpg',size:400000}}},blend:{'4k':{blend:{url:'https://dl.polyhaven.org/floral_field.blend',size:50000000}}}};

test('searches metadata semantically without downloading files',async()=>{
  const calls=[];
  const fetcher=async url=>{calls.push(url);return {ok:true,json:async()=>assets}};
  const p=createPolyHavenProvider({fetcher});
  const found=await p.search({need:'flower',keywords:['field']},{limit:5});
  assert.equal(found[0].source_asset_id,'floral_field');
  assert.equal(found[0].license_code,'CC0');
  assert.equal(found[0].commercial_use_allowed,true);
  assert.equal(calls.length,1);
});

test('acquire fetches file manifest only for the selected winner and chooses lightweight web asset',async()=>{
  const fetcher=async url=>({ok:true,json:async()=>url.includes('/files/')?files:assets});
  const p=createPolyHavenProvider({fetcher});
  const [candidate]=await p.search({need:'flower',keywords:['field']},{limit:1});
  const asset=await p.acquire(candidate);
  assert.equal(asset.source_download_url,'https://dl.polyhaven.org/floral_field_1k.jpg');
  assert.equal(asset.file_format,'jpg');
  assert.equal(asset.attribution_required,true);
});

test('acquire returns null when only unsupported 3D files exist',async()=>{
  const only3d={models:{'1k':{glb:{url:'https://dl.polyhaven.org/floral_field.glb',size:700000}}}};
  const fetcher=async url=>({ok:true,json:async()=>url.includes('/files/')?only3d:assets});
  const p=createPolyHavenProvider({fetcher});
  const [candidate]=await p.search({need:'flower',keywords:['field']},{limit:1});
  const asset=await p.acquire(candidate);
  assert.equal(asset,null);
});
