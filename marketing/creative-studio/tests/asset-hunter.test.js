import test from 'node:test';
import assert from 'node:assert/strict';
import {huntAsset} from '../asset-hunter.js';

const safe={source_asset_id:'flower-1',source_url:'https://example.invalid/flower',object:'flower',concepts:['flower','nature'],quality_score:.9,commercial_use_allowed:true,license_code:'CC0',license_url:'https://creativecommons.org/publicdomain/zero/1.0/',attribution_required:false};
const provider={name:'kenney',search:async()=>[safe,{...safe,source_asset_id:'unsafe',commercial_use_allowed:false}],acquire:async item=>({...item,storage_path:'creative/flower-1.svg'})};

test('acquires only a safe licensed winner and records provenance',async()=>{const r=await huntAsset({need:'flower',keywords:['nature']},{providers:[provider],externalAcquisitions:0});assert.equal(r.status,'acquired');assert.equal(r.asset.provider,'kenney');assert.equal(r.asset.license_code,'CC0');assert.equal(r.externalAcquisitions,1)});
test('stops after three external acquisitions',async()=>assert.equal((await huntAsset({need:'flower'},{providers:[provider],externalAcquisitions:3})).reason,'external_acquisition_cap'));
test('fails safely when commercial use is not verified',async()=>{const bad={name:'kenney',search:async()=>[{...safe,commercial_use_allowed:false}],acquire:async()=>{throw new Error('must not download')}};assert.equal((await huntAsset({need:'flower'},{providers:[bad]})).status,'missing')});
test('VALIDATE providers require per-item license validation',async()=>{const p={name:'svgrepo',search:async()=>[{...safe,license_validated:false}],acquire:async()=>{throw new Error('must not acquire')}};assert.equal((await huntAsset({need:'flower'},{providers:[p]})).status,'missing')});
