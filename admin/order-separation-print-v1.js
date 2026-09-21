const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const text=value=>String(value??'').trim();
const quantity=value=>Number(value||0).toLocaleString('pt-BR',{maximumFractionDigits:3});
const date=value=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR')};

function naturalParts(value=''){
  return text(value).toLocaleLowerCase('pt-BR').split(/(\d+)/).filter(Boolean).map(part=>/^\d+$/.test(part)?Number(part):part);
}
function naturalCompare(a,b){
  const aa=naturalParts(a),bb=naturalParts(b),length=Math.max(aa.length,bb.length);
  for(let i=0;i<length;i++){
    if(aa[i]===undefined)return -1;
    if(bb[i]===undefined)return 1;
    if(aa[i]===bb[i])continue;
    if(typeof aa[i]==='number'&&typeof bb[i]==='number')return aa[i]-bb[i];
    return String(aa[i]).localeCompare(String(bb[i]),'pt-BR',{sensitivity:'base'});
  }
  return 0;
}
function itemSnapshot(item={}){
  const product=item.product_snapshot&&typeof item.product_snapshot==='object'?item.product_snapshot:{};
  return {
    gtin:text(product.gtin),
    image:text(product.image_url),
    gondola:text(product.gondola),
    shelf:text(product.shelf),
    qty:Math.max(0,Number(item.quantity||0))
  };
}
function groupForSeparation(items=[]){
  const groups=new Map();
  for(const item of items){
    const snapshot=itemSnapshot(item);
    const key=snapshot.gondola||'';
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({...snapshot,itemId:text(item.id)});
  }
  return [...groups.entries()]
    .sort(([a],[b])=>{
      if(!a&&b)return 1;
      if(a&&!b)return -1;
      return naturalCompare(a,b);
    })
    .map(([gondola,entries])=>({
      gondola,
      label:gondola?'Gôndola '+gondola:'Sem localização',
      entries:entries.sort((a,b)=>naturalCompare(a.shelf,b.shelf)||naturalCompare(a.gtin,b.gtin))
    }));
}
function separationDocument(order={},items=[]){
  const orderNumber=esc(order.order_number||order.id||'Pedido');
  const groups=groupForSeparation(items);
  const totalUnits=items.reduce((sum,item)=>sum+Math.max(0,Number(item.quantity||0)),0);
  const locatedGroups=groups.filter(group=>group.gondola).length;
  const groupHtml=groups.length?groups.map(group=>{
    const cards=group.entries.map(item=>{
      const photo=item.image?'<img src="'+esc(item.image)+'" alt="">':'<span>SEM FOTO</span>';
      const shelf=item.shelf?'<div class="shelf">PRAT. '+esc(item.shelf)+'</div>':'';
      return '<article class="item"><div class="photo">'+photo+'</div><div class="item-data"><div class="qty"><span>QTD</span><strong>'+esc(quantity(item.qty))+'</strong></div><div class="ean"><span>EAN</span><strong>'+esc(item.gtin||'—')+'</strong></div>'+shelf+'</div></article>';
    }).join('');
    return '<section class="gondola"><header class="gondola-head"><strong>'+esc(group.label)+'</strong><span>'+group.entries.length+' item'+(group.entries.length===1?'':'s')+'</span></header><div class="items">'+cards+'</div></section>';
  }).join(''):'<div class="empty">Nenhum item informado.</div>';

  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Separação '+orderNumber+' · Dona Antônia</title><style>'+
  '@page{margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif}body{width:85mm;margin:0 auto}'+
  '.screen-actions{position:sticky;top:0;z-index:10;display:flex;gap:6px;justify-content:flex-end;padding:7px;background:#f3f5f3;border-bottom:1px solid #ccd4ce}.screen-actions button{min-height:36px;padding:6px 10px;border:1px solid #b9c4bc;border-radius:6px;background:#fff;font-weight:700}.screen-actions .primary{background:#173f2a;color:#fff;border-color:#173f2a}'+
  '.sheet{width:85mm;padding:2mm}.head{display:flex;justify-content:space-between;gap:3mm;align-items:flex-start;padding:0 0 2mm;border-bottom:.6mm solid #111}.head h1{margin:0;font-size:14pt;line-height:1}.head p{margin:1mm 0 0;font-size:7.5pt}.head-meta{text-align:right;font-size:7.5pt;line-height:1.3}.head-meta strong{display:block;font-size:9pt}.summary{display:flex;justify-content:space-between;gap:2mm;padding:1.5mm 0;font-size:7pt;font-weight:700;border-bottom:.25mm solid #bbb}'+
  '.gondola{break-inside:avoid;margin-top:2mm}.gondola-head{display:flex;align-items:center;justify-content:space-between;gap:2mm;padding:1.2mm 1.5mm;background:#111;color:#fff;font-size:8.5pt}.gondola-head span{font-size:6.5pt;font-weight:400}.items{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.4mm;margin-top:1.4mm}.item{min-width:0;display:grid;grid-template-columns:17mm minmax(0,1fr);gap:1.4mm;align-items:center;min-height:24mm;padding:1.2mm;border:.25mm solid #aeb7b0;border-radius:1.5mm;break-inside:avoid;background:#fff}'+
  '.photo{width:17mm;height:21mm;display:grid;place-items:center;overflow:hidden;background:#fff}.photo img{display:block;max-width:100%;max-height:100%;object-fit:contain}.photo span{font-size:5.5pt;font-weight:700;color:#777;text-align:center}.item-data{min-width:0;display:grid;align-content:center;gap:1mm}.qty span,.ean span{display:block;font-size:5.5pt;font-weight:700;color:#555}.qty strong{display:block;font-size:17pt;line-height:1}.ean strong{display:block;font-size:7pt;line-height:1.15;overflow-wrap:anywhere}.shelf{display:inline-block;width:max-content;max-width:100%;padding:.7mm 1mm;background:#eee;border-radius:1mm;font-size:6pt;font-weight:700}.empty{padding:8mm 2mm;text-align:center;font-size:8pt;color:#666}.footer{margin-top:2mm;padding-top:1.5mm;border-top:.25mm solid #bbb;font-size:5.5pt;text-align:center;color:#555}'+
  '@media print{html,body{width:85mm!important;min-width:85mm!important;max-width:85mm!important}.screen-actions{display:none!important}.sheet{width:85mm!important;padding:2mm!important}.gondola{break-inside:auto}.gondola-head{break-after:avoid}.item{break-inside:avoid}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'+
  '</style></head><body><div class="screen-actions"><button onclick="window.close()">Fechar</button><button class="primary" onclick="window.print()">Imprimir</button></div>'+
  '<main class="sheet"><header class="head"><div><h1>SEPARAÇÃO</h1><p>Dona Antônia · bobina 85 mm · 2 colunas</p></div><div class="head-meta"><strong>'+orderNumber+'</strong>'+esc(date(order.created_at))+'</div></header>'+
  '<div class="summary"><span>'+items.length+' item'+(items.length===1?'':'s')+'</span><span>'+esc(quantity(totalUnits))+' unidade'+(totalUnits===1?'':'s')+'</span><span>'+locatedGroups+' gôndola'+(locatedGroups===1?'':'s')+'</span></div>'+
  groupHtml+'<footer class="footer">Ordem de separação: gôndola crescente → prateleira → EAN.</footer></main>'+
  '<script>const images=[...document.images];Promise.all(images.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener("load",resolve,{once:true});img.addEventListener("error",resolve,{once:true})}))).then(()=>setTimeout(()=>window.print(),120));<\/script>'+
  '</body></html>';
}
function requestOrderSeparationPrint(order={},items=[]){
  const win=window.open('','_blank','noopener,noreferrer');
  if(!win)throw new Error('O navegador bloqueou a impressão de separação. Libere pop-ups para o Admin.');
  win.document.open();
  win.document.write(separationDocument(order,items));
  win.document.close();
}
export {groupForSeparation,separationDocument,requestOrderSeparationPrint};
