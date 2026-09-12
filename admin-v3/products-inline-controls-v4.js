import {CONFIG} from './config.js';

const app=document.getElementById('app');
const dialog=document.getElementById('editorDialog');
const editorBody=document.getElementById('editorBody');
const toastRegion=document.getElementById('toastRegion');
const state={page:1,total:0,q:'',status:'',loading:false,token:0};

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money=value=>(value===null||value===undefined||value==='')?'—':Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const checked=value=>value?'checked':'';
const productRoute=()=>location.hash.replace(/^#/,'').trim()==='products';

function toast(message,kind=''){
  if(!toastRegion)return;
  const node=document.createElement('div');
  node.className=`toast ${kind}`.trim();
  node.textContent=message;
  toastRegion.appendChild(node);
  setTimeout(()=>node.remove(),kind==='error'?6000:2800);
}

function labelError(code,fallback='Erro ao concluir'){
  const labels={
    invalid_stock:'Estoque inválido.',
    invalid_offer_price:'Informe um preço de oferta válido.',
    invalid_gtin:'EAN/GTIN inválido.',
    invalid_ncm:'NCM precisa ter 8 dígitos.',
    product_not_found:'Produto não encontrado.',
    product_in_use:'Este produto possui histórico ou vínculos e não pode ser apagado.'
  };
  return labels[code]||fallback||code||'Erro ao concluir';
}

async function productApi(action,payload={}){
  const response=await fetch(`${CONFIG.supabaseUrl}/functions/v1/admin-simple-v2`,{
    method:'POST',
    headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},
    body:JSON.stringify({action,...payload}),
    cache:'no-store',
    credentials:'omit'
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok===false){
    const error=new Error(labelError(data.error,data.detail||`Erro ${response.status}`));
    error.code=data.error||'';
    error.detail=data.detail||'';
    throw error;
  }
  return data;
}

function productRow(p){
  const meta=[p.sku?`SKU ${p.sku}`:'',p.brand,p.packaging,p.category].filter(Boolean).join(' · ');
  return `<tr data-inline-product-row="${esc(p.id)}" data-product-name="${esc(p.name||'Produto')}">
    <td><div class="name-cell inline-product-name">${p.image_url?`<img class="thumb" src="${esc(p.image_url)}" alt="" loading="lazy" decoding="async">`:'<div class="thumb"></div>'}<div><strong>${esc(p.name||'Produto')}</strong><span>${esc(meta||p.sku||'')}</span></div></div></td>
    <td><input data-product-inline data-inline-stock class="inline-product-input inline-stock" type="number" min="0" step="0.001" value="${esc(p.stock??0)}" aria-label="Estoque de ${esc(p.name||'produto')}"></td>
    <td><strong class="inline-regular-price">${money(p.price)}</strong></td>
    <td><label class="inline-switch" title="Ativar ou desativar produto"><input data-product-inline data-inline-active type="checkbox" ${checked(p.is_active)} aria-label="Produto ativo"><span></span></label></td>
    <td><label class="inline-switch" title="Ativar ou desativar oferta"><input data-product-inline data-inline-offer type="checkbox" ${checked(p.is_offer)} aria-label="Produto em oferta"><span></span></label></td>
    <td><input data-product-inline data-inline-offer-price class="inline-product-input inline-offer-price" type="number" min="0" step="0.01" value="${esc(p.offer_price??'')}" placeholder="0,00" aria-label="Preço da oferta"></td>
    <td><div class="row-actions inline-actions"><button type="button" data-inline-edit-product="${esc(p.id)}">Editar</button><button class="danger-inline" type="button" data-inline-delete-product="${esc(p.id)}">Apagar</button></div></td>
  </tr>`;
}

function pageMarkup(data){
  const products=data.products||[];
  const pages=Math.max(1,Math.ceil(Number(data.total||0)/40));
  return `<section data-inline-products-root>
    <div class="page-head"><div><h1>Produtos</h1><p>Altere estoque, ativação e ofertas diretamente na lista. EAN fica dentro do card de edição.</p></div></div>
    <form data-inline-product-filter class="toolbar inline-product-toolbar">
      <input type="search" name="q" value="${esc(state.q)}" placeholder="Buscar produto, SKU ou marca" aria-label="Buscar produto">
      <select name="status" aria-label="Status">
        <option value="" ${state.status===''?'selected':''}>Todos</option>
        <option value="active" ${state.status==='active'?'selected':''}>Ativos</option>
        <option value="inactive" ${state.status==='inactive'?'selected':''}>Inativos</option>
        <option value="offer" ${state.status==='offer'?'selected':''}>Ofertas</option>
        <option value="no-stock" ${state.status==='no-stock'?'selected':''}>Sem estoque</option>
      </select>
      <button class="primary" type="submit">Buscar</button>
      <button class="secondary" type="button" data-inline-refresh>Atualizar</button>
    </form>
    <section class="panel inline-products-panel">
      <div class="inline-products-summary"><strong>${esc(data.total||0)} produtos</strong><span>Página ${esc(data.page||state.page)} de ${esc(pages)}</span></div>
      <div class="table-wrap"><table class="data-table inline-products-table"><thead><tr><th>Produto</th><th>Estoque</th><th>Preço normal</th><th>Ativo</th><th>Oferta</th><th>Preço da oferta</th><th>Ações</th></tr></thead><tbody>${products.length?products.map(productRow).join(''):'<tr><td colspan="7" class="empty">Nenhum produto encontrado.</td></tr>'}</tbody></table></div>
      ${pages>1?`<div class="pagination"><button class="secondary" type="button" data-inline-page="${state.page-1}" ${state.page<=1?'disabled':''}>Anterior</button><span>Página ${state.page} de ${pages}</span><button class="secondary" type="button" data-inline-page="${state.page+1}" ${state.page>=pages?'disabled':''}>Próxima</button></div>`:''}
    </section>
  </section>`;
}

async function mountProducts({force=false}={}){
  if(!app||!productRoute())return;
  if(!force&&app.querySelector('[data-inline-products-root]'))return;
  if(state.loading)return;
  state.loading=true;
  const token=++state.token;
  app.innerHTML='<div class="loading"><span class="spinner"></span><p>Carregando produtos…</p></div>';
  try{
    const data=await productApi('products',{page:state.page,limit:40,q:state.q,status:state.status,sort:'name'});
    if(token!==state.token||!productRoute())return;
    state.total=Number(data.total||0);
    const maxPage=Math.max(1,Math.ceil(state.total/40));
    if(state.page>maxPage){state.page=maxPage;state.loading=false;return mountProducts({force:true})}
    app.innerHTML=pageMarkup(data);
  }catch(error){
    if(token===state.token&&productRoute())app.innerHTML=`<div class="page-head"><div><h1>Produtos</h1></div></div><section class="panel empty">${esc(error.message)}</section>`;
  }finally{state.loading=false}
}

function setRowBusy(row,busy){
  if(!row)return;
  row.classList.toggle('is-saving',busy);
  row.querySelectorAll('input,button').forEach(control=>control.disabled=busy);
}

function syncRow(row,product){
  if(!row||!product)return;
  const stock=row.querySelector('[data-inline-stock]');
  const active=row.querySelector('[data-inline-active]');
  const offer=row.querySelector('[data-inline-offer]');
  const offerPrice=row.querySelector('[data-inline-offer-price]');
  if(stock)stock.value=product.stock??0;
  if(active)active.checked=product.is_active===true;
  if(offer)offer.checked=product.is_offer===true;
  if(offerPrice)offerPrice.value=product.offer_price??'';
}

async function saveInline(row,patch,message){
  setRowBusy(row,true);
  try{
    const data=await productApi('update_product',{id:row.dataset.inlineProductRow,patch});
    syncRow(row,data.product);
    toast(message,'success');
    if(state.status)await mountProducts({force:true});
  }catch(error){
    toast(error.message,'error');
    await mountProducts({force:true});
  }finally{if(document.body.contains(row))setRowBusy(row,false)}
}

async function handleInlineChange(control){
  const row=control.closest('[data-inline-product-row]');
  if(!row)return;
  if(control.matches('[data-inline-stock]')){
    const value=Number(control.value);
    if(!Number.isFinite(value)||value<0){toast('Informe um estoque válido.','error');return mountProducts({force:true})}
    return saveInline(row,{stock:value},'Estoque atualizado.');
  }
  if(control.matches('[data-inline-active]'))return saveInline(row,{is_active:control.checked},control.checked?'Produto ativado.':'Produto desativado.');
  if(control.matches('[data-inline-offer]')){
    const priceInput=row.querySelector('[data-inline-offer-price]');
    const raw=priceInput?.value.trim()||'';
    const price=raw===''?null:Number(raw);
    if(control.checked&&(price===null||!Number.isFinite(price)||price<0)){
      control.checked=false;
      priceInput?.focus();
      toast('Informe primeiro o preço da oferta.','error');
      return;
    }
    return saveInline(row,{is_offer:control.checked,offer_price:price},control.checked?'Oferta ativada.':'Oferta desativada.');
  }
  if(control.matches('[data-inline-offer-price]')){
    const raw=control.value.trim();
    const price=raw===''?null:Number(raw);
    const offer=row.querySelector('[data-inline-offer]');
    if(price!==null&&(!Number.isFinite(price)||price<0)){toast('Informe um preço de oferta válido.','error');return mountProducts({force:true})}
    if(offer?.checked&&price===null){toast('Preço da oferta é obrigatório enquanto a oferta estiver ativa.','error');return mountProducts({force:true})}
    return saveInline(row,{offer_price:price,is_offer:!!offer?.checked},'Preço da oferta atualizado.');
  }
}

function editorMarkup(p){
  return `<form id="productInlineEditorForm" class="editor-shell" data-product-id="${esc(p.id)}">
    <div class="editor-head"><div><h2>Editar produto</h2><div class="muted">EAN fica aqui, dentro do card.</div></div><button class="close-dialog" type="button" data-inline-close-dialog>×</button></div>
    <div class="form-grid">
      <label class="field wide"><span>Nome</span><input name="name" value="${esc(p.name||'')}" required></label>
      <label class="field"><span>EAN / GTIN</span><input name="gtin" value="${esc(p.gtin||'')}" inputmode="numeric"></label>
      <label class="field"><span>SKU / código</span><input name="sku" value="${esc(p.sku||'')}"></label>
      <label class="field"><span>NCM</span><input name="ncm" value="${esc(p.ncm||'')}" inputmode="numeric"></label>
      <label class="field"><span>Preço normal</span><input name="price" type="number" min="0" step="0.01" value="${esc(p.price??'')}"></label>
      <label class="field"><span>Preço da oferta</span><input name="offer_price" type="number" min="0" step="0.01" value="${esc(p.offer_price??'')}"></label>
      <label class="field"><span>Preço de custo</span><input name="cost" type="number" min="0" step="0.01" value="${esc(p.cost??'')}"></label>
      <label class="field"><span>Estoque</span><input name="stock" type="number" min="0" step="0.001" value="${esc(p.stock??0)}"></label>
      <label class="field"><span>Categoria</span><input name="category" value="${esc(p.category||'')}"></label>
      <label class="field"><span>Subcategoria</span><input name="subcategory" value="${esc(p.subcategory||'')}"></label>
      <label class="field"><span>Marca</span><input name="brand" value="${esc(p.brand||'')}"></label>
      <label class="field"><span>Embalagem</span><input name="packaging" value="${esc(p.packaging||'')}"></label>
      <label class="field"><span>Validade</span><input name="validity_date" type="date" value="${esc(p.validity_date||'')}"></label>
      <label class="field"><span>Ordem na vitrine</span><input name="sort_order" type="number" value="${esc(p.sort_order??0)}"></label>
      <label class="field wide"><span>URL da imagem</span><input name="image_url" value="${esc(p.image_url||'')}"></label>
      <label class="field wide"><span>Descrição curta</span><textarea name="description_short">${esc(p.description_short||'')}</textarea></label>
      <label class="field wide"><span>Descrição</span><textarea name="description_long">${esc(p.description_long||'')}</textarea></label>
      <div class="wide check-row"><label class="check"><input name="is_active" type="checkbox" ${checked(p.is_active)}> Ativo</label><label class="check"><input name="is_offer" type="checkbox" ${checked(p.is_offer)}> Oferta</label></div>
    </div>
    <div class="form-actions"><button class="secondary" type="button" data-inline-close-dialog>Cancelar</button><button class="primary" type="submit">Salvar produto</button></div>
  </form>`;
}

async function openEditor(id){
  try{
    const data=await productApi('product',{id});
    editorBody.innerHTML=editorMarkup(data.product);
    if(!dialog.open)dialog.showModal();
  }catch(error){toast(error.message,'error')}
}

function closeEditor(){
  if(dialog?.open)dialog.close();
  if(editorBody)editorBody.innerHTML='';
}

async function saveEditor(form){
  const data=Object.fromEntries(new FormData(form).entries());
  const offer=form.elements.is_offer.checked;
  const rawOffer=String(data.offer_price??'').trim();
  const offerPrice=rawOffer===''?null:Number(rawOffer);
  if(offer&&(offerPrice===null||!Number.isFinite(offerPrice)||offerPrice<0)){
    toast('Informe o preço da oferta.','error');
    form.elements.offer_price?.focus();
    return;
  }
  const patch={
    name:data.name,sku:data.sku,gtin:data.gtin,ncm:data.ncm,
    price:data.price,offer_price:offerPrice,cost:data.cost,stock:data.stock,
    category:data.category,subcategory:data.subcategory,brand:data.brand,packaging:data.packaging,
    validity_date:data.validity_date||null,sort_order:data.sort_order,image_url:data.image_url,
    description_short:data.description_short,description_long:data.description_long,
    is_active:form.elements.is_active.checked,is_offer:offer
  };
  const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=true;
  try{
    await productApi('update_product',{id:form.dataset.productId,patch});
    closeEditor();
    toast('Produto salvo.','success');
    await mountProducts({force:true});
  }catch(error){toast(error.message,'error');if(submit)submit.disabled=false}
}

async function deleteProduct(id,row){
  const name=row?.dataset.productName||'este produto';
  if(!confirm(`Apagar ${name}? A exclusão definitiva só acontece se ele não tiver histórico nem vínculos.`))return;
  setRowBusy(row,true);
  try{
    await productApi('delete_product',{id});
    toast('Produto apagado.','success');
    await mountProducts({force:true});
  }catch(error){
    if(error.code==='product_in_use'){
      const deactivate=confirm('Este produto possui histórico ou está ligado a cestas, pedidos ou estoque. Deseja somente desativá-lo?');
      if(deactivate){
        try{await productApi('update_product',{id,patch:{is_active:false,is_offer:false}});toast('Produto desativado.','success');await mountProducts({force:true})}
        catch(inner){toast(inner.message,'error')}
      }
    }else toast(error.message,'error');
  }finally{if(document.body.contains(row))setRowBusy(row,false)}
}

app?.addEventListener('submit',async event=>{
  const form=event.target.closest('[data-inline-product-filter]');
  if(!form)return;
  event.preventDefault();
  const data=new FormData(form);
  state.q=String(data.get('q')||'').trim();
  state.status=String(data.get('status')||'').trim();
  state.page=1;
  await mountProducts({force:true});
});

app?.addEventListener('click',async event=>{
  const target=event.target.closest('button');if(!target)return;
  if(target.matches('[data-inline-refresh]')){await mountProducts({force:true});return}
  if(target.matches('[data-inline-page]')){const page=Number(target.dataset.inlinePage);if(page>=1){state.page=page;await mountProducts({force:true})}return}
  if(target.matches('[data-inline-edit-product]')){await openEditor(target.dataset.inlineEditProduct);return}
  if(target.matches('[data-inline-delete-product]')){await deleteProduct(target.dataset.inlineDeleteProduct,target.closest('[data-inline-product-row]'));return}
});

app?.addEventListener('change',event=>{
  const control=event.target.closest('[data-product-inline]');
  if(control)handleInlineChange(control);
});

app?.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&event.target.matches('[data-inline-stock],[data-inline-offer-price]')){event.preventDefault();event.target.blur()}
});

editorBody?.addEventListener('click',event=>{if(event.target.closest('[data-inline-close-dialog]'))closeEditor()});
editorBody?.addEventListener('submit',event=>{
  const form=event.target.closest('#productInlineEditorForm');
  if(!form)return;
  event.preventDefault();
  saveEditor(form);
});

const observer=new MutationObserver(()=>{
  if(productRoute()&&!app.querySelector('[data-inline-products-root]')&&!state.loading)queueMicrotask(()=>mountProducts());
});
if(app)observer.observe(app,{childList:true});
window.addEventListener('hashchange',()=>setTimeout(()=>mountProducts(),0));
setTimeout(()=>mountProducts(),0);
