/* Etiqueta térmica de gôndola 100 × 150 mm, sem criar GTIN comercial. */
(function(){
  'use strict';
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const normalizeUuid=value=>String(value||'').replace(/-/g,'').toLowerCase();
  function productBarcode(product){
    const gtin=String(product?.gtin||'').replace(/\D/g,'');
    if(/^(?:\d{8}|\d{12,14})$/.test(gtin))return {value:gtin,type:'GTIN existente'};
    const uuid=normalizeUuid(product?.id);
    if(!/^[0-9a-f]{32}$/.test(uuid))throw new Error('Produto sem identificador interno válido');
    const compressed=BigInt('0x'+uuid).toString(36).toUpperCase().padStart(25,'0');
    return {value:'DAI'+compressed,type:'Código interno (Code 128)'};
  }
  const quantityCodes=Array.from({length:11},(_,i)=>({value:'DAQ'+String(i).padStart(2,'0'),label:String(i)}));
  function print(product){
    if(!product?.id){alert('Produto não encontrado para impressão.');return}
    let barcode;
    try{barcode=productBarcode(product)}catch(e){alert(e.message);return}
    const popup=window.open('','_blank','width=550,height=800');
    if(!popup){alert('Permita janelas pop-up para imprimir a etiqueta.');return}
    const gondola=Number(product.gondola_number||0);
    const total=Number(product.stock_quantity||0);
    const name=escapeHtml(product.name||'Produto');
    const sku=escapeHtml(product.sku||'—');
    const gtin=escapeHtml(product.gtin||'Não informado');
    const cells=quantityCodes.map(x=>'<div class="qty"><strong>'+x.label+'</strong><svg data-barcode="'+x.value+'" aria-label="Quantidade '+x.label+'"></svg></div>').join('');
    const markup='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiqueta · '+name+'</title>'+
      '<style>'+
      '@page{size:100mm 150mm;margin:0}*{box-sizing:border-box}html,body{padding:0;margin:0;color:#000;background:#fff;font-family:Arial,Helvetica,sans-serif}'+
      '.label{width:100mm;height:150mm;padding:5mm 5.2mm 4mm;overflow:hidden;display:flex;flex-direction:column}'+
      '.brand{font-size:10pt;font-weight:900;letter-spacing:1.1px;border-bottom:2px solid #000;padding-bottom:2mm;display:flex;justify-content:space-between}'+
      '.brand small{font-size:7pt;letter-spacing:0}.gondola{font-size:18pt;font-weight:900;margin-top:3mm}.name{font-size:14pt;font-weight:900;line-height:1.12;margin-top:2mm;height:17mm;overflow:hidden}'+
      '.ref{font-size:8pt;margin:1mm 0 2mm}.identity{border:2px solid #000;border-radius:2mm;padding:2mm;text-align:center;height:27mm;display:flex;flex-direction:column;justify-content:center}'+
      '.identity svg{width:100%;height:14mm}.identity b{font-size:8pt}.identity small{font-size:7pt}'+
      '.heading{font-size:10pt;font-weight:900;margin:3mm 0 2mm;border-bottom:1px solid #000;padding-bottom:1.4mm}'+
      '.quantities{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(6,10mm);gap:1.5mm 2.3mm;flex:1;align-content:start}'+
      '.qty{border:1px solid #000;border-radius:1.3mm;display:grid;grid-template-columns:7mm minmax(0,1fr);align-items:center;padding:1mm;overflow:hidden;gap:1mm;min-width:0}'+
      '.qty strong{font-size:15pt;text-align:center}.qty svg{width:100%;height:7mm}'+
      '.instructions{font-size:7pt;text-align:center;margin-top:auto;padding-top:2mm;border-top:1px solid #555;line-height:1.25}'+
      '.error{font-weight:700;color:#a00}'+
      '@media screen{body{background:#dfe5df;padding:16px}.label{background:white;box-shadow:0 3px 18px #aaa;margin:auto}}'+
      '</style></head><body><main class="label">'+
      '<header class="brand"><span>DONA ANTÔNIA</span><small>CONTROLE DE GÔNDOLA</small></header>'+
      '<div class="gondola">GÔNDOLA '+(gondola||'—')+'</div>'+
      '<div class="name">'+name+'</div>'+
      '<div class="ref">SKU '+sku+' &nbsp;·&nbsp; GTIN '+gtin+'</div>'+
      '<section class="identity"><b>1 · LEIA O PRODUTO</b><svg data-barcode="'+escapeHtml(barcode.value)+'"></svg><small>'+escapeHtml(barcode.type)+'</small></section>'+
      '<div class="heading">2 · LEIA A QUANTIDADE CONTADA</div>'+
      '<section class="quantities">'+cells+'</section>'+
      '<div class="instructions">Abra Estoque › Balanço · Leia o código do produto e depois a quantidade. Confira a gôndola e toque em “Confirmar”.<br>Estoque cadastrado no momento da impressão: '+(Number.isFinite(total)?escapeHtml(total):'—')+' (referência; não altera a contagem).</div>'+
      '</main><script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script></body></html>';
    popup.document.open();popup.document.write(markup);popup.document.close();
    popup.addEventListener('load',()=>{
      if(!popup.JsBarcode){
        const msg=popup.document.createElement('p');
        msg.className='error';msg.textContent='Não foi possível carregar o gerador de códigos. Conecte à internet e tente novamente.';
        popup.document.body.prepend(msg);return;
      }
      try{
        popup.document.querySelectorAll('[data-barcode]').forEach((svg,i)=>{
          popup.JsBarcode(svg,svg.dataset.barcode,{format:'CODE128',width:i===0?1:1.15,height:i===0?50:27,displayValue:false,margin:0});
        });
        setTimeout(()=>{if(!popup.closed)popup.print()},400);
      }catch(e){
        const msg=popup.document.createElement('p');msg.className='error';msg.textContent='Falha ao preparar o código de barras: '+e.message;popup.document.body.prepend(msg);
      }
    },{once:true});
  }
  window.DonaAntoniaShelfLabels={print,productBarcode,quantityCodes};
})();