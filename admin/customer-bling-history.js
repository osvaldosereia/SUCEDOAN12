(()=>{
  'use strict';
  const C=window.DA_ADMIN_CONFIG||{};
  const EDGE='admin-customer-history-v1';
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=v=>{if(!v)return '—';const [y,m,d]=String(v).slice(0,10).split('-');return y&&m&&d?`${d}/${m}/${y}`:String(v)};
  let customerId=null,renderedFor=null,loading=false;
  const cache=new Map();

  async function history(id){
    if(cache.has(id))return cache.get(id);
    const r=await fetch(`${C.supabaseUrl}/functions/v1/${EDGE}`,{method:'POST',headers:{apikey:C.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({customer_id:id}),cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||d.ok===false)throw new Error(d.detail||d.error||`Erro ${r.status}`);
    cache.set(id,d);return d;
  }
  function items(order){
    const rows=order.bling_sales_history_items||[];
    if(!rows.length)return '<div class="bling-history-empty mini">Itens não disponíveis.</div>';
    return `<div class="bling-history-items">${rows.map(i=>`<div><span>${esc(i.name||i.sku||'Produto')}</span><b>${esc(i.quantity||0)} × ${money(i.unit_price||0)}</b></div>`).join('')}</div>`;
  }
  function content(data){
    const s=data.summary||{},orders=data.orders||[];
    return `<section id="customerBlingHistory" class="bling-history-card">
      <div class="bling-history-title"><div><span class="eyebrow">Bling</span><h3>Histórico Bling</h3></div><div class="bling-history-metrics"><b>${esc(s.orders||0)} compras</b><b>${money(s.total||0)}</b><small>Última: ${esc(date(s.last_order_date))}</small></div></div>
      ${orders.length?`<div class="bling-history-orders">${orders.map(o=>`<details><summary><span><strong>Pedido ${esc(o.order_number||o.bling_order_id)}</strong><small>${esc(date(o.order_date))}${o.status_name?` · ${esc(o.status_name)}`:''}</small></span><b>${money(o.total||0)}</b></summary>${items(o)}</details>`).join('')}</div>`:'<div class="bling-history-empty">Nenhuma compra do Bling importada para este cliente.</div>'}
    </section>`;
  }
  async function render(){
    const body=document.getElementById('modalBody');
    if(!body||!customerId||!document.getElementById('ec_name'))return;
    if(renderedFor===customerId&&document.getElementById('customerBlingHistory'))return;
    renderedFor=customerId;
    document.getElementById('customerBlingHistory')?.remove();
    const loadingNode=document.createElement('section');loadingNode.id='customerBlingHistory';loadingNode.className='bling-history-card';loadingNode.innerHTML='<div class="bling-history-empty">Carregando histórico Bling…</div>';body.appendChild(loadingNode);
    if(loading)return;loading=true;
    try{const data=await history(customerId);const node=document.getElementById('customerBlingHistory');if(node&&renderedFor===customerId)node.outerHTML=content(data)}
    catch(e){const node=document.getElementById('customerBlingHistory');if(node)node.innerHTML=`<div class="bling-history-empty">Histórico indisponível: ${esc(e.message)}</div>`}
    finally{loading=false}
  }
  document.addEventListener('click',e=>{
    const button=e.target.closest?.('[data-open-customer]');
    if(button){customerId=button.dataset.openCustomer||null;renderedFor=null;setTimeout(render,80)}
    if(e.target.closest?.('#newCustomer')){customerId=null;renderedFor=null}
  },true);
  const observer=new MutationObserver(()=>{if(customerId&&document.getElementById('ec_name'))render()});
  const start=()=>{const body=document.getElementById('modalBody');if(body)observer.observe(body,{childList:true,subtree:true})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
