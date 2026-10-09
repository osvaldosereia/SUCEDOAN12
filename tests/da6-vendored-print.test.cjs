/* DA6 R8: validar impressão real em Chrome com bundles locais, sem CDN.
 * Testes são offline e não possuem credenciais da Dona Antônia.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const root=path.join(__dirname,'..');
const engine=fs.readFileSync(path.join(root,'vitrine/admin/product-shelf-labels.js'),'utf8');
const jsBarcode=path.join(root,'vitrine/admin/vendor/JsBarcode.all-3.11.6.min.js');
const qrLibrary=path.join(root,'vitrine/admin/vendor/qrcode-generator-2.0.4.js');
const imageDecoder=require.resolve('jsqr/dist/jsQR.js');
function label(){
 const host={},crypto={getRandomValues(bytes){bytes.fill(0x7a);return bytes}};
 const api=new Function('window','crypto','alert',engine+';return window.DonaAntoniaShelfLabels')(host,crypto,()=>{});
 let html='';
 const printed={closed:false,document:{open(){},write(text){html+=text},close(){},readyState:'loading'},
   addEventListener(){},print(){throw Error('print called before QR is ready')}};
 const value=api.printMany([{id:'9a7b3c2d-3333-4444-8888-0123456789ab',
  name:'Arroz branco tipo 1 5 kg',sku:'TEST-QR',gtin:'7894900011517',gondola_number:12}],printed);
 assert.equal(value.count,1);
 return html;
}
test('R8 scripts de QR e Code128 servidos localmente, versões MIT fixadas',()=>{
 const html=label();
 assert.match(html,/\/vitrine\/admin\/vendor\/JsBarcode[.]all-3[.]11[.]6[.]min[.]js/);
 assert.match(html,/\/vitrine\/admin\/vendor\/qrcode-generator-2[.]0[.]4[.]js/);
 assert.doesNotMatch(html,/<script src="https?:\/\//);
 assert.ok(fs.readFileSync(jsBarcode,'utf8').includes('JsBarcode v3.11.6'));
 assert.ok(fs.readFileSync(qrLibrary,'utf8').includes('Copyright (c) 2009 Kazuhiko Arase'));
 for(const file of ['LICENSE-JsBarcode.txt','LICENSE-qrcode-generator.txt']){
  const content=fs.readFileSync(path.join(root,'vitrine/admin/vendor',file),'utf8');
  assert.match(content,/MIT License|MIT-LICENSE|Permission is hereby granted/);
 }
});
test('R8 Chrome gera QR válido e Code128 com bundles locais sem HTTP externo',async()=>{
 const browser=await puppeteer.launch({
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage();
  const external=[];page.on('request',r=>{if(/^https?:/i.test(r.url()))external.push(r.url())});
  const html=label().replace(/<link rel="stylesheet"[^>]*>/g,'')
    .replace(/<script src="[^"]*"><\/script>/g,'');
  await page.setContent(html,{waitUntil:'domcontentloaded'});
  await page.addScriptTag({path:jsBarcode});
  await page.addScriptTag({path:qrLibrary});
  await page.addScriptTag({path:imageDecoder});
  const value=await page.evaluate(async()=>{
   const code=document.querySelector('[data-barcode]');
   const qrEl=document.querySelector('[data-qr]');
   if(typeof JsBarcode!=='function'||typeof qrcode!=='function')throw Error('vendor not exposed');
   JsBarcode(code,code.dataset.barcode,{format:'CODE128',height:38,width:1.5,displayValue:false,margin:0});
   const q=qrcode(0,'M');q.addData(qrEl.dataset.qr);q.make();
   qrEl.innerHTML='<img alt="QR local" src="'+q.createDataURL(4,1)+'">';
   const img=qrEl.querySelector('img');await img.decode();
   const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
   const decoded=jsQR(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
   return {barcodeShapes:code.children.length,barcodeValue:code.dataset.barcode,qrDecoded:decoded?.data,
     qrExpected:qrEl.dataset.qr,labels:document.querySelectorAll('article.label').length,
     rows:document.querySelectorAll('article.label .count-row').length};
  });
  assert.ok(value.barcodeShapes>10,'barcode must have visible bars');
  assert.equal(value.barcodeValue,'7894900011517');
  assert.equal(value.qrDecoded,value.qrExpected,'QR content decoded mismatch');
  assert.match(value.qrDecoded,/^DA6\|[0-9A-Z]{25}\|[0-9A-F]{10}$/);
  assert.equal(value.rows,6);assert.equal(value.labels,1);
  assert.deepEqual(external,[],'bundles must not generate external requests');
 }finally{await browser.close()}
});
