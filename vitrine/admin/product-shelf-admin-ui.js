/* Produtos > etiquetas térmicas: carregamento sob demanda, sem alterar o fluxo existente. */
(function(){
'use strict';
const bridge=()=>window.DonaAntoniaAdminBridge;
const alertUser=s=>bridge()?.toast?.(s)||alert(s);
const ids=new Set();
let gondolas=[],loading=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
async function api(action,params){return bridge().api(action,params||{})}
function productId(row){return row.getAttribute('data-mobile-product-card')||row.querySelector('[data-edit-product]')?.dataset.editProduct}
async function printSingle(id){
  const btn=document.querySelector('[data-print-shelf="'+CSS.escape(id)+'"]');
  if(btn){btn.disabled=true;btn.textContent='Preparando…'}
  // Abre pop-up na interação do usuário: navegadores podem bloquear se for aberto após await.
  const popup=window.open('','_blank');
  try{
    if(!popup)throw Error('Permita janelas pop-up para imprimir.');
    popup.document.write('<p style="font-family:Arial">Carregando produto…</p>');
    const result=await api('product_detail',{id});
    if(!result.product)throw Error('Produto não encontrado');
    window.DonaAntoniaShelfLabels.printMany([result.product],popup);
  }catch(e){if(popup&&!popup.closed)popup.close();alertUser('Etiqueta: '+e.message)}
  finally{if(btn){btn.disabled=false;btn.textContent='🖨 Etiqueta'}}
}
async function ensureGondolas(){
  if(gondolas.length)return gondolas;
  const res=await api('gondolas');gondolas=res.gondolas||[];return gondolas;
}
function mountedCard(row){
  if(row.dataset.shelfEnhanced)return;
  const id=productId(row);if(!id)return;
  row.dataset.shelfEnhanced='1';
  const actions=row.querySelector('.product-row-actions')||row.querySelector('.mobile-product-card-foot');
  if(actions){
    const print=document.createElement('button');print.type='button';print.className='product-action-btn product-print-label';print.dataset.printShelf=id;print.textContent='🖨 Etiqueta';
    print.title='Imprimir etiqueta térmica vertical 100 × 150 mm';
    print.onclick=()=>printSingle(id);actions.prepend(print);
  }
  const choice=document.createElement('label');choice.className='label-card-select';choice.title='Selecionar produto para impressão de etiquetas';
  choice.innerHTML='<input type="checkbox" '+(ids.has(id)?'checked':'')+'><span>Selecionar</span>';
  const checkbox=choice.querySelector('input');checkbox.onchange=()=>{checkbox.checked?ids.add(id):ids.delete(id);paintSelection()};
  (row.querySelector('.product-main')||row.querySelector('.mobile-product-card-head')||row).append(choice);
  if(row.classList.contains('product-operational-row')){
    const fields=row.querySelector('.product-quick-fields');
    if(fields&&!fields.querySelector('[data-shelf-gondola]')){
      const select=document.createElement('label');select.className='product-inline-field product-gondola-inline';
      select.innerHTML='<span>Gôndola</span><select data-shelf-gondola="'+esc(id)+'" aria-label="Gôndola editável"><option value="">Carregando…</option></select>';
      fields.insertBefore(select,fields.querySelector('[data-mobile-product-status]'));
      ensureGondolas().then(()=>{
        const original=row.querySelector('[data-shelf-gondola]');if(!original?.isConnected)return;
        const opts=gondolas.filter(x=>x.active!==false).map(x=>Number(x.number)).filter(n=>n>0&&n<=30);
        for(let n=1;n<=30;n++)if(!opts.includes(n))opts.push(n);
        opts.sort((a,b)=>a-b);
        original.innerHTML='<option value="">Sem gôndola</option>'+opts.map(n=>'<option value="'+n+'">Gôndola '+n+'</option>').join('');
        api('product_detail',{id}).then(detail=>{
          const val=String(detail.product?.gondola_number||'');
          if(val&&!opts.includes(Number(val))){original.add(new Option('Gôndola '+val+' (edição na aba Gôndolas)',val));}
          original.value=val;
        }).catch(()=>{});
        original.onchange=async()=>{
          const previous=original.dataset.savedValue||original.value;
          original.disabled=true;
          try{
            const value=original.value;
            const result=await bridge().api('product_quick_save',{},{
              method:'POST',headers:{'Content-Type':'application/json'},
              body:JSON.stringify({product_id:id,gondola_number:value?Number(value):null,operator:bridge().operator()})
            });
            original.dataset.savedValue=String(result.product?.gondola_number||'');alertUser('Gôndola salva');
          }catch(e){original.value=previous;alertUser('Gôndola: '+e.message)}
          finally{original.disabled=false}
        };
      }).catch(()=>{select.querySelector('span').textContent='Gôndola (indisponível)'});
    }
  }
}
function paintSelection(){
  const counter=document.getElementById('shelfSelectedCount');if(counter)counter.textContent=ids.size+' selecionados';
}
async function listProducts(filters){
  let offset=0,products=[];
  for(let pages=0;pages<100;pages++){
    const res=await api('products',{...filters,offset,limit:100});
    products.push(...res.products||[]);
    if(products.length>300)throw Error('Há mais de 300 produtos. Refine a busca ou escolha uma gôndola.');
    if(res.next_offset==null)break;
    offset=res.next_offset;
  }
  return products;
}
async function printAction(){
  const panel=document.getElementById('shelfPrintPanel'),mode=panel?.querySelector('[data-shelf-mode]')?.value;
  const trigger=panel?.querySelector('[data-shelf-run]');
  if(!trigger)return;
  // Impressão deve iniciar diretamente da ação do usuário para funcionar em browsers com bloqueador.
  const popup=window.open('','_blank');
  if(!popup){alertUser('Permita pop-ups para imprimir.');return}
  popup.document.write('<p style="font-family:Arial">Preparando etiquetas…</p>');
  trigger.disabled=true;trigger.textContent='Consultando…';
  try{
    let products=[];
    if(mode==='selected'){
      if(!ids.size)throw Error('Marque produtos na lista para imprimir.');
      const all=[...ids];
      for(const id of all){const r=await api('product_detail',{id});if(r.product)products.push(r.product)}
    }else if(mode==='gondola'){
      const number=Number(panel.querySelector('[data-shelf-location]').value);
      if(!number)throw Error('Selecione a gôndola.');
      const available=await ensureGondolas(),g=available.find(x=>Number(x.number)===number);
      if(!g)throw Error('Gôndola não cadastrada');
      const r=await api('gondola',{id:g.id});products=r.products||[];
    }else{
      const q=document.getElementById('productSearch')?.value.trim()||'';
      const category=document.getElementById('productCategory')?.value||'';
      const subcategory=document.getElementById('productSubcategory')?.value||'';
      const active=mode==='all'?'true':document.getElementById('productActive')?.value||'';
      products=await listProducts({q,category,subcategory,active,sort:'name_asc'});
    }
    if(!products.length)throw Error('Nenhum produto encontrado.');
    if(products.length>300)throw Error('Mais de 300 etiquetas. Imprima por gôndola ou filtre os produtos.');
    window.DonaAntoniaShelfLabels.printMany(products,popup);
    alertUser('Preparadas '+products.length+' etiquetas 10×15 cm');
  }catch(e){popup.close();alertUser('Impressão: '+e.message)}
  finally{trigger.disabled=false;trigger.textContent='🖨 Imprimir etiquetas'}
}
function mountToolbar(){
  const root=document.getElementById('productsPanel');
  if(!root||document.getElementById('shelfPrintPanel'))return;
  const tools=document.createElement('div');tools.id='shelfPrintPanel';tools.className='shelf-print-toolbar';
  tools.innerHTML='<b>Etiquetas térmicas 10 × 15</b><select data-shelf-mode aria-label="Modo de impressão"><option value="selected">Produtos selecionados</option><option value="filtered">Produtos filtrados</option><option value="gondola">Por gôndola</option><option value="all">Todos ativos (até 300)</option></select>'+
    '<select data-shelf-location aria-label="Gôndola" hidden><option value="">Selecione a gôndola</option></select>'+
    '<small id="shelfSelectedCount">0 selecionados</small><button type="button" class="secondary" data-shelf-run>🖨 Imprimir etiquetas</button>';
  root.before(tools);
  const mode=tools.querySelector('[data-shelf-mode]'),location=tools.querySelector('[data-shelf-location]');
  mode.onchange=()=>{location.hidden=mode.value!=='gondola';if(mode.value==='gondola')ensureGondolas().then(g=>location.innerHTML='<option value="">Selecione a gôndola</option>'+g.map(x=>'<option value="'+esc(x.number)+'">Gôndola '+esc(x.number)+' ('+esc(x.product_count||0)+')</option>').join(''))};
  tools.querySelector('[data-shelf-run]').onclick=printAction;paintSelection();
}
function refresh(){
  if(!document.getElementById('productsPanel'))return;
  mountToolbar();document.querySelectorAll('#productRows .product-operational-row,#productRows .mobile-product-card').forEach(mountedCard);
}
let pending=false;new MutationObserver(()=>{
  if(pending)return;pending=true;
  requestAnimationFrame(()=>{pending=false;refresh()});
}).observe(document.body,{childList:true,subtree:true});
refresh();
})();