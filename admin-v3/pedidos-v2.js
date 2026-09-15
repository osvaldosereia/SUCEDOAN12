const ENDPOINT='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-orders-comprar-v1';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR')};
const payment=v=>({pix:'PIX',credit_card:'Cartão de crédito',debit_card:'Cartão de débito',meal_card:'Alimentação / refeição',food_card:'Alimentação',cash:'Dinheiro'})[String(v||'')]||'Não informado';
const source=v=>({shopping_room:'Comprar',storefront_v2:'Vitrine antiga'})[String(v||'')]||String(v||'—');
const status=v=>({confirmed:'Confirmado',storefront_received:'Recebido',sent_to_bling:'Enviado ao Bling',processing:'Em processamento',ready:'Pronto',out_for_delivery:'Em entrega',delivered:'Entregue',cancelled:'Cancelado',returned:'Devolvido'})[String(v||'')]||String(v||'—');
const state={page:1,limit:30,total:0,q:'',status:'',source:''};

async function api(action,payload={}){
  const r=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...payload}),cache:'no-store'});
  const d=await r.json().catch(()=>({ok:false,error:'invalid_response'}));
  if(!r.ok||d.ok===false)throw new Error(String(d.detail||d.error||`Erro ${r.status}`));
  return d;
}

function toast(message){const host=$('toastRegion');if(!host)return;const el=document.createElement('div');el.className='toast';el.textContent=message;host.appendChild(el);setTimeout(()=>el.remove(),3500)}
function phoneLink(v){const d=String(v||'').replace(/\D/g,'');return d?`https://wa.me/${d}`:''}
function addressText(a={}){return [a.street,a.number&&`nº ${a.number}`,a.complement,a.neighborhood,a.city,a.state,a.postal_code&&`CEP ${a.postal_code}`,a.reference&&`Ref.: ${a.reference}`].filter(Boolean).join(' · ')||'Não informado'}

function renderRows(rows=[]){
  const host=$('orderRows');
  if(!rows.length){host.innerHTML='<tr><td colspan="8"><div class="empty">Nenhum pedido encontrado.</div></td></tr>';return}
  host.innerHTML=rows.map(o=>{const customer=o.customer_snapshot||{};return `<tr>
    <td><strong>${esc(o.order_number||o.id.slice(0,8))}</strong><div class="muted">${esc(source(o.source))}</div></td>
    <td>${esc(date(o.created_at))}</td>
    <td><strong>${esc(customer.name||'Cliente')}</strong></td>
    <td>${esc(o.phone_e164||customer.phone||'—')}</td>
    <td>${money(o.total)}</td>
    <td>${esc(payment(o.payment_method))}</td>
    <td><span class="badge">${esc(status(o.status))}</span></td>
    <td><button type="button" data-order-id="${esc(o.id)}">Ver pedido</button></td>
  </tr>`}).join('');
}

function renderPager(){const pages=Math.max(1,Math.ceil(state.total/state.limit));$('pageInfo').textContent=`Página ${state.page} de ${pages} · ${state.total} pedido${state.total===1?'':'s'}`;$('prevPage').disabled=state.page<=1;$('nextPage').disabled=state.page>=pages}

async function load(){
  $('orderRows').innerHTML='<tr><td colspan="8"><div class="loading">Carregando pedidos…</div></td></tr>';
  try{
    const d=await api('list',{page:state.page,limit:state.limit,q:state.q,status:state.status,source:state.source});
    state.total=Number(d.total||0);renderRows(d.orders||[]);renderPager();
  }catch(e){$('orderRows').innerHTML=`<tr><td colspan="8"><div class="empty">${esc(e.message)}</div></td></tr>`}
}

function itemSource(item){const s=String(item?.metadata?.source||'');return ({basket:'Cesta',substitution:'Cesta alterada',addon:'Produto extra'})[s]||'Produto'}
function detailSection(title,items){if(!items.length)return '';return `<section class="panel order-detail-section"><h3>${esc(title)}</h3><div class="order-detail-items">${items.map(i=>`<div class="order-detail-item"><div><strong>${esc(i.quantity)}× ${esc(i.name_snapshot)}</strong><small>${esc(itemSource(i))}${i.sku_snapshot?` · SKU ${esc(i.sku_snapshot)}`:''}</small></div><div><span>${money(i.unit_price)}</span><strong>${money(i.line_total)}</strong></div></div>`).join('')}</div></section>`}

