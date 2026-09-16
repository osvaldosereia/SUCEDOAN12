import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFfmpegArgs} from '../render-command.js';

const job={duration_seconds:18,width:1080,height:1920,fps:30,product_snapshot:{name:'Café Extra Forte',price:19.9,offer_price:17.9,is_offer:true},creative_plan:{concept:'Acorda até os objetos',territory:'energy'},timeline:{audio:{voice:false},scenes:[{start:0,end:6,summary:'A embalagem entra devagar'},{start:6,end:12,summary:'Tudo desperta'},{start:12,end:18,summary:'Produto e oferta'}]}};

test('builds vertical h264+aac render arguments',()=>{const args=buildFfmpegArgs(job,{productInput:'/tmp/product.webp',output:'/tmp/out.mp4'});const text=args.join(' ');assert.match(text,/1080x1920/);assert.match(text,/libx264/);assert.match(text,/aac/);assert.match(text,/18/);assert.equal(args.at(-1),'/tmp/out.mp4')});
test('includes real product input when available',()=>{const args=buildFfmpegArgs(job,{productInput:'/tmp/product.webp',output:'/tmp/out.mp4'});assert.ok(args.includes('/tmp/product.webp'));assert.ok(args.join(' ').includes('overlay'))});
test('can render without product image as safe fallback',()=>{const args=buildFfmpegArgs(job,{output:'/tmp/out.mp4'});assert.equal(args.includes('/tmp/product.webp'),false);assert.match(args.join(' '),/drawtext/)});
test('rejects voice audio and invalid duration',()=>{assert.throws(()=>buildFfmpegArgs({...job,timeline:{...job.timeline,audio:{voice:true}}},{output:'/tmp/out.mp4'}),/voice_forbidden/);assert.throws(()=>buildFfmpegArgs({...job,duration_seconds:8},{output:'/tmp/out.mp4'}),/duration_out_of_range/)})
