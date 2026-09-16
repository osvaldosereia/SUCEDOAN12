import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRenderJob} from '../job-contract.js';

const product={id:'7d62ff27-6dde-4b61-9072-e6dbb98c2c98',name:'Produto',price:10,image_url:'https://example.com/a.webp'};
const plan={territory:'freshness',concept:'fresh',emotions:['surprise'],hook:'x',payoff:'y',product_role:'hero',duration:18,scenes:[{beat:'hook',summary:'x',sound_intent:'reveal',actors:[{role:'product',motion:'reveal',behavior:'heroic'}]}],asset_requests:[]};
const assets={items:[],externalAcquisitions:0,summary:{total:0,ready:0,missing:0,blocked:0}};
const timeline={duration:18,scenes:[],motionTracks:[],audio:{voice:false,cues:[]}};

test('builds immutable render job snapshot with vertical defaults',()=>{
 const job=buildRenderJob({product,plan,assets,timeline,providerUsage:{input_tokens:10,output_tokens:20}});
 assert.equal(job.product_id,product.id);assert.equal(job.duration_seconds,18);assert.equal(job.width,1080);assert.equal(job.height,1920);assert.equal(job.fps,30);assert.equal(job.render_strategy,'ffmpeg_svg');
});
test('rejects jobs with unresolved assets',()=>assert.throws(()=>buildRenderJob({product,plan,assets:{...assets,summary:{total:1,ready:0,missing:1,blocked:0}},timeline}),/assets_not_ready/));
test('rejects voice audio in a render job',()=>assert.throws(()=>buildRenderJob({product,plan,assets,timeline:{...timeline,audio:{voice:true,cues:[]}}}),/voice_forbidden/));
