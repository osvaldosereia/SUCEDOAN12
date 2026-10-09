/* Dona Antônia · DA6 · impressão térmica em lote · sem serviços de IA. */
(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const digits=v=>String(v||'').replace(/\D/g,'');
function uuid36(v){
  const u=String(v||'').replace(/-/g,'').toLowerCase();
  if(!/^[0-9a-f]{32}$/.test(u))throw Error('Identificador do produto inválido');
  return BigInt('0x'+u).toString(36).toUpperCase().padStart(25,'0');
}
function validGtin(v){
  const s=String(v??'').trim();
  if(!/^\d+$/.test(s)||![8,12,13,14].includes(s.length))return false;
  let sum=0;for(let i=s.length-2,weight=3;i>=0;i--,weight=weight===3?1:3)sum+=Number(s[i])*weight;
  return (10-sum%10)%10===Number(s[s.length-1]);
}
const productBarcode=p=>validGtin(p.gtin)?String(p.gtin).trim():'DAI'+uuid36(p.id);
function randomSerial(){
  const u=new Uint8Array(5);crypto.getRandomValues(u);
  return Array.from(u,x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
}
function groupHtml(title){
  return '<div class="group"><div class="group-title">'+title+'</div><div class="digits">'+
    Array.from({length:10},(_,n)=>'<div class="digit"><small>'+n+'</small><i></i></div>').join('')+'</div></div>';
}
function labelHtml(p,serial){
  const identity='DA6|'+uuid36(p.id)+'|'+serial;
  const rows=Array.from({length:6},(_,i)=>'<div class="count-row"><div class="count-number"><small>BAL.</small><b>'+(i+1)+'</b></div><div class="activated"><small>ATIVAR</small><i></i></div>'+
    groupHtml('DEZENA')+groupHtml('UNIDADE')+'</div>').join('');
  return '<article class="label"><div class="fid a"></div><div class="fid b"></div><div class="fid c"></div><div class="fid d"></div>'+
    '<header><b>DONA ANTÔNIA</b><span>ETIQUETA DE BALANÇO · DA6</span></header>'+
    '<div class="label-top"><div><div class="loc">GÔNDOLA <strong>'+esc(p.gondola_number||'—')+'</strong></div><div class="pname">'+esc(p.name||'Produto')+'</div>'+
    '<div class="pmeta">SKU '+esc(p.sku||'—')+' · EAN '+esc(p.gtin||'—')+'</div></div><div class="qrcode" data-qr="'+esc(identity)+'"></div></div>'+
    '<div class="prod-bar"><svg data-barcode="'+esc(productBarcode(p))+'"></svg><small>'+esc(productBarcode(p))+'</small></div>'+
    '<div class="instruction">PINTE O QUADRADO, UMA DEZENA E UMA UNIDADE · NÃO ESCREVA</div>'+
    '<section class="counts">'+rows+'</section>'+
    '<footer><span>6 BALANÇOS · SEM DATA FIXA</span><span>ETIQUETA '+esc(serial)+'</span></footer></article>';
}
function printMany(products,existingWindow){
  if(!Array.isArray(products)||!products.length){alert('Selecione produtos para imprimir.');return}
  if(products.length>300){alert('Limite de 300 etiquetas por impressão. Divida em lotes.');return}
  let labels;try{labels=products.map(p=>labelHtml(p,randomSerial()))}catch(e){alert(e.message);return}
  const win=existingWindow||window.open('','_blank');
  if(!win){alert('Permita pop-ups para imprimir.');return}
  const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas Dona Antônia · '+labels.length+'</title>'+
    '<link rel="stylesheet" href="/vitrine/admin/product-label-print.css?v=da6-v1"></head><body>'+
    labels.join('')+
    '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>'+
    '<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"><\/script></body></html>';
  win.document.open();win.document.write(html);win.document.close();
  let started=false;
  async function prepare(){
    if(started||win.closed)return;started=true;
    try{
      if(typeof win.JsBarcode!=='function'||typeof win.qrcode!=='function')
        throw Error('Geradores de QR e código de barras indisponíveis. Verifique a internet.');
      const bars=[...win.document.querySelectorAll('[data-barcode]')];
      const qrs=[...win.document.querySelectorAll('[data-qr]')];
      if(bars.length!==labels.length||qrs.length!==labels.length)
        throw Error('Nem todas as etiquetas foram montadas.');
      for(const svg of bars)
        win.JsBarcode(svg,svg.dataset.barcode,{format:'CODE128',height:38,width:1.5,displayValue:false,margin:0});
      for(const el of qrs){
        const qr=win.qrcode(0,'M');qr.addData(el.dataset.qr);qr.make();
        el.innerHTML='<img alt="QR de identificação" src="'+qr.createDataURL(4,1)+'">';
      }
      const images=[...win.document.querySelectorAll('.qrcode img')];
      await Promise.race([
        Promise.all(images.map(img=>typeof img.decode==='function'?img.decode():Promise.resolve())),
        new Promise((_,reject)=>setTimeout(()=>reject(Error('Tempo esgotado ao preparar QR.')),7000))
      ]);
      if(win.document.fonts?.ready)await win.document.fonts.ready;
      if(win.closed)return;
      await new Promise(resolve=>setTimeout(resolve,200));
      win.print();
    }catch(error){
      const warning=win.document.createElement('p');
      warning.className='print-error';
      warning.textContent='Impressão interrompida: '+(error?.message||error);
      win.document.body.prepend(warning);
    }
  }
  win.addEventListener('load',prepare,{once:true});
  // Cobre o caso de recursos já carregados antes de registrar o listener.
  if(win.document.readyState==='complete')prepare();
  return {count:labels.length};
}
window.DonaAntoniaShelfLabels={print:p=>printMany([p]),printMany,productBarcode,version:'DA6'};
})();