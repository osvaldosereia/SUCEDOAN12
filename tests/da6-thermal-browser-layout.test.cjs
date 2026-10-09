/* DA6 — browser-level thermal geometry and real Code128/QR print regression. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {PNG}=require('pngjs');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'vitrine/admin/product-shelf-labels.js'),'utf8');
const css=fs.readFileSync(path.join(root,'vitrine/admin/product-label-print.css'),'utf8');
const uuid='9a7b3c2d-3333-4444-8888-0123456789ab';
function makeLabel(product){
 let html='';
 const fakeWin={
  closed:false,
  document:{open(){},write(s){html+=s},close(){},readyState:'loading'},
  addEventListener(){},print(){}
 };
 const window={};
 const crypto={getRandomValues(buf){buf.fill(0x5a);return buf}};
 const api=new Function('window','crypto','alert',source+';return window.DonaAntoniaShelfLabels')(window,crypto,()=>{});
 api.printMany([product],fakeWin);
 return html
   .replace(/<link rel="stylesheet"[^>]*>/,'<style>'+css+'</style>')
   .replace(/<script[^>]*><\/script>/g,'');
}
const chrome=process.env.CHROME_BIN||'/usr/bin/google-chrome';
async function withPage(fn){
 const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage();
  await page.setViewport({width:880,height:1100});
  await page.setContent(makeLabel({id:uuid,name:'Arroz integral premium 5 kg para cesta de alimentos',sku:'TEST-123',
    gtin:'7894900011517',gondola_number:123}),{waitUntil:'domcontentloaded'});
  await page.addScriptTag({path:require.resolve('jsbarcode/dist/JsBarcode.all.min.js')});
  await page.addScriptTag({path:require.resolve('qrcode-generator/qrcode.js')});
  await page.evaluate(async()=>{
   document.querySelectorAll('[data-barcode]').forEach(svg=>JsBarcode(svg,svg.dataset.barcode,{
    format:'CODE128',height:38,width:1.5,displayValue:false,margin:0
   }));
   document.querySelectorAll('[data-qr]').forEach(el=>{
    const qr=qrcode(0,'M');qr.addData(el.dataset.qr);qr.make();
    el.innerHTML='<img src="'+qr.createDataURL(4,1)+'" alt="QR da etiqueta">';
   });
   await Promise.all([...document.querySelectorAll('.qrcode img')].map(img=>img.decode()));
  });
  await fn(page);
 }finally{await browser.close()}
}
test('etiqueta térmica: quatro cantos, QR real, Code128 e 6 campos',async()=>{
 await withPage(async page=>{
  const d=await page.evaluate(()=>{
   const label=document.querySelector('.label'),b=label.getBoundingClientRect();
   const pt=el=>{const r=el.getBoundingClientRect();return {
     x:((r.left+r.width/2)-b.left)/b.width*100,
     y:((r.top+r.height/2)-b.top)/b.height*150,width:r.width/b.width*100,height:r.height/b.height*150
   }};
   return {pageWidth:pt(label).width,pageHeight:pt(label).height,
    fid:[...document.querySelectorAll('.fid')].map(pt),
    activated:[...document.querySelectorAll('.activated i')].map(pt),
    tens:[...document.querySelectorAll('.count-row .group:first-of-type .digit:first-child i')].map(pt),
    groups:[...document.querySelectorAll('.count-row')].map(row=>{
     const x=row.querySelectorAll('.group');
     return {tens:pt(x[0].querySelector('.digit:first-child i')),units:pt(x[1].querySelector('.digit:first-child i'))};
    }),
    qrWidth:document.querySelector('.qrcode img').naturalWidth,
    code128:document.querySelector('[data-barcode]').children.length,
    cards:document.querySelectorAll('.count-row').length,
    paper:{width:b.width,height:b.height}
   };
  });
  assert.equal(d.cards,6);assert.ok(d.qrWidth>0);assert.ok(d.code128>0);
  assert.equal(d.fid.length,4);
  const targetFid=[[3.1,3.1],[96.9,3.1],[3.1,146.9],[96.9,146.9]];
  for(let i=0;i<4;i++){
   assert.ok(Math.abs(d.fid[i].x-targetFid[i][0])<.5,'fid X '+i+': '+d.fid[i].x);
   assert.ok(Math.abs(d.fid[i].y-targetFid[i][1])<.5,'fid Y '+i+': '+d.fid[i].y);
  }
  for(let i=0;i<6;i++){
   const top=61+i*((76-5)/6+1);
   for(const [name,x,y] of [['ativar',d.activated[i].x,d.activated[i].y],
      ['dezena',d.groups[i].tens.x,d.groups[i].tens.y],
      ['unidade',d.groups[i].units.x,d.groups[i].units.y]]){
    const expectedX=name==='ativar'?18.5:name==='dezena'?25.09:61.09;
    const expectedY=name==='ativar'?top+7.3:top+8.7;
    assert.ok(Math.abs(x-expectedX)<.6,'B'+(i+1)+' '+name+' x='+x+' expected='+expectedX);
    assert.ok(Math.abs(y-expectedY)<.6,'B'+(i+1)+' '+name+' y='+y+' expected='+expectedY);
   }
  }
  const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true});
  assert.equal(Buffer.from(pdf).subarray(0,4).toString(),'%PDF');
 });
});
test('etiquetas carregam exatamente 6 campos por produto, sem data pré-marcada',()=>{
 const html=makeLabel({id:uuid,name:'Cesta mini',gondola_number:1});
 assert.equal((html.match(/class="count-row"/g)||[]).length,6);
 assert.equal((html.match(/data-qr=/g)||[]).length,1);
 assert.doesNotMatch(html,/20[2-9][0-9]-[01][0-9]-[0-3][0-9]/);
});


test('leitura OMR de seis balanços marcados na etiqueta realmente renderizada',async()=>{
 await withPage(async page=>{
  await page.setViewport({width:880,height:1100,deviceScaleFactor:3});
  const module={Uint8Array,Uint8ClampedArray,Int32Array,Math,BigInt};
  vm.runInNewContext(fs.readFileSync(
    path.join(root,'vitrine/admin/inventory-label-omr-geometry.js'),'utf8'),module);
  const omr=module.DonaAntoniaOMRGeometry;
  const getImage=async()=>{
   const clip=await page.$eval('.label',el=>{
    const r=el.getBoundingClientRect();
    return {x:r.x,y:r.y,width:r.width,height:r.height};
   });
   const shot=await page.screenshot({type:'png',clip});
   const parsed=PNG.sync.read(shot);
   return {data:parsed.data,width:parsed.width,height:parsed.height};
  };
  const blank=omr.read(await getImage());
  assert.equal(blank.readings.length,0,'etiqueta não preenchida não pode gerar estoque');
  assert.equal(blank.errors.length,0);
  const counts=[0,1,7,10,23,99];
  await page.evaluate(counts=>{
   const rows=[...document.querySelectorAll('.count-row')];
   for(let slot=0;slot<6;slot++){
    const row=rows[slot],n=counts[slot],groups=row.querySelectorAll('.group');
    row.querySelector('.activated i').style.backgroundColor='#000';
    groups[0].querySelectorAll('.digit i')[Math.floor(n/10)].style.backgroundColor='#000';
    groups[1].querySelectorAll('.digit i')[n%10].style.backgroundColor='#000';
   }
  },counts);
  const marked=omr.read(await getImage());
  assert.deepEqual(Array.from(marked.readings,x=>x.quantity),counts);
  assert.equal(marked.errors.length,0);
 });
});
