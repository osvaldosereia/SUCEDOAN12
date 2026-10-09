/* DA6 R5: historiografia auditável e revisão em navegador real, sem rede externa. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const source=fs.readFileSync(path.join(__dirname,'../vitrine/admin/inventory-label-photo-review.js'),'utf8');
const uuid='9a7b3c2d-3333-4444-8888-0123456789ab';
const base={id:uuid,status:'needs_review',
 parsed:{product_id:uuid,label_serial:'ABCDEF1234',errors:[{slot:2,reason:'ambiguous_marks'}],duplicates:0},
 review_counts:[{balance_slot:1,quantity:0,status:'pending_review'}]};
async function browser(run){
 const executablePath=process.env.CHROME_BIN||'/usr/bin/google-chrome';
 const chrome=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await chrome.newPage();await page.setViewport({width:390,height:840});
  await page.setContent('<main id="container"></main>');
  await page.addScriptTag({content:source});
  await page.evaluate(photo=>{
    window.da6Log=[];
    window.__bridge={
      toast:()=>{},
      api:async(action,params,opt)=>{
        window.da6Log.push({action,params,opt});
        if(action==='inventory_label_photo_history')return {events:[
          {decision:'correct',old_quantity:7,new_quantity:0,note:'Verificado <script>alert(1)</script>',
           created_at:'2026-10-09T13:00:00Z'}]};
        return {review:{ok:true}};
      }
    };
    document.getElementById('container').innerHTML=window.DonaAntoniaLabelReview.render(photo);
    window.DonaAntoniaLabelReview.bind(document.getElementById('container'),window.__bridge,
       async()=>{window.__refreshed=(window.__refreshed||0)+1});
    document.querySelector('details.da6-review').open=true;
  },base);
  await run(page);
 }finally{await chrome.close()}
}
test('R5 histórico só consulta API após clique e escapa nota maliciosa',async()=>{
 await browser(async page=>{
  assert.equal(await page.evaluate(()=>window.da6Log.length),0);
  await page.click('[data-da6-history]');
  await page.waitForFunction(()=>document.querySelector('.da6-review-history li'));
  const result=await page.evaluate(()=>({
    actions:window.da6Log.map(x=>x.action),
    text:document.querySelector('.da6-review-history').textContent,
    html:document.querySelector('.da6-review-history').innerHTML,
    mobileWidth:document.querySelector('details.da6-review').getBoundingClientRect().width
  }));
  assert.deepEqual(result.actions,['inventory_label_photo_history']);
  assert.match(result.text,/Verificado <script>alert\(1\)<\/script>/);
  assert.doesNotMatch(result.html,/<script>/);
  assert.ok(result.mobileWidth<=390);
 });
});
test('R5 aprovação zero exige confirmação e só envia quantidade nula',async()=>{
 await browser(async page=>{
  await page.click('[data-da6-decision="approve"][data-da6-slot="1"]');
  await page.waitForFunction(()=>window.da6Log.some(x=>x.action==='inventory_label_photo_review'));
  const entry=await page.evaluate(()=>window.da6Log.find(x=>x.action==='inventory_label_photo_review'));
  const payload=JSON.parse(entry.opt.body);
  assert.equal(payload.decision,'approve');assert.equal(payload.quantity,null);
  assert.equal(payload.slot,1);assert.equal(payload.photo_id,uuid);
  assert.equal(await page.evaluate(()=>window.__refreshed),1);
 });
});
test('R5 foto duplicada exibe aviso mas nunca sugere segunda contagem',async()=>{
 await browser(async page=>{
  const content=await page.evaluate(photo=>{
    photo.parsed.duplicates=1;
    photo.parsed.errors=[];
    photo.review_counts=[];
    return window.DonaAntoniaLabelReview.render(photo);
  },structuredClone(base));
  assert.match(content,/outra fotografia/);
  assert.doesNotMatch(content,/data-da6-decision/);
 });
});
