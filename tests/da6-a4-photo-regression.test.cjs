/* DA6 R7: regressão do balanço A4 e seleção concorrente de lotes (Chrome real).
 * Não acessa rede, estoque, banco ou navegador de cliente.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const puppeteer=require('puppeteer-core');
const source=fs.readFileSync(path.join(__dirname,'../vitrine/admin/inventory-label-photo-tab.js'),'utf8');
const executablePath=process.env.CHROME_BIN||'/usr/bin/google-chrome';
async function withPage(fn){
 const chrome=await puppeteer.launch({executablePath,headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await chrome.newPage();
  await page.setViewport({width:390,height:800});
  await page.setContent('<div id="content">'+
   '<div class="page-head"><h1>Balanço</h1></div>'+
   '<section id="a4-existing"><button id="a4-action">Imprimir A4</button></section>'+
   '<section id="a4-original-hidden" hidden>Controle oculto do A4</section>'+
   '</div>');
  await page.evaluate(()=>{
   window.__mock={cameraStarted:0,cameraStopped:0,a4Clicks:0,pending:[],calls:[]};
   document.querySelector('#a4-action').onclick=()=>window.__mock.a4Clicks++;
   window.DonaAntoniaAdminBridge={
    toast:x=>window.__mock.calls.push('toast:'+x),
    operator:()=> 'Operador Teste',
    startBalanceCamera:()=>window.__mock.cameraStarted++,
    stopBalanceCamera:()=>window.__mock.cameraStopped++,
    api:async(action,params)=>{
     window.__mock.calls.push(action);
     if(action==='inventory_label_batches')return {batches:[
      {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',created_at:'2026-10-09T12:00:00Z',total_files:1},
      {id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',created_at:'2026-10-09T13:00:00Z',total_files:1}
     ]};
     if(action==='inventory_label_batch_status'){
      return await new Promise(resolve=>window.__mock.pending.push({batch:params.batch_id,resolve}));
     }
     throw Error('Unexpected API call '+action);
    }
   };
  });
  await page.addScriptTag({content:source});
  await fn(page);
 }finally{await chrome.close()}
}
test('R7 o A4 mantém botões, visibilidade original e câmera ao alternar',async()=>{
 await withPage(async page=>{
  const starting=await page.evaluate(()=>({
   shown:!document.querySelector('#a4-existing').hidden,
   hidden:document.querySelector('#a4-original-hidden').hidden,
   camera:window.__mock.cameraStarted
  }));
  assert.deepEqual(starting,{shown:true,hidden:true,camera:0});
  await page.click('[data-da6-mode="photos"]');
  const photos=await page.evaluate(()=>({
   shown:document.querySelector('#a4-existing').hidden,
   hidden:document.querySelector('#a4-original-hidden').hidden,
   photoVisible:!document.querySelector('#da6-photo-panel').hidden,
   cameraStopped:window.__mock.cameraStopped
  }));
  assert.deepEqual(photos,{shown:true,hidden:true,photoVisible:true,cameraStopped:1});
  await page.click('[data-da6-mode="scanner"]');
  await page.click('#a4-action');
  const after=await page.evaluate(()=>({
   shown:!document.querySelector('#a4-existing').hidden,
   hidden:document.querySelector('#a4-original-hidden').hidden,
   photoHidden:document.querySelector('#da6-photo-panel').hidden,
   a4Clicks:window.__mock.a4Clicks,
   cameraStarted:window.__mock.cameraStarted
  }));
  assert.deepEqual(after,{shown:true,hidden:true,photoHidden:true,a4Clicks:1,cameraStarted:1});
 });
});
test('R7 resposta do lote antigo não substitui lote selecionado mais recente',async()=>{
 await withPage(async page=>{
  await page.click('[data-da6-mode="photos"]');
  await page.waitForFunction(()=>window.__mock.pending.length>=1);
  await page.select('#da6-batch-select','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  await page.waitForFunction(()=>window.__mock.pending.length>=2);
  await page.evaluate(()=>{
   const recent=window.__mock.pending.find(x=>x.batch.startsWith('bbbb'));
   recent.resolve({counts:{queued:1},photos:[{
    id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',file_name:'foto-mais-recente.png',
    status:'queued',attempts:0
   }]});
  });
  await page.waitForFunction(()=>document.querySelector('#da6-batch-details')?.textContent?.includes('foto-mais-recente.png'));
  await page.evaluate(()=>{
   const previous=window.__mock.pending.find(x=>x.batch.startsWith('aaaa'));
   previous.resolve({counts:{queued:1},photos:[{
    id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',file_name:'foto-antiga.png',
    status:'queued',attempts:0
   }]});
  });
  await page.waitForFunction(()=>window.__mock.pending.every(p=>!!p.resolve));
  // Permite a conclusão da microtask de renderização sem depender de timers.
  const state=await page.evaluate(async()=>{
   await new Promise(resolve=>requestAnimationFrame(resolve));
   return {text:document.querySelector('#da6-batch-details').textContent,
    selected:document.querySelector('#da6-batch-select').value};
  });
  assert.match(state.text,/foto-mais-recente.png/);
  assert.doesNotMatch(state.text,/foto-antiga.png/);
  assert.equal(state.selected,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 });
});
test('R7 sair para o balanço A4 invalida resultados de polling ainda pendentes',async()=>{
 await withPage(async page=>{
  await page.click('[data-da6-mode="photos"]');
  await page.waitForFunction(()=>window.__mock.pending.length>=1);
  await page.click('[data-da6-mode="scanner"]');
  await page.evaluate(()=>{
   window.__mock.pending[0].resolve({counts:{failed:1},photos:[
    {id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',file_name:'não-renderizar.png',status:'failed',attempts:3}
   ]});
  });
  const out=await page.evaluate(async()=>{
   await new Promise(resolve=>requestAnimationFrame(resolve));
   return {rendered:document.querySelector('#da6-batch-details').textContent,
    a4:!document.querySelector('#a4-existing').hidden};
  });
  assert.doesNotMatch(out.rendered,/não-renderizar.png/);
  assert.equal(out.a4,true);
 });
});
test('R7 página A4 preserva funções e APIs existentes sem duplicar versão DA6',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../vitrine/admin/index.html'),'utf8');
 assert.match(html,/function renderBalance\s*\(/);
 assert.match(html,/inventory_sheet_create/);
 assert.match(html,/inventory_sheet_analy/);
 assert.match(html,/inventory-label-photo-tab\.js/);
 assert.equal((html.match(/src="\/vitrine\/admin\/inventory-label-photo-tab\.js/g)||[]).length,1);
});
