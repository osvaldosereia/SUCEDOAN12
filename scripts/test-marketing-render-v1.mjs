import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {render,validateSpec} from './marketing-render-deterministic-v1.mjs';

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'da-marketing-render-'));
try{
  const source=path.join(dir,'produto.png');
  await sharp({create:{width:300,height:500,channels:4,background:'#ffffff'}})
    .composite([{input:Buffer.from('<svg width="300" height="500" xmlns="http://www.w3.org/2000/svg"><rect x="70" y="40" width="160" height="420" rx="24" fill="#d9d9d9"/><text x="150" y="270" text-anchor="middle" font-family="Arial" font-size="34" fill="#111">PRODUTO</text></svg>')}])
    .png().toFile(source);
  const spec={width:1080,height:1080,background:'#eeeeee',quality:80,layers:[
    {type:'rect',x:40,y:40,width:1000,height:1000,radius:36,fill:'#ffffff'},
    {type:'image',src:'produto.png',x:120,y:120,width:430,height:760,fit:'contain'},
    {type:'text',text:'OFERTA DO DIA',x:590,y:170,width:380,fontSize:54,fontWeight:800,color:'#173f2a'},
    {type:'text',text:'Arroz 5 kg',x:590,y:350,width:380,fontSize:44,fontWeight:700,color:'#111827'},
    {type:'text',text:'R$ 29,90',x:590,y:500,width:380,fontSize:70,fontWeight:800,color:'#111827'}
  ]};
  const out=path.join(dir,'out.webp');
  const result=await render(spec,{baseDir:dir,outputPath:out});
  assert.equal(result.ok,true); assert.equal(result.ai_used,false); assert.equal(result.external_side_effect,false);
  assert.equal(result.width,1080); assert.equal(result.height,1080); assert.equal(result.format,'webp');
  const meta=await sharp(out).metadata(); assert.equal(meta.width,1080); assert.equal(meta.height,1080); assert.equal(meta.format,'webp');
  assert.ok(result.size>1000); assert.ok(result.size<300000);
  assert.throws(()=>validateSpec({width:5000,height:1080,layers:[]}),/canvas out of bounds/);
  let blocked=false; try{await render({width:1080,height:1080,layers:[{type:'image',src:'https://example.com/a.png'}]},{baseDir:dir,outputPath:path.join(dir,'bad.webp')})}catch(e){blocked=/remote or unsafe/.test(e.message)}
  assert.equal(blocked,true);
  console.log('marketing deterministic renderer: ok');
}finally{await fs.rm(dir,{recursive:true,force:true})}
