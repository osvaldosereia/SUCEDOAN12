(()=>{
  'use strict';
  const C=window.DA_ADMIN_V3_CONFIG||{};
  const AUTH_KEY='da_admin_v3_auth';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=v=>String(v??'').trim();
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const fmtDate=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR')};
  let auth=readAuth(),route='products',productPage=1,productTotal=0,productTimer=null,productRequest=0;

  function readAuth(){try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}}
  function saveAuth(value){localStorage.setItem(AUTH_KEY,JSON.stringify(value));auth=value}
  function showAccessNotice(){
    $('adminApp')?.classList.add('hidden');
    $('accessNotice')?.classList.remove('hidden');
  }
  function toast(message,kind=''){
    const host=$('toastRegion');if(!host)return;
    const node=document.createElement('div');node.className=`toast ${kind}`.trim();node.textContent=message;host.appendChild(node);setTimeout(()=>node.remove(),kind==='error'?6000:3000);
  }
  async function refreshAuth(){
    auth=readAuth();if(!auth?.refresh_token)throw new Error('Sessão deste aparelho expirou.');
    const r=await fetch(`${C.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:C.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:auth.refresh_token})});
    const data=await r.json().catch(()=>({}));if(!r.ok||!data.access_token)throw new Error('Sessão deste aparelho expirou.');saveAuth(data);return data;
  }
  async function api(action,payload={},retry=true){
    auth=readAuth();if(!auth?.access_token)throw new Error('Este aparelho ainda não está autorizado.');
    const r=await fetch(`${C.supabaseUrl}/functions/v1/${C.edgeFunction}`,{method:'POST',headers:{apikey:C.supabasePublishableKey,Authorization:`Bearer ${auth.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});
    const data=await r.json().catch(()=>({}));
    if(r.status===401&&retry&&auth?.refresh_token){await refreshAuth();return api(action,payload,false)}
    if(!r.ok||data.ok===false)throw new Error(data.detail||data.error||`Erro ${r.status}`);
    return data;
  }
  function badge(status){
    const s=text(status).toLowerCase();
    const kind=s.includes('error')?'danger':s.includes('pending')||s.includes('open')?'warning':s.includes('sync')||s==='done'||s==='closed'?'success':'info';
    const labels={pending_bling:'Pendente Bling',synced:'Sincronizado',error_bling:'Erro Bling',pending:'Pendente',processing:'Processando',done:'Concluído',error:'Erro',cancelled:'Cancelado',open:'Aberta',closed:'Fechada'};
    return `<span class="badge ${kind}">${esc(labels[s]||status||'—')}</span>`;
  }
  const titles={
    products:['Produtos','Consulta, edição e conferência do catálogo.'],
    baskets:['Cestas básicas','Cadastro e composição das cestas.'],
    customers:['Clientes','Cadastro e histórico de compras.'],
    counts:['Contagens','Sessões de inventário físico.'],
    queue:['Fila Bling','Sincronizações e erros do ERP.']
  };
  function setRoute(next,load=true){
    if(!titles[next])next='products';route=next;
    document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.dataset.view===next));
    document.querySelectorAll('.nav[data-route]').forEach(n=>n.classList.toggle('active',n.dataset.route===next));
    const [title,sub]=titles[next];$('pageTitle').textContent=title;$('pageSubtitle').textContent=sub;$('sidebar').classList.remove('open');
    if(!load)return;
    if(next==='products')loadProducts();
    if(next==='counts')loadCounts();
    if(next==='queue')loadQueue();
  }
  async function loadProducts(){
    const rows=$('productRows');if(!rows)return;
    const request=++productRequest;rows.innerHTML='<tr><td colspan="7">Carregando…</td></tr>';
    try{
      const data=await api('products',{page:productPage,limit:40,q:$('productSearch')?.value||'',status:$('productStatus')?.value||'',sync_status:$('productSync')?.value||'',expiry:$('productExpiry')?.value||'',sort:$('productSort')?.value||'',category:$('productCategory')?.value||'',brand:$('productBrand')?.value||'',gondola:$('productGondola')?.value||'',shelf:$('productShelf')?.value||''});
      if(request!==productRequest)return;
      productTotal=data.total||0;$('productCount').textContent=`${productTotal} produto(s)`;$('productPage').textContent=`Página ${data.page||productPage}`;
      $('prevProducts').disabled=productPage<=1;$('nextProducts').disabled=productPage*40>=productTotal;
      rows.innerHTML=(data.products||[]).length?(data.products||[]).map(p=>`<tr>
        <td><div class="product-cell"><img loading="lazy" decoding="async" src="${esc(p.image_url||'')}" alt="" onerror="this.style.visibility='hidden'"><div><strong>${esc(p.name)}</strong><small>${esc([p.brand,p.packaging,p.category].filter(Boolean).join(' · '))}</small></div></div></td>
        <td><strong>${esc(p.gtin||'—')}</strong><small>${esc(p.sku||'')}</small></td>
        <td><strong>${esc(p.stock??0)}</strong><small>${p.price!=null?money(p.price):''}</small></td>
        <td><strong>${esc(p.validity_date||'—')}</strong><small>${esc([p.gondola,p.shelf].filter(Boolean).join(' / '))}</small></td>
        <td><label class="switch"><input type="checkbox" data-whatsapp-toggle="${esc(p.id)}" ${p.is_whatsapp_active?'checked':''}><span>${p.is_whatsapp_active?'Ativo':'Não'}</span></label></td>
        <td>${badge(p.sync_status)}</td>
        <td><button class="row-button" data-open-product="${esc(p.id)}" type="button">Abrir</button></td>
      </tr>`).join(''):'<tr><td colspan="7" class="empty">Nenhum produto encontrado.</td></tr>';
    }catch(e){rows.innerHTML=`<tr><td colspan="7" class="empty">${esc(e.message)}</td></tr>`}
  }
  async function toggleWhatsapp(input){
    input.disabled=true;
    try{await api('update_merchandising',{id:input.dataset.whatsappToggle,is_whatsapp_active:input.checked});input.nextElementSibling.textContent=input.checked?'Ativo':'Não';toast('Produto atualizado.','success')}
    catch(e){input.checked=!input.checked;toast(e.message,'error')}
    finally{input.disabled=false}
  }
  async function loadCounts(){
    const host=$('countRows');if(!host)return;host.innerHTML='<div class="empty">Carregando…</div>';
    try{const data=await api('counts',{limit:80});host.innerHTML=(data.counts||[]).length?data.counts.map(c=>`<div class="list-row"><div><strong>${esc(c.device_label||'Sessão')}</strong><small>${fmtDate(c.started_at)} · ${c.item_count||0} item(ns) · ${c.pending_sync||0} pendente(s)</small></div><div class="list-actions">${badge(c.status)}<button class="row-button" data-open-count="${esc(c.id)}" type="button">Itens</button></div></div>`).join(''):'<div class="empty">Nenhuma contagem.</div>'}catch(e){host.innerHTML=`<div class="empty">${esc(e.message)}</div>`}
  }
  async function openCount(id){
    openModal('Itens da contagem','Carregando…');
    try{const data=await api('count_items',{id});$('modalBody').innerHTML=(data.items||[]).length?`<div class="history">${data.items.map(i=>`<div class="history-row"><span><strong>${esc(i.product?.name||'Produto')}</strong><small>${esc(i.ean||'')}</small></span><span>${esc(i.previous_stock??'—')} → <strong>${esc(i.counted_stock)}</strong></span>${badge(i.sync_status)}</div>`).join('')}</div>`:'<div class="empty">Sessão sem itens.</div>'; }catch(e){$('modalBody').innerHTML=`<div class="empty">${esc(e.message)}</div>`}
  }
  async function loadQueue(){
    const host=$('queueRows');if(!host)return;host.innerHTML='<div class="empty">Carregando…</div>';
    try{const data=await api('queue',{limit:100,status:$('queueStatus')?.value||''});host.innerHTML=(data.commands||[]).length?data.commands.map(c=>`<div class="list-row"><div><strong>${esc(c.product?.name||c.command_type)}</strong><small>${esc(c.command_type)} · tentativa ${c.attempts||0}/${c.max_attempts||5}${c.error_message?' · '+esc(c.error_message):''}</small></div><div class="list-actions">${badge(c.status)}${c.status==='error'?`<button class="row-button" data-retry-command="${esc(c.id)}" type="button">Reprocessar</button>`:''}</div></div>`).join(''):'<div class="empty">Fila vazia.</div>'}catch(e){host.innerHTML=`<div class="empty">${esc(e.message)}</div>`}
  }
  async function retryCommand(id){try{await api('retry_command',{id});toast('Comando devolvido à fila.','success');loadQueue()}catch(e){toast(e.message,'error')}}
  function openModal(title,body=''){ $('modalTitle').textContent=title;$('modalEyebrow').textContent='Detalhes';$('modalBody').innerHTML=body;$('modalFooter').innerHTML='<button class="button secondary" data-close-modal type="button">Fechar</button>';$('modalBackdrop').classList.remove('hidden');$('modal').classList.remove('hidden') }
  function closeModal(){ $('modalBackdrop').classList.add('hidden');$('modal').classList.add('hidden') }
  async function refreshCurrent(){
    if(route==='products')return loadProducts();if(route==='counts')return loadCounts();if(route==='queue')return loadQueue();
    $('refreshButton').dispatchEvent(new CustomEvent('admin:refresh-secondary'));
  }
  function bind(){
    $('nav')?.addEventListener('click',e=>{const button=e.target.closest('.nav[data-route]');if(button)setRoute(button.dataset.route)});
    $('menuButton')?.addEventListener('click',()=> $('sidebar').classList.toggle('open'));
    $('refreshButton')?.addEventListener('click',refreshCurrent);
    $('productSearch')?.addEventListener('input',()=>{clearTimeout(productTimer);productTimer=setTimeout(()=>{productPage=1;loadProducts()},220)});
    ['productStatus','productSync','productExpiry','productSort','productCategory','productBrand','productGondola','productShelf'].forEach(id=>$(id)?.addEventListener(id==='productCategory'||id==='productBrand'||id==='productGondola'||id==='productShelf'?'input':'change',()=>{clearTimeout(productTimer);productTimer=setTimeout(()=>{productPage=1;loadProducts()},180)}));
    $('prevProducts')?.addEventListener('click',()=>{if(productPage>1){productPage--;loadProducts()}});$('nextProducts')?.addEventListener('click',()=>{if(productPage*40<productTotal){productPage++;loadProducts()}});
    $('productRows')?.addEventListener('change',e=>{const input=e.target.closest('[data-whatsapp-toggle]');if(input)toggleWhatsapp(input)});
    $('countRows')?.addEventListener('click',e=>{const b=e.target.closest('[data-open-count]');if(b)openCount(b.dataset.openCount)});
    $('reloadQueue')?.addEventListener('click',loadQueue);$('queueStatus')?.addEventListener('change',loadQueue);
    $('queueRows')?.addEventListener('click',e=>{const b=e.target.closest('[data-retry-command]');if(b)retryCommand(b.dataset.retryCommand)});
    document.body.addEventListener('click',e=>{if(e.target.closest('[data-close-modal]'))closeModal()});$('modalClose')?.addEventListener('click',closeModal);$('modalBackdrop')?.addEventListener('click',closeModal);
  }
  async function boot(){
    bind();
    auth=readAuth();if(!auth?.access_token&&!auth?.refresh_token){showAccessNotice();return}
    try{await api('health');$('accessNotice')?.classList.add('hidden');$('adminApp')?.classList.remove('hidden');setRoute('products',true)}catch(e){showAccessNotice();console.warn(e)}
  }
  boot();
})();
