import {requestOrderLabelPrint} from './order-label-print-v1.js';

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
    <td><div class="row-actions"><button type="button" data-order-id="${esc(o.id)}">Ver pedido</button><button type="button" data-print-full-order="${esc(o.id)}">Imprimir pedido</button><button type="button" data-pdf-order="${esc(o.id)}">Baixar PDF</button><button type="button" data-print-order="${esc(o.id)}">Etiqueta</button></div></td>
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
function printableOrderDocument(o={},items=[]){
  const customer=o.customer_snapshot||{},addr=o.delivery_address||{};
  const orderNumber=esc(o.order_number||o.id||'Pedido');
  const rows=items.map(i=>`<tr><td>${esc(i.quantity)}</td><td><strong>${esc(i.name_snapshot||'Produto')}</strong><small>${esc(itemSource(i))}${i.sku_snapshot?` · SKU ${esc(i.sku_snapshot)}`:''}</small></td><td>${money(i.unit_price)}</td><td><strong>${money(i.line_total)}</strong></td></tr>`).join('')||'<tr><td colspan="4">Nenhum item informado.</td></tr>';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pedido ${orderNumber} · Dona Antônia</title><style>
  @page{size:A4;margin:11mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#25201d;margin:0;font-size:12px}.head{display:flex;justify-content:space-between;align-items:center;gap:20px;border-bottom:3px solid #e66b32;padding:0 0 13px;margin-bottom:14px}.brand-wrap{display:flex;align-items:center;gap:11px}.logo{width:58px;height:58px;object-fit:contain}.brand{font-size:21px;font-weight:800;color:#5b2d1f}.brand-sub{font-size:11px;color:#806b62;margin-top:2px}.order-chip{text-align:right;background:#fff5ee;border:1px solid #f0d3c2;border-radius:10px;padding:9px 12px}.order-chip strong{display:block;font-size:16px;color:#8c3f20}.muted,small{color:#766c67}.meta{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:13px}.box{border:1px solid #e5ddd8;border-radius:9px;padding:10px;background:#fffdfa}.box h2{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#a04b26;margin:0 0 7px}.box p{margin:4px 0;line-height:1.4}.section-title{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#a04b26;margin:15px 0 6px}table{width:100%;border-collapse:collapse}thead{background:#fff1e7}th,td{padding:8px;border-bottom:1px solid #eadfd8;text-align:left;vertical-align:top}th{font-size:10px;text-transform:uppercase;color:#704a39}th:nth-child(1){width:48px}th:nth-child(3),th:nth-child(4){width:110px;text-align:right}td:nth-child(3),td:nth-child(4){text-align:right}td small{display:block;margin-top:3px}.values{margin:15px 0 0 auto;width:min(330px,100%);border:1px solid #eadfd8;border-radius:9px;padding:9px 12px}.values div{display:flex;justify-content:space-between;padding:4px 0}.values .total{font-size:17px;font-weight:800;color:#8c3f20;border-top:2px solid #e66b32;margin-top:5px;padding-top:9px}.footer{margin-top:18px;padding-top:9px;border-top:1px solid #e5ddd8;font-size:9px;color:#877a74;word-break:break-all}.thanks{text-align:center;margin-top:14px;font-size:11px;color:#806b62}.no-print{display:flex;gap:8px;justify-content:flex-end;margin-bottom:12px}.no-print button{padding:9px 12px;border:1px solid #d8c9c1;border-radius:7px;background:white;font-weight:700}.no-print .primary{background:#e66b32;color:white;border-color:#e66b32}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.no-print{display:none}.box,.values{break-inside:avoid}thead{display:table-header-group}tr{break-inside:avoid}}@media(max-width:650px){.meta{grid-template-columns:1fr}.head{align-items:flex-start;flex-direction:column}.order-chip{text-align:left}.values{width:100%}}
  </style></head><body>
  <div class="no-print"><button onclick="window.close()">Fechar</button><button class="primary" onclick="window.print()">Imprimir / Salvar PDF</button></div>
  <header class="head"><div class="brand-wrap"><img class="logo" src="../img/logoantonia5.png" alt="Dona Antônia"><div><div class="brand">Dona Antônia</div><div class="brand-sub">Cestas e mercado · Pedido completo</div></div></div><div class="order-chip"><strong>Pedido ${orderNumber}</strong><span class="muted">${esc(date(o.created_at))}</span></div></header>
  <section class="meta"><div class="box"><h2>Cliente</h2><p><strong>${esc(customer.name||'Cliente')}</strong></p><p>${esc(o.phone_e164||customer.phone||'—')}</p></div><div class="box"><h2>Entrega</h2><p>${esc(addressText(addr))}</p></div><div class="box"><h2>Pagamento</h2><p><strong>${esc(payment(o.payment_method))}</strong></p><p>Status: ${esc(status(o.status))}</p></div><div class="box"><h2>Cesta e origem</h2><p><strong>${esc(o.basket_name_snapshot||'Sem cesta base')}</strong></p><p>${esc(source(o.source))}</p></div></section>
  <h2 class="section-title">Itens do pedido</h2><table><thead><tr><th>Qtd.</th><th>Produto</th><th>Unitário</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
  <section class="values"><div><span>Subtotal</span><strong>${money(o.subtotal)}</strong></div><div><span>Subtotal fiscal</span><strong>${money(o.fiscal_subtotal)}</strong></div><div><span>Outras despesas</span><strong>${money(o.other_expenses)}</strong></div><div><span>Desconto</span><strong>${money(o.discount)}</strong></div><div class="total"><span>Total</span><strong>${money(o.total)}</strong></div></section>
  <div class="thanks">Obrigado pela preferência.</div><footer class="footer">ID do pedido: ${esc(o.id||'—')} · Bling: ${esc(o.bling_order_id||'—')} · Sessão: ${esc(o.catalog_session_id||'—')} · Carrinho: ${esc(o.cart_id||'—')} · Conversa: ${esc(o.conversation_id||'—')}</footer>
  </body></html>`;
}
function openPrintableOrder(o,items,{autoPrint=false}={}){
  const win=window.open('','_blank','noopener,noreferrer');
  if(!win)throw new Error('O navegador bloqueou a abertura da impressão. Libere pop-ups para o Admin.');
  win.document.open();win.document.write(printableOrderDocument(o,items));win.document.close();
  if(autoPrint){win.addEventListener('load',()=>setTimeout(()=>win.print(),80),{once:true})}
}
async function printFullOrder(id){try{const d=await api('detail',{id});openPrintableOrder(d.order||{},d.items||[],{autoPrint:true})}catch(e){toast(e.message)}}
async function downloadOrderPdf(id){try{const d=await api('detail',{id});openPrintableOrder(d.order||{},d.items||[]);toast('Use “Imprimir / Salvar PDF” e escolha “Salvar como PDF”.')}catch(e){toast(e.message)}}
function detailSection(title,items){if(!items.length)return '';return `<section class="panel order-detail-section"><h3>${esc(title)}</h3><div class="order-detail-items">${items.map(i=>`<div class="order-detail-item"><div><strong>${esc(i.quantity)}× ${esc(i.name_snapshot)}</strong><small>${esc(itemSource(i))}${i.sku_snapshot?` · SKU ${esc(i.sku_snapshot)}`:''}</small></div><div><span>${money(i.unit_price)}</span><strong>${money(i.line_total)}</strong></div></div>`).join('')}</div></section>`}

async function printOrder(id){
  try{const d=await api('detail',{id});requestOrderLabelPrint(d.order||{})}
  catch(e){toast(e.message)}
}

async function openOrder(id){
  const dialog=$('orderDialog'),body=$('orderDialogBody');body.innerHTML='<div class="loading">Carregando pedido…</div>';if(!dialog.open)dialog.showModal();
  try{
    const d=await api('detail',{id}),o=d.order||{},items=d.items||[],customer=o.customer_snapshot||{},addr=o.delivery_address||{};
    const basketItems=items.filter(i=>['basket','substitution'].includes(String(i?.metadata?.source||'')));
    const extras=items.filter(i=>String(i?.metadata?.source||'')==='addon'||!['basket','substitution'].includes(String(i?.metadata?.source||'')));
    body.innerHTML=`<div class="editor-shell order-detail-shell">
      <div class="editor-head"><div><div class="eyebrow">${esc(source(o.source))}</div><h2>Pedido ${esc(o.order_number||o.id)}</h2><div class="muted">${esc(date(o.created_at))}</div></div><div class="order-dialog-actions"><button class="secondary" type="button" data-print-full-order="${esc(o.id)}">Imprimir pedido</button><button class="secondary" type="button" data-pdf-order="${esc(o.id)}">Baixar PDF</button><button class="close-dialog" type="button" data-close-order>×</button></div></div>
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
$('orderRows').addEventListener('click',e=>{const full=e.target.closest('[data-print-full-order]');if(full){printFullOrder(full.dataset.printFullOrder);return}const pdf=e.target.closest('[data-pdf-order]');if(pdf){downloadOrderPdf(pdf.dataset.pdfOrder);return}const print=e.target.closest('[data-print-order]');if(print){printOrder(print.dataset.printOrder);return}const b=e.target.closest('[data-order-id]');if(b)openOrder(b.dataset.orderId)});
$('prevPage').onclick=()=>{if(state.page>1){state.page--;load()}};
$('nextPage').onclick=()=>{const pages=Math.max(1,Math.ceil(state.total/state.limit));if(state.page<pages){state.page++;load()}};
$('refreshOrders').onclick=load;
$('orderDialog').addEventListener('click',e=>{const full=e.target.closest('[data-print-full-order]');if(full){printFullOrder(full.dataset.printFullOrder);return}const pdf=e.target.closest('[data-pdf-order]');if(pdf){downloadOrderPdf(pdf.dataset.pdfOrder);return}if(e.target.matches('[data-close-order]'))$('orderDialog').close()});
$('orderDialog').addEventListener('cancel',()=>{});

load().catch(e=>toast(e.message));