async function openOrder(id){
  const dialog=$('orderDialog'),body=$('orderDialogBody');body.innerHTML='<div class="loading">Carregando pedido…</div>';if(!dialog.open)dialog.showModal();
  try{
    const d=await api('detail',{id}),o=d.order||{},items=d.items||[],customer=o.customer_snapshot||{},addr=o.delivery_address||{};
    const basketItems=items.filter(i=>['basket','substitution'].includes(String(i?.metadata?.source||'')));
    const extras=items.filter(i=>String(i?.metadata?.source||'')==='addon'||!['basket','substitution'].includes(String(i?.metadata?.source||'')));
    body.innerHTML=`<div class="editor-shell order-detail-shell">
      <div class="editor-head"><div><div class="eyebrow">${esc(source(o.source))}</div><h2>Pedido ${esc(o.order_number||o.id)}</h2><div class="muted">${esc(date(o.created_at))}</div></div><button class="close-dialog" type="button" data-close-order>×</button></div>
      <div class="order-detail-grid">
        <section class="panel"><h3>Cliente</h3><p><strong>${esc(customer.name||'Cliente')}</strong></p><p>${esc(o.phone_e164||customer.phone||'—')}</p>${phoneLink(o.phone_e164||customer.phone)?`<a class="secondary maps-link" href="${phoneLink(o.phone_e164||customer.phone)}" target="_blank" rel="noopener">Abrir WhatsApp</a>`:''}</section>
        <section class="panel"><h3>Entrega</h3><p>${esc(addressText(addr))}</p>${addr.locator&&typeof addr.locator==='object'?`<p class="muted">Localização recebida do aparelho.</p>`:''}</section>
        <section class="panel"><h3>Pagamento</h3><p><strong>${esc(payment(o.payment_method))}</strong></p><p>Status: ${esc(status(o.status))}</p><p>Integração: ${esc(o.sync_status||'local')}</p></section>
        <section class="panel"><h3>Cesta</h3><p><strong>${esc(o.basket_name_snapshot||'Sem cesta base')}</strong></p><p class="muted">Origem: ${esc(source(o.source))}</p></section>
      </div>
      ${detailSection('Produtos da cesta',basketItems)}
      ${detailSection('Produtos extras',extras)}
      <section class="panel"><h3>Valores</h3><div class="order-values"><span>Subtotal <strong>${money(o.subtotal)}</strong></span><span>Subtotal fiscal <strong>${money(o.fiscal_subtotal)}</strong></span><span>Outras despesas <strong>${money(o.other_expenses)}</strong></span><span>Desconto <strong>${money(o.discount)}</strong></span><span class="order-total">Total <strong>${money(o.total)}</strong></span></div></section>
      <details class="panel"><summary>Dados operacionais</summary><div class="ops-ids"><span>Pedido: ${esc(o.id||'—')}</span><span>Sessão: ${esc(o.catalog_session_id||'—')}</span><span>Carrinho: ${esc(o.cart_id||'—')}</span><span>Conversa: ${esc(o.conversation_id||'—')}</span><span>Bling: ${esc(o.bling_order_id||'—')}</span></div></details>
    </div>`;
  }catch(e){body.innerHTML=`<div class="empty">${esc(e.message)}</div>`}
}

$('filterForm').addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget);state.q=String(fd.get('q')||'').trim();state.status=String(fd.get('status')||'');state.source=String(fd.get('source')||'');state.page=1;load()});
$('orderRows').addEventListener('click',e=>{const b=e.target.closest('[data-order-id]');if(b)openOrder(b.dataset.orderId)});
$('prevPage').onclick=()=>{if(state.page>1){state.page--;load()}};
$('nextPage').onclick=()=>{const pages=Math.max(1,Math.ceil(state.total/state.limit));if(state.page<pages){state.page++;load()}};
$('refreshOrders').onclick=load;
$('orderDialog').addEventListener('click',e=>{if(e.target.matches('[data-close-order]'))$('orderDialog').close()});
$('orderDialog').addEventListener('cancel',()=>{});

load().catch(e=>toast(e.message));
