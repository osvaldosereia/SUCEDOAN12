import {api} from './api.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const checked=v=>v?'checked':'';
const dialog=document.getElementById('editorDialog');
const body=document.getElementById('editorBody');
let currentId='';

function toast(message,kind=''){const host=document.getElementById('toastRegion');const node=document.createElement('div');node.className=`toast ${kind}`.trim();node.textContent=message;host.appendChild(node);setTimeout(()=>node.remove(),kind==='error'?5000:2600)}
function close(){dialog.close();body.innerHTML='';currentId=''}
function refreshBaskets(){document.querySelector('[data-route="baskets"]')?.click()}

function markup(basket={},items=[]){
  return `<form id="basketEditorV3Form" class="editor-shell" data-id="${esc(basket.id||'')}"><div class="editor-head"><h2>${basket.id?'Editar cesta':'Nova cesta'}</h2><button class="close-dialog" type="button" data-v3-close-basket>×</button></div><div class="form-grid"><label class="field wide"><span>Nome</span><input name="name" value="${esc(basket.name||'')}" required></label><label class="field"><span>SKU</span><input name="sku" value="${esc(basket.sku||'')}"></label><label class="field"><span>Preço</span><input name="base_price" type="number" step="0.01" min="0" value="${esc(basket.base_price??'')}" required></label><label class="field"><span>Ordem</span><input name="sort_order" type="number" value="${esc(basket.sort_order||0)}"></label><label class="field wide"><span>URL da foto</span><input name="image_url" value="${esc(basket.image_url||'')}"></label><label class="field wide"><span>Descrição</span><textarea name="description">${esc(basket.description||'')}</textarea></label><div class="wide check-row"><label class="check"><input name="is_active" type="checkbox" ${checked(basket.is_active!==false)}> Ativa</label><label class="check"><input name="is_featured" type="checkbox" ${checked(basket.is_featured)}> Destaque</label></div></div>${basket.id?`<section class="panel"><h3>Produtos da cesta</h3><div class="basket-composition">${items.map(i=>`<div class="basket-line" data-v3-basket-item="${esc(i.id)}"><div><strong>${esc(i.product?.name||'Produto')}</strong><div class="muted">${esc(i.product?.packaging||'')}</div></div><input data-v3-item-qty type="number" min="1" step="1" value="${esc(i.quantity)}" aria-label="Quantidade"><button class="secondary" type="button" data-v3-update-item="${esc(i.id)}">Atualizar</button><button type="button" data-v3-remove-item="${esc(i.id)}">Remover</button></div>`).join('')||'<div class="empty">Nenhum produto nesta cesta.</div>'}</div><div class="inline-form"><input id="v3BasketProductSearch" type="search" placeholder="Buscar produto para adicionar"><button id="v3BasketSearchButton" class="secondary" type="button">Buscar</button></div><div id="v3BasketProductSearchResults" class="search-results"></div></section>`:''}<div class="form-actions"><button class="secondary" type="button" data-v3-close-basket>Cancelar</button><button class="primary" type="submit">Salvar cesta</button></div></form>`;
}

async function open(id=''){
  try{
    currentId=id;
    if(!id){body.innerHTML=markup({is_active:true,sort_order:0},[]);if(!dialog.open)dialog.showModal();return}
    body.innerHTML='<div class="loading"><span class="spinner"></span><p>Carregando cesta…</p></div>';if(!dialog.open)dialog.showModal();
    const data=await api('basket',{id});body.innerHTML=markup(data.basket,data.items||[]);
  }catch(e){toast(e.message,'error');close()}
}

async function searchProducts(){
  const input=document.getElementById('v3BasketProductSearch'),host=document.getElementById('v3BasketProductSearchResults');const q=input?.value.trim();if(!host||!q||q.length<2)return;
  host.innerHTML='<div class="muted">Buscando…</div>';
  try{const data=await api('search_products',{q});host.innerHTML=(data.products||[]).map(p=>`<div class="search-result"><div><strong>${esc(p.name)}</strong><div class="muted">${esc(p.gtin||'')} · estoque ${esc(p.stock||0)}</div></div><button type="button" data-v3-add-product="${esc(p.id)}">Adicionar</button></div>`).join('')||'<div class="empty">Nenhum produto encontrado.</div>'}catch(e){host.innerHTML=`<div class="empty">${esc(e.message)}</div>`}
}

document.addEventListener('click',async e=>{
  const t=e.target.closest('button');if(!t)return;
  if(t.matches('[data-new-basket]')||t.matches('[data-edit-basket]')){e.preventDefault();e.stopImmediatePropagation();await open(t.dataset.editBasket||'');return}
},true);

body.addEventListener('click',async e=>{
  const t=e.target.closest('button');if(!t)return;
  if(t.matches('[data-v3-close-basket]')){close();return}
  if(t.id==='v3BasketSearchButton'){await searchProducts();return}
  if(t.matches('[data-v3-add-product]')){try{await api('add_basket_item',{basket_id:currentId,product_id:t.dataset.v3AddProduct,quantity:1});toast('Produto adicionado.','success');await open(currentId)}catch(err){toast(err.message,'error')}return}
  if(t.matches('[data-v3-update-item]')){const row=t.closest('[data-v3-basket-item]');try{await api('update_basket_item',{id:t.dataset.v3UpdateItem,quantity:row.querySelector('[data-v3-item-qty]').value});toast('Quantidade atualizada.','success')}catch(err){toast(err.message,'error')}return}
  if(t.matches('[data-v3-remove-item]')){if(!confirm('Remover este produto da cesta?'))return;try{await api('remove_basket_item',{id:t.dataset.v3RemoveItem});toast('Produto removido.','success');await open(currentId)}catch(err){toast(err.message,'error')}return}
});

body.addEventListener('submit',async e=>{
  if(e.target.id!=='basketEditorV3Form')return;e.preventDefault();e.stopImmediatePropagation();
  const form=e.target,d=Object.fromEntries(new FormData(form).entries());
  try{const saved=await api('save_basket',{id:form.dataset.id||undefined,name:d.name,sku:d.sku,base_price:d.base_price,sort_order:d.sort_order,image_url:d.image_url,description:d.description,is_active:form.elements.is_active.checked,is_featured:form.elements.is_featured.checked});toast('Cesta salva.','success');if(!form.dataset.id){await open(saved.basket.id)}else{close();refreshBaskets()}}catch(err){toast(err.message,'error')}
},true);
