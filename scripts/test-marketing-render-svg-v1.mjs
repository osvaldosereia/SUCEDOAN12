import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { renderMarketingSvg, validateMarketingSvgSpec } from './marketing-render-svg-v1.mjs';

const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'da-marketing-svg-test-'));
try{
  const assetDir=path.join(tmp,'assets');
  await fs.mkdir(assetDir,{recursive:true});
  const tinyPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nxoAAAAASUVORK5CYII=','base64');
  await fs.writeFile(path.join(assetDir,'produto.png'),tinyPng);

  const spec={
    width:1080,height:1080,background:'#f2f2f2',
    layers:[
      {type:'rect',x:40,y:40,width:1000,height:1000,fill:'#ffffff',radius:32},
      {type:'image',src:'assets/produto.png',x:110,y:120,width:420,height:420,fit:'contain',alt:'Produto'},
      {type:'text',text:'Cesta Dona Antônia',x:110,y:610,width:860,fontSize:72,fontWeight:700,color:'#111827',align:'left'},
      {type:'text',text:'R$ 199,90',x:110,y:730,width:860,fontSize:88,fontWeight:800,color:'#111827',align:'left'}
    ]
  };

  const normalized=validateMarketingSvgSpec(spec);
  assert.equal(normalized.width,1080);
  assert.equal(normalized.height,1080);
  assert.equal(normalized.layers.length,4);

  const out=path.join(tmp,'out','creative.svg');
  const result=await renderMarketingSvg(spec,{baseDir:tmp,outputPath:out});
  assert.equal(result.ok,true);
  assert.equal(result.format,'svg');
  assert.equal(result.ai_used,false);
  assert.equal(result.external_side_effect,false);
  assert.equal(result.network_allowed,false);
  assert.equal(result.width,1080);
  assert.equal(result.height,1080);
  assert.ok(result.size>100);

  const svg=await fs.readFile(out,'utf8');
  assert.match(svg,/^<svg/);
  assert.ok(svg.includes('data:image/png;base64,'));
  assert.ok(svg.includes('Cesta Dona Antônia'));
  assert.ok(!svg.includes('assets/produto.png'));
  assert.ok(!/https?:\/\//i.test(svg));

  await assert.rejects(()=>renderMarketingSvg({...spec,layers:[{type:'image',src:'https://example.test/a.png'}]},{baseDir:tmp,outputPath:path.join(tmp,'bad.svg')}),/remote_source_forbidden/);
  await assert.rejects(()=>renderMarketingSvg({...spec,layers:[{type:'image',src:'..\/outside.png'}]},{baseDir:tmp,outputPath:path.join(tmp,'escape.svg')}),/source_path_escape/);
  assert.throws(()=>validateMarketingSvgSpec({...spec,width:9999}),/canvas_out_of_bounds/);
  assert.throws(()=>validateMarketingSvgSpec({...spec,layers:Array.from({length:25},()=>({type:'rect'}))}),/too_many_layers/);

  const source=await fs.readFile('scripts/marketing-render-svg-v1.mjs','utf8');
  for(const forbidden of ['fetch(', 'XMLHttpRequest', 'axios', 'https.request', 'http.request', 'api.openai.com', 'generativelanguage.googleapis.com']){
    assert.ok(!source.includes(forbidden),`offline renderer must not use network/provider: ${forbidden}`);
  }
}finally{
  await fs.rm(tmp,{recursive:true,force:true});
}

console.log('PASS: Marketing SVG renderer creates deterministic local-only no-AI image output.');