(()=>{
  'use strict';
  const C=window.DA_ADMIN_CONFIG||{};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const text=v=>String(v??'').trim();
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const moneyOrDash=v=>(v===null||v===undefined||v==='')?'—':money(v);
  const formatPhone=v=>{const d=String(v||'').replace(/\D/g,'').replace(/^55/,'');if(d.length===11)return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;if(d.length===10)return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;return v||'—'};
  const state={route:'products',productPage:1,productTotal:0,customerPage:1,customerTotal:0,productTimer:null,basketTimer:null,customerTimer:null,currentBasket:null,currentProduct:null,currentCustomer:null};

  async function api(action,payload={}){
    const response=await fetch(`${C.supabaseUrl}/functions/v1/${C.edgeFunction}`,{
      method:'POST',headers:{apikey:C.supabasePublishableKey,'Content-Type':'application/json'},
      body:JSON.stringify({action,...payload}),cache:'no-store',credentials:'omit'
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false){const error=new Error(labelError(data.error,data.detail||`Erro ${response.status}`));error.code=data.error||'';error.detail=data.detail||'';throw error}
    return data;
  }

  function labelError(code,fallback='Erro ao concluir'){
    const labels={
      name_required:'Informe o nome.',invalid_gtin:'EAN/GTIN inválido.',invalid_ncm:'NCM precisa ter 8 dígitos.',invalid_price:'Preço inválido.',invalid_cost:'Custo inválido.',invalid_stock:'Estoque inválido.',invalid_offer_price:'Preço da oferta inválido.',invalid_base_price:'Preço da cesta inválido.',invalid_quantity:'Quantidade inválida.',invalid_phone:'Telefone inválido.',invalid_google_maps_url:'Use um link válido do Google Maps.',phone_already_used:'Este telefone já pertence a outro cliente.',product_not_found:'Produto não encontrado.',product_in_use:'Este produto possui vínculos ou histórico e não pode ser apagado.',basket_not_found:'Cesta não encontrada.',customer_not_found:'Cliente não encontrado.'
    };
    return labels[code]||fallback||code||'Erro ao concluir';
  }

  function toast(message,kind=''){
    const host=$('toastRegion');if(!host)return;
    const node=document.createElement('div');node.className=`toast ${kind}`.trim();node.textContent=message;host.appendChild(node);setTimeout(()=>node.remove(),kind==='error'?6000:3000);
  }
  function openModal(title,eyebrow='Editar'){$('modalTitle').textContent=title;$('modalEyebrow').textContent=eyebrow;$('modalBody').innerHTML='<div class="empty">Carregando…</div>';$('modalFooter').innerHTML='';$('modalBackdrop').classList.remove('hidden');$('modal').classList.remove('hidden')}
  function closeModal(){$('modalBackdrop').classList.add('hidden');$('modal').classList.add('hidden')}
  function field(label,id,value='',type='text',attrs=''){return `<label class="edit-field"><span>${esc(label)}</span><input id="${id}" type="${type}" value="${esc(value??'')}" ${attrs}></label>`}
  function area(label,id,value='',rows=3){return `<label class="edit-field span2"><span>${esc(label)}</span><textarea id="${id}" rows="${rows}">${esc(value??'')}</textarea></label>`}
  function check(label,id,checked){return `<label class="check-field"><input id="${id}" type="checkbox" ${checked?'checked':''}><span>${esc(label)}</span></label>`}
  const val=id=>$(id)?.value??'';
  const checked=id=>!!$(id)?.checked;

  function statusBadges(p){
    const badges=[];
    if(p?.source_system==='ai_ean_research'&&!p?.is_active)badges.push('<span class="badge ai-review">REVISÃO IA</span>');
    else badges.push(`<span class="badge ${p?.is_active?'success':'muted-badge'}">${p?.is_active?'Ativo':'Inativo'}</span>`);
    if(p?.source_system==='inventory_fast_discovered'&&!p?.is_active)badges.push('<span class="badge warning">Contagem</span>');
    if(p?.is_offer)badges.push('<span class="badge info">Oferta</span>');
    return badges.join('');
  }
  function mapsUrl(address={}){
    const exact=text(address.google_maps_url);if(exact)return exact;
    const parts=[address.street,address.number,address.neighborhood,address.city,address.state,address.postal_code].map(text).filter(Boolean);
    return parts.length?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`:'';
  }

  const titles={products:['Produtos','Produtos cadastrados, incluindo ativos e inativos.'],baskets:['Cestas básicas','Cadastro, preço e composição das cestas.'],customers:['Clientes','Cadastro completo, endereço e Google Maps.']};
  function setRoute(next,load=true){
    if(!titles[next])next='products';state.route=next;
    document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.dataset.view===next));
    document.querySelectorAll('.nav[data-route]').forEach(n=>n.classList.toggle('active',n.dataset.route===next));
    const [title,sub]=titles[next];$('pageTitle').textContent=title;$('pageSubtitle').textContent=sub;$('sidebar').classList.remove('open');
    if(!load)return;if(next==='products')loadProducts();if(next==='baskets')loadBaskets();if(next==='customers')loadCustomers();
  }

  async function loadProducts(){
    const rows=$('productRows');rows.innerHTML='<tr><td colspan="7" class="empty">Carregando…</td></tr>';
    try{
      const data=await api('products',{page:state.productPage,limit:40,q:val('productSearch'),status:val('productStatus'),sort:val('productSort'),category:val('productCategory'),brand:val('productBrand')});
      state.productTotal=data.total||0;$('productCount').textContent=`${state.productTotal} produto(s)`;$('productPage').textContent=`Página ${data.page||state.productPage}`;$('prevProducts').disabled=state.productPage<=1;$('nextProducts').disabled=state.productPage*40>=state.productTotal;
      rows.innerHTML=(data.products||[]).length?data.products.map(p=>`<tr data-product-row="${esc(p.id)}" data-product-name="${esc(p.name||'Produto')}">
        <td><div class="product-cell"><img loading="lazy" decoding="async" src="${esc(p.image_url||'')}" alt="" onerror="this.style.visibility='hidden'"><div><strong>${esc(p.name||'Produto')}</strong><small>${esc([p.sku?`SKU ${p.sku}`:'',p.brand,p.packaging,p.category].filter(Boolean).join(' · '))}</small></div></div></td>
        <td><input class="inline-product-control inline-number" data-inline-stock type="number" min="0" step="0.001" value="${esc(p.stock??0)}" aria-label="Estoque de ${esc(p.name||'produto')}"></td>
        <td><strong>${moneyOrDash(p.price)}</strong></td>
        <td><label class="inline-check" title="Ativar ou desativar produto"><input data-inline-active type="checkbox" ${p.is_active?'checked':''} aria-label="Produto ativo"></label></td>
        <td><label class="inline-check" title="Ativar ou desativar oferta"><input data-inline-offer type="checkbox" ${p.is_offer?'checked':''} aria-label="Produto em oferta"></label></td>
        <td><input class="inline-product-control inline-money" data-inline-offer-price type="number" min="0" step="0.01" value="${esc(p.offer_price??'')}" placeholder="0,00" aria-label="Preço da oferta"></td>
        <td><div class="row-actions"><button class="row-button" data-open-product="${esc(p.id)}" type="button">Editar</button><button class="row-button danger-mini" data-delete-product="${esc(p.id)}" type="button">Apagar</button></div></td>
      </tr>`).join(''):'<tr><td colspan="7" class="empty">Nenhum produto encontrado.</td></tr>';
    }catch(e){rows.innerHTML=`<tr><td colspan="7" class="empty">${esc(e.message)}</td></tr>`}
  }
  function setProductRowBusy(row,busy){if(!row)return;row.classList.toggle('saving',busy);row.querySelectorAll('input,button').forEach(el=>el.disabled=busy)}
  async function saveInlineProduct(row,patch,message='Alteração salva.'){
    setProductRowBusy(row,true);
    try{await api('update_product',{id:row.dataset.productRow,patch});toast(message,'success');if(val('productStatus'))loadProducts()}
    catch(e){toast(e.message,'error');loadProducts()}
    finally{if(document.body.contains(row))setProductRowBusy(row,false)}
  }
  async function handleProductInlineChange(e){
    const control=e.target,row=control.closest('[data-product-row]');if(!row)return;
    if(control.matches('[data-inline-stock]')){const n=Number(control.value);if(!Number.isFinite(n)||n<0){toast('Informe um estoque válido.','error');loadProducts();return}await saveInlineProduct(row,{stock:n},'Estoque atualizado.');return}
    if(control.matches('[data-inline-active]')){await saveInlineProduct(row,{is_active:control.checked},control.checked?'Produto ativado.':'Produto desativado.');return}
    if(control.matches('[data-inline-offer]')){const priceInput=row.querySelector('[data-inline-offer-price]');const offerPrice=Number(priceInput?.value);if(control.checked&&(!priceInput?.value||!Number.isFinite(offerPrice)||offerPrice<0)){control.checked=false;priceInput?.focus();toast('Informe primeiro o preço da oferta.','error');return}await saveInlineProduct(row,{is_offer:control.checked},control.checked?'Oferta ativada.':'Oferta desativada.');return}
    if(control.matches('[data-inline-offer-price]')){const raw=control.value.trim(),n=raw===''?null:Number(raw);if(n!==null&&(!Number.isFinite(n)||n<0)){toast('Informe um preço de oferta válido.','error');loadProducts();return}await saveInlineProduct(row,{offer_price:n},'Preço da oferta atualizado.');}
  }
  async function deleteProductFromRow(row,id){
    const name=row?.dataset.productName||'este produto';if(!confirm(`Apagar ${name}? Esta ação só será concluída se o produto não possuir histórico ou vínculos.`))return;
    setProductRowBusy(row,true);
    try{await api('delete_product',{id});toast('Produto apagado.','success');state.productTotal=Math.max(0,state.productTotal-1);loadProducts()}
    catch(e){
      if(e.code==='product_in_use'){
        const deactivate=confirm('Este produto já possui histórico ou está ligado a cestas/pedidos/estoque e não pode ser apagado. Deseja apenas desativá-lo?');
        if(deactivate){try{await api('update_product',{id,patch:{is_active:false,is_offer:false}});toast('Produto desativado.','success');loadProducts()}catch(err){toast(err.message,'error')}}
      }else toast(e.message,'error');
    }finally{if(document.body.contains(row))setProductRowBusy(row,false)}
  }

  async function openProduct(id){openModal('Produto','Vitrine');try{const data=await api('product',{id});state.currentProduct=data.product;renderProductEditor()}catch(e){$('modalBody').innerHTML=`<div class="empty">${esc(e.message)}</div>`}}
  function renderProductEditor(){
    const p=state.currentProduct||{};$('modalTitle').textContent=p.name||'Produto';
    const review=p.source_system==='ai_ean_research'&&!p.is_active?'<div class="editor-note ai-note"><strong>REVISÃO IA</strong><br>Produto encontrado automaticamente pelo EAN. Confira nome, embalagem, NCM, imagem e preço antes de ativar.</div>':'';
    $('modalBody').innerHTML=`${review}<div class="product-editor-head">${p.image_url?`<img src="${esc(p.image_url)}" alt="">`:''}<div><strong>${esc(p.name||'Produto')}</strong><small>Estoque atual: ${esc(p.stock??0)}</small></div></div>
      <div class="edit-grid">
        ${field('Nome','ep_name',p.name)}${field('SKU / código','ep_sku',p.sku)}${field('EAN / GTIN','ep_gtin',p.gtin,'text','inputmode="numeric"')}${field('NCM','ep_ncm',p.ncm,'text','inputmode="numeric"')}
        ${field('Preço de venda','ep_price',p.price??'','number','min="0" step="0.01"')}${field('Preço da oferta','ep_offer_price',p.offer_price??'','number','min="0" step="0.01"')}${field('Preço de custo','ep_cost',p.cost??'','number','min="0" step="0.01"')}${field('Categoria','ep_category',p.category)}${field('Subcategoria','ep_subcategory',p.subcategory)}
        ${field('Marca','ep_brand',p.brand)}${field('Embalagem','ep_packaging',p.packaging)}${field('Validade','ep_validity',p.validity_date||'','date')}${field('Ordem na vitrine','ep_sort',p.sort_order??0,'number')}
        ${field('URL da imagem','ep_image',p.image_url)}${area('Descrição curta','ep_short',p.description_short||'',2)}${area('Descrição','ep_long',p.description_long||'',4)}
      </div><div class="checks">${check('Produto ativo','ep_active',p.is_active!==false)}${check('Oferta','ep_offer',p.is_offer===true)}</div>`;
    $('modalFooter').innerHTML='<button class="button secondary" data-close-modal type="button">Fechar</button><button class="button primary" id="ep_save" type="button">Salvar</button>';$('ep_save').onclick=saveProduct;
  }
  async function saveProduct(){
    const offer=checked('ep_offer'),offerRaw=val('ep_offer_price'),offerPrice=offerRaw===''?null:Number(offerRaw);if(offer&&(offerPrice===null||!Number.isFinite(offerPrice)||offerPrice<0)){toast('Informe o preço da oferta.','error');$('ep_offer_price')?.focus();return}
    const btn=$('ep_save');btn.disabled=true;btn.textContent='Salvando…';
    try{const patch={name:val('ep_name'),sku:val('ep_sku'),gtin:val('ep_gtin'),ncm:val('ep_ncm'),price:val('ep_price'),offer_price:offerPrice,cost:val('ep_cost'),category:val('ep_category'),subcategory:val('ep_subcategory'),brand:val('ep_brand'),packaging:val('ep_packaging'),validity_date:val('ep_validity')||null,sort_order:val('ep_sort'),image_url:val('ep_image'),description_short:val('ep_short'),description_long:val('ep_long'),is_active:checked('ep_active'),is_offer:offer};const data=await api('update_product',{id:state.currentProduct.id,patch});state.currentProduct=data.product;toast('Produto salvo.','success');renderProductEditor();loadProducts()}catch(e){toast(e.message,'error')}finally{if($('ep_save')){$('ep_save').disabled=false;$('ep_save').textContent='Salvar'}}
  }

  async function loadBaskets(){
    const host=$('basketRows');host.innerHTML='<div class="empty">Carregando…</div>';
    try{const data=await api('baskets',{q:val('basketSearch')});$('basketSummary').textContent=`${data.total||0} cesta(s)`;host.innerHTML=(data.baskets||[]).length?data.baskets.map(b=>`<article class="basket-card" data-open-basket="${esc(b.id)}"><div class="basket-image">${b.image_url?`<img loading="lazy" decoding="async" src="${esc(b.image_url)}" alt="">`:'<span>🧺</span>'}</div><div class="basket-copy"><div class="basket-flags"><b class="${b.is_active?'':'off'}">${b.is_active?'ATIVA':'INATIVA'}</b>${b.is_featured?'<b>DESTAQUE</b>':''}</div><h3>${esc(b.name)}</h3><p>${esc(b.description||'')}</p><strong class="basket-price">${money(b.base_price)}</strong><small>${(b.basket_template_items?.[0]?.count)||0} item(ns)</small></div></article>`).join(''):'<div class="empty">Nenhuma cesta cadastrada.</div>'}catch(e){host.innerHTML=`<div class="empty">${esc(e.message)}</div>`}
  }
  function newBasket(){state.currentBasket={basket:null,items:[]};openModal('Nova cesta','Vitrine');renderBasketEditor(true)}
  async function openBasket(id){openModal('Cesta','Vitrine');try{state.currentBasket=await api('basket',{id});renderBasketEditor(false)}catch(e){$('modalBody').innerHTML=`<div class="empty">${esc(e.message)}</div>`}}
  function renderBasketEditor(isNew=false){
    const b=state.currentBasket?.basket||{},items=state.currentBasket?.items||[];$('modalTitle').textContent=b.name||'Nova cesta';
    $('modalBody').innerHTML=`<div class="edit-grid">${field('Nome','eb_name',b.name)}${field('SKU interno','eb_sku',b.sku)}${field('Preço da cesta','eb_price',b.base_price??'','number','min="0" step="0.01"')}${field('Ordem','eb_sort',b.sort_order??0,'number')}${field('URL da foto','eb_image',b.image_url)}${area('Descrição','eb_description',b.description||'',3)}${area('Anotação interna','eb_notes',b.internal_notes||'',2)}</div><div class="checks">${check('Cesta ativa','eb_active',b.is_active!==false)}${check('Destaque','eb_featured',b.is_featured===true)}</div>${isNew?'<div class="editor-note">Crie a cesta para adicionar produtos.</div>':`<div class="basket-items-head"><div><h3>Composição</h3><small>Quantidade e possibilidade de edição na vitrine.</small></div><div class="product-search-mini"><input id="eb_product_search" placeholder="Adicionar por nome ou EAN"><div id="eb_product_results"></div></div></div><div id="eb_items" class="basket-items">${items.length?items.map(renderBasketItem).join(''):'<div class="empty">Nenhum produto na cesta.</div>'}</div>`}`;
    $('modalFooter').innerHTML=`<button class="button secondary" data-close-modal type="button">Fechar</button><button class="button primary" id="eb_save" type="button">${isNew?'Criar cesta':'Salvar cesta'}</button>`;$('eb_save').onclick=()=>saveBasket(isNew);if(!isNew){$('eb_product_search').addEventListener('input',basketProductSearch);$('eb_items').addEventListener('change',basketItemChange);$('eb_items').addEventListener('click',basketItemClick)}
  }
  function renderBasketItem(i){const p=i.product||{};return `<div class="basket-item" data-basket-item="${esc(i.id)}"><div class="basket-item-product">${p.image_url?`<img loading="lazy" src="${esc(p.image_url)}" alt="">`:''}<div><strong>${esc(p.name||'Produto')}</strong><small>${esc([p.gtin,p.brand,p.packaging].filter(Boolean).join(' · '))}</small></div></div><label>Qtd<input data-item-qty type="number" min="0.001" step="1" value="${esc(i.quantity)}"></label><label class="tiny-check"><input data-item-removable type="checkbox" ${i.removable?'checked':''}>Pode retirar</label><label class="tiny-check"><input data-item-editable type="checkbox" ${i.quantity_editable?'checked':''}>Pode alterar</label><button data-remove-basket-item class="row-button danger-mini" type="button">Remover</button></div>`}
  async function saveBasket(isNew){const btn=$('eb_save');btn.disabled=true;try{const data=await api('save_basket',{id:isNew?null:state.currentBasket.basket.id,name:val('eb_name'),sku:val('eb_sku'),base_price:val('eb_price'),sort_order:val('eb_sort'),image_url:val('eb_image'),description:val('eb_description'),internal_notes:val('eb_notes'),is_active:checked('eb_active'),is_featured:checked('eb_featured')});toast(isNew?'Cesta criada.':'Cesta salva.','success');state.currentBasket=await api('basket',{id:data.basket.id});renderBasketEditor(false);loadBaskets()}catch(e){toast(e.message,'error')}finally{if($('eb_save'))$('eb_save').disabled=false}}
  function basketProductSearch(){clearTimeout(state.basketTimer);const q=val('eb_product_search'),host=$('eb_product_results');if(q.length<2){host.innerHTML='';return}state.basketTimer=setTimeout(async()=>{try{const data=await api('search_products',{q});host.innerHTML=(data.products||[]).map(p=>`<button type="button" data-add-product="${esc(p.id)}"><span>${esc(p.name)}</span><small>${esc(p.gtin||p.sku||'')} · ${money(p.price||0)}</small></button>`).join('')||'<div class="empty mini">Nenhum produto.</div>'}catch(e){host.innerHTML=`<div class="empty mini">${esc(e.message)}</div>`}},220)}
  async function basketItemClick(e){const remove=e.target.closest('[data-remove-basket-item]');if(remove){const row=remove.closest('[data-basket-item]');if(!row)return;remove.disabled=true;try{await api('remove_basket_item',{id:row.dataset.basketItem});state.currentBasket=await api('basket',{id:state.currentBasket.basket.id});renderBasketEditor(false);toast('Produto removido.','success')}catch(err){toast(err.message,'error')}}}
  async function basketItemChange(e){const row=e.target.closest('[data-basket-item]');if(!row)return;const payload={id:row.dataset.basketItem,quantity:row.querySelector('[data-item-qty]').value,removable:row.querySelector('[data-item-removable]').checked,quantity_editable:row.querySelector('[data-item-editable]').checked};try{await api('update_basket_item',payload);toast('Composição atualizada.','success')}catch(err){toast(err.message,'error')}}
  async function addProductToBasket(id){try{await api('add_basket_item',{basket_id:state.currentBasket.basket.id,product_id:id,quantity:1,removable:true,quantity_editable:true});state.currentBasket=await api('basket',{id:state.currentBasket.basket.id});renderBasketEditor(false);toast('Produto adicionado.','success')}catch(e){toast(e.message,'error')}
  }

  async function loadCustomers(){
    const rows=$('customerRows');rows.innerHTML='<tr><td colspan="5" class="empty">Carregando…</td></tr>';
    try{const data=await api('customers',{page:state.customerPage,limit:40,q:val('customerSearch')});state.customerTotal=data.total||0;$('customerCount').textContent=`${state.customerTotal} cliente(s)`;$('customerPage').textContent=`Página ${data.page||state.customerPage}`;$('prevCustomers').disabled=state.customerPage<=1;$('nextCustomers').disabled=state.customerPage*40>=state.customerTotal;rows.innerHTML=(data.customers||[]).length?data.customers.map(c=>`<tr><td><strong>${esc(c.name||'Cliente sem nome')}</strong></td><td>${esc(formatPhone(c.primary_whatsapp_e164))}</td><td>${esc(c.cpf_cnpj||'—')}</td><td><strong>${esc(c.order_count||0)}</strong><small>${money(c.lifetime_value||0)}</small></td><td><button class="row-button" data-open-customer="${esc(c.id)}" type="button">Abrir</button></td></tr>`).join(''):'<tr><td colspan="5" class="empty">Nenhum cliente encontrado.</td></tr>'}catch(e){rows.innerHTML=`<tr><td colspan="5" class="empty">${esc(e.message)}</td></tr>`}
  }
  function newCustomer(){state.currentCustomer=null;openModal('Novo cliente','Cadastro');renderCustomerEditor({customer:{is_active:true},address:{state:'MT'},email:''},true)}
  async function openCustomer(id){openModal('Cliente','Cadastro');try{const data=await api('customer',{id});state.currentCustomer=data;renderCustomerEditor(data,false)}catch(e){$('modalBody').innerHTML=`<div class="empty">${esc(e.message)}</div>`}}
  function updateCustomerMapsLink(){
    const link=$('ec_maps_open');if(!link)return;
    const a={google_maps_url:val('ec_google_maps'),postal_code:val('ec_zip'),city:val('ec_city'),state:val('ec_state'),neighborhood:val('ec_neighborhood'),street:val('ec_street'),number:val('ec_number')};
    const href=mapsUrl(a);link.href=href||'#';link.classList.toggle('disabled',!href);link.setAttribute('aria-disabled',href?'false':'true');
  }
  function renderCustomerEditor(data,isNew){
    const c=data.customer||{},a=data.address||{};$('modalTitle').textContent=c.name||'Novo cliente';
    $('modalBody').innerHTML=`<div class="edit-grid">${field('Nome','ec_name',c.name)}${field('Telefone','ec_phone',formatPhone(c.primary_whatsapp_e164),'tel','inputmode="tel"')}${field('CPF/CNPJ','ec_cpf',c.cpf_cnpj,'text','inputmode="numeric"')}${field('E-mail','ec_email',data.email||'','email')}${field('CEP','ec_zip',a.postal_code,'text','inputmode="numeric"')}${field('Cidade','ec_city',a.city)}${field('Estado','ec_state',a.state||'MT')}${field('Bairro','ec_neighborhood',a.neighborhood)}${field('Rua / avenida','ec_street',a.street)}${field('Número','ec_number',a.number)}${field('Complemento','ec_complement',a.complement)}${field('Referência','ec_reference',a.reference)}${field('Link Google Maps','ec_google_maps',a.google_maps_url||'','url','placeholder="https://maps.app.goo.gl/..."')}<div class="maps-actions span2"><a id="ec_maps_open" class="button secondary" target="_blank" rel="noopener">Abrir no Google Maps</a><small>Se o link exato ficar vazio, usamos o endereço acima para abrir a busca no Maps.</small></div></div><div class="checks">${check('Cliente ativo','ec_active',c.is_active!==false)}</div>`;
    $('modalFooter').innerHTML='<button class="button secondary" data-close-modal type="button">Fechar</button><button class="button primary" id="ec_save" type="button">Salvar</button>';$('ec_save').onclick=()=>saveCustomer(isNew);
    ['ec_google_maps','ec_zip','ec_city','ec_state','ec_neighborhood','ec_street','ec_number'].forEach(id=>$(id)?.addEventListener('input',updateCustomerMapsLink));updateCustomerMapsLink();
  }
  async function saveCustomer(isNew){
    const btn=$('ec_save');btn.disabled=true;btn.textContent='Salvando…';
    try{const payload={id:isNew?null:state.currentCustomer.customer.id,name:val('ec_name'),phone:val('ec_phone'),cpf_cnpj:val('ec_cpf'),email:val('ec_email'),is_active:checked('ec_active'),address:{postal_code:val('ec_zip'),city:val('ec_city'),state:val('ec_state')||'MT',neighborhood:val('ec_neighborhood'),street:val('ec_street'),number:val('ec_number'),complement:val('ec_complement'),reference:val('ec_reference'),google_maps_url:val('ec_google_maps')}};const data=await api('save_customer',payload);toast(isNew?'Cliente criado.':'Cliente salvo.','success');state.currentCustomer=await api('customer',{id:data.customer.id});renderCustomerEditor(state.currentCustomer,false);loadCustomers()}catch(e){toast(e.message,'error')}finally{if($('ec_save')){$('ec_save').disabled=false;$('ec_save').textContent='Salvar'}}
  }

  function bind(){
    $('nav').addEventListener('click',e=>{const b=e.target.closest('[data-route]');if(b)setRoute(b.dataset.route)});
    $('menuButton').addEventListener('click',()=> $('sidebar').classList.toggle('open'));
    $('refreshButton').addEventListener('click',()=>setRoute(state.route,true));
    $('productSearch').addEventListener('input',()=>{clearTimeout(state.productTimer);state.productTimer=setTimeout(()=>{state.productPage=1;loadProducts()},220)});
    ['productStatus','productSort'].forEach(id=>$(id).addEventListener('change',()=>{state.productPage=1;loadProducts()}));
    ['productCategory','productBrand'].forEach(id=>$(id).addEventListener('input',()=>{clearTimeout(state.productTimer);state.productTimer=setTimeout(()=>{state.productPage=1;loadProducts()},220)}));
    $('prevProducts').addEventListener('click',()=>{if(state.productPage>1){state.productPage--;loadProducts()}});$('nextProducts').addEventListener('click',()=>{if(state.productPage*40<state.productTotal){state.productPage++;loadProducts()}});
    $('productRows').addEventListener('click',e=>{const del=e.target.closest('[data-delete-product]');if(del){deleteProductFromRow(del.closest('[data-product-row]'),del.dataset.deleteProduct);return}const b=e.target.closest('[data-open-product]');if(b)openProduct(b.dataset.openProduct)});
    $('productRows').addEventListener('change',handleProductInlineChange);
    $('productRows').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('[data-inline-stock],[data-inline-offer-price]')){e.preventDefault();e.target.blur()}});
    $('basketSearch').addEventListener('input',()=>{clearTimeout(state.basketTimer);state.basketTimer=setTimeout(loadBaskets,220)});$('newBasketButton').addEventListener('click',newBasket);$('basketRows').addEventListener('click',e=>{const b=e.target.closest('[data-open-basket]');if(b)openBasket(b.dataset.openBasket)});
    $('customerSearch').addEventListener('input',()=>{clearTimeout(state.customerTimer);state.customerTimer=setTimeout(()=>{state.customerPage=1;loadCustomers()},220)});$('newCustomerButton').addEventListener('click',newCustomer);$('prevCustomers').addEventListener('click',()=>{if(state.customerPage>1){state.customerPage--;loadCustomers()}});$('nextCustomers').addEventListener('click',()=>{if(state.customerPage*40<state.customerTotal){state.customerPage++;loadCustomers()}});$('customerRows').addEventListener('click',e=>{const b=e.target.closest('[data-open-customer]');if(b)openCustomer(b.dataset.openCustomer)});
    document.body.addEventListener('click',e=>{if(e.target.closest('[data-close-modal]'))closeModal();const add=e.target.closest('[data-add-product]');if(add)addProductToBasket(add.dataset.addProduct)});
    $('modalClose').addEventListener('click',closeModal);$('modalBackdrop').addEventListener('click',closeModal);
  }

  async function boot(){bind();try{await api('health');setRoute('products',true)}catch(e){$('productRows').innerHTML=`<tr><td colspan="7" class="empty">${esc(e.message)}</td></tr>`;toast(e.message,'error')}}
  boot();
})();