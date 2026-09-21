import {api} from './api.js';
import {requestOrderLabelPrint} from './order-label-print-v1.js';
import {requestOrderSeparationPrint} from './order-separation-print-v1.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
const paymentLabel=v=>({pix:'PIX',credit_card:'Cartão de crédito',meal_card:'Alimentação / refeição',cash:'Dinheiro'})[String(v||'')]||String(v||'Não informado');
const sourceLabel=v=>String(v||'')==='shopping_room'?'Comprar':'Vitrine anterior';
const addressLine=a=>[a?.street,a?.number&&`nº ${a.number}`,a?.neighborhood,a?.city,a?.state].filter(Boolean).join(' · ')||'Não informado';
const wa=phone=>{const d=String(phone||'').replace(/\D/g,'');return d?`https://wa.me/${d}`:'#'};

function groupItems(items=[]){
  const basket=[],extras=[];
  for(const item of items){const source=String(item?.metadata?.source||'');(source==='addon'?extras:basket).push(item)}
  return {basket,extras};
}
function itemRows(items=[]){
  if(!items.length)return '<div class="muted">Nenhum item nesta seção.</div>';
  return `<div class="order-items">${items.map(i=>`<div class="order-item"><div><strong>${esc(Number(i.quantity||0).toLocaleString('pt-BR',{maximumFractionDigits:3}))}x ${esc(i.name_snapshot||'Produto')}</strong>${i.metadata?.source?`<div class="muted">${esc(i.metadata.source)}</div>`:''}</div><span>${money(i.line_total)}</span></div>`).join('')}</div>`;
}
function field(label,value){return `<div><strong>${esc(label)}</strong><div class="muted">${esc(value||'—')}</div></div>`}

async function loadOrder(id){const data=await api('order',{id});return data.order||{}}
async function printIntegratedOrder(id){const order=await loadOrder(id);requestOrderLabelPrint(order)}
async function printSeparationIntegratedOrder(id){const data=await api('order',{id});requestOrderSeparationPrint(data.order||{},data.items||[])}
function printableIntegratedOrder(o={},items=[]){
  const customer=o.customer_snapshot||o.checkout_snapshot?.customer||{},address=o.delivery_address||o.checkout_snapshot?.delivery_address||{};
  const logo=new URL('../img/logoantonia5.png',location.href).href;
  const rows=items.map(i=>`<tr><td>${esc(Number(i.quantity||0).toLocaleString('pt-BR',{maximumFractionDigits:3}))}</td><td><strong>${esc(i.name_snapshot||'Produto')}</strong></td><td>${money(i.unit_price)}</td><td><strong>${money(i.line_total)}</strong></td></tr>`).join('')||'<tr><td colspan="4">Nenhum item informado.</td></tr>';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pedido ${esc(o.order_number||o.id||'')} · Dona Antônia</title><style>@page{size:A4;margin:11mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#25201d;margin:0;font-size:12px}.head{display:flex;justify-content:space-between;align-items:center;gap:18px;border-bottom:3px solid #e66b32;padding-bottom:12px;margin-bottom:14px}.brand{display:flex;align-items:center;gap:10px}.brand img{width:58px;height:58px;object-fit:contain}.brand h1{font-size:21px;color:#5b2d1f;margin:0}.muted{color:#766c67}.chip{background:#fff5ee;border:1px solid #f0d3c2;border-radius:10px;padding:9px 12px;text-align:right}.chip strong{display:block;color:#8c3f20;font-size:16px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.box{border:1px solid #e5ddd8;border-radius:9px;padding:10px;background:#fffdfa}.box h2,.section{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#a04b26;margin:0 0 7px}.box p{margin:4px 0;line-height:1.4}.section{margin-top:15px}table{width:100%;border-collapse:collapse}thead{background:#fff1e7}th,td{padding:8px;border-bottom:1px solid #eadfd8;text-align:left}th:nth-child(n+3),td:nth-child(n+3){text-align:right}.values{margin:15px 0 0 auto;width:min(330px,100%);border:1px solid #eadfd8;border-radius:9px;padding:9px 12px}.values div{display:flex;justify-content:space-between;padding:4px 0}.values .total{font-size:17px;font-weight:800;color:#8c3f20;border-top:2px solid #e66b32;margin-top:5px;padding-top:9px}.actions{display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px}.actions button{padding:9px 12px;border:1px solid #d8c9c1;border-radius:7px;background:white;font-weight:700}.actions .primary{background:#e66b32;color:white;border-color:#e66b32}.footer{margin-top:16px;padding-top:8px;border-top:1px solid #e5ddd8;font-size:9px;color:#877a74;word-break:break-all}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.actions{display:none}.box,.values{break-inside:avoid}tr{break-inside:avoid}}@media(max-width:650px){.grid{grid-template-columns:1fr}.head{align-items:flex-start;flex-direction:column}.chip{text-align:left}.values{width:100%}}</style></head><body><div class="actions"><button onclick="window.close()">Fechar</button><button class="primary" onclick="window.print()">Imprimir / Salvar PDF</button></div><header class="head"><div class="brand"><img src="${esc(logo)}" alt="Dona Antônia"><div><h1>Dona Antônia</h1><div class="muted">Cestas e mercado · Pedido completo</div></div></div><div class="chip"><strong>Pedido ${esc(o.order_number||o.id||'')}</strong><span class="muted">${esc(date(o.created_at))}</span></div></header><section class="grid"><div class="box"><h2>Cliente</h2><p><strong>${esc(customer.name||'Cliente')}</strong></p><p>${esc(o.phone_e164||customer.phone||'—')}</p></div><div class="box"><h2>Entrega</h2><p>${esc(addressLine(address))}</p><p>${esc(address.complement||'')}</p></div><div class="box"><h2>Pagamento</h2><p><strong>${esc(paymentLabel(o.payment_method))}</strong></p><p>Status: ${esc(o.status||'—')}</p></div><div class="box"><h2>Cesta e origem</h2><p><strong>${esc(o.basket_name_snapshot||'Sem cesta base')}</strong></p><p>${esc(sourceLabel(o.source))}</p></div></section><h2 class="section">Itens do pedido</h2><table><thead><tr><th>Qtd.</th><th>Produto</th><th>Unitário</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><section class="values"><div><span>Subtotal</span><strong>${money(o.subtotal)}</strong></div><div><span>Outras despesas</span><strong>${money(o.other_expenses)}</strong></div><div><span>Desconto</span><strong>${money(o.discount)}</strong></div><div class="total"><span>Total</span><strong>${money(o.total)}</strong></div></section><footer class="footer">ID do pedido: ${esc(o.id||'—')} · Bling: ${esc(o.bling_order_id||'—')}</footer></body></html>`;
}
function openFullOrderPrint(o,items,{autoPrint=false}={}){
  const win=window.open('','_blank');
  if(!win)throw new Error('O navegador bloqueou a abertura. Libere pop-ups para o Admin.');
  win.opener=null;win.document.open();win.document.write(printableIntegratedOrder(o,items));win.document.close();
  if(autoPrint)setTimeout(()=>win.print(),250);
}
async function printFullIntegratedOrder(id){const data=await api('order',{id});openFullOrderPrint(data.order||{},data.items||[],{autoPrint:true})}
async function pdfIntegratedOrder(id){const data=await api('order',{id});openFullOrderPrint(data.order||{},data.items||[])}

async function openIntegratedOrder(id){
  const dialog=document.getElementById('editorDialog'),body=document.getElementById('editorBody');
  if(!dialog||!body)return;
  body.innerHTML='<div class="editor-shell"><div class="panel">Carregando pedido…</div></div>';
  if(!dialog.open)dialog.showModal();
  try{
    const data=await api('order',{id}),o=data.order||{},customer=o.customer_snapshot||o.checkout_snapshot?.customer||{},address=o.delivery_address||o.checkout_snapshot?.delivery_address||{},groups=groupItems(data.items||[]);
    body.innerHTML=`<div class="editor-shell"><div class="editor-head"><div><h2>Pedido ${esc(o.order_number||'')}</h2><div class="muted">${date(o.created_at)} · ${esc(sourceLabel(o.source))}</div></div><div class="row-actions"><button class="secondary" type="button" data-print-full-integrated="${esc(o.id)}">Imprimir pedido</button><button class="secondary" type="button" data-pdf-integrated="${esc(o.id)}">Baixar PDF</button><button class="close-dialog" type="button" data-close-integrated-order>×</button></div></div>
      <section class="panel"><h3>${money(o.total)}</h3><div class="detail-grid">${field('Status',o.status)}${field('Forma de pagamento',paymentLabel(o.payment_method))}${field('Cesta',o.basket_name_snapshot||'Sem cesta')}${field('Sincronização',o.sync_status||'—')}</div></section>
      <section class="panel"><h3>Cliente</h3><div class="detail-grid">${field('Nome',customer.name)}${field('WhatsApp',o.phone_e164||customer.phone)}${field('CPF/CNPJ',customer.cpf_cnpj)}</div>${o.phone_e164?`<p><a class="primary maps-link" href="${wa(o.phone_e164)}" target="_blank" rel="noopener">Abrir WhatsApp</a></p>`:''}</section>
      <section class="panel"><h3>Endereço de entrega</h3><p><strong>${esc(addressLine(address))}</strong></p>${address.complement?`<p>Complemento: ${esc(address.complement)}</p>`:''}${address.reference?`<p>Referência: ${esc(address.reference)}</p>`:''}${address.postal_code?`<p>CEP: ${esc(address.postal_code)}</p>`:''}</section>
      <section class="panel"><h3>Produtos</h3>${groups.basket.length?`<h4>Produtos da cesta</h4>${itemRows(groups.basket)}`:''}${groups.extras.length?`<h4>Produtos extras</h4>${itemRows(groups.extras)}`:''}${!groups.basket.length&&!groups.extras.length?itemRows(data.items||[]):''}</section>
      <section class="panel"><h3>Valores</h3><div class="detail-grid">${field('Subtotal',money(o.subtotal))}${field('Subtotal fiscal',money(o.fiscal_subtotal))}${field('Outras despesas',money(o.other_expenses))}${field('Desconto',money(o.discount))}${field('Total',money(o.total))}</div></section>
      <section class="panel"><h3>Dados operacionais</h3><div class="detail-grid">${field('Origem',o.source)}${field('ID do pedido',o.id)}${field('Sessão do catálogo',o.catalog_session_id)}${field('Carrinho',o.cart_id)}${field('Conversa',o.conversation_id)}${field('Cliente ID',o.customer_id)}${field('Cesta ID',o.basket_id)}${field('Bling',o.bling_order_id)}${field('Confirmado em',date(o.confirmed_at))}</div>${o.sync_error?`<p class="muted">Erro de sincronização: ${esc(o.sync_error)}</p>`:''}</section>
    </div>`;
    body.querySelector('[data-close-integrated-order]')?.addEventListener('click',()=>dialog.close());
  }catch(error){body.innerHTML=`<div class="editor-shell"><div class="editor-head"><h2>Pedido</h2><button class="close-dialog" type="button" data-close-integrated-order>×</button></div><div class="panel empty">${esc(error?.message||'Não foi possível abrir o pedido.')}</div></div>`;body.querySelector('[data-close-integrated-order]')?.addEventListener('click',()=>dialog.close())}
}

document.addEventListener('click',async event=>{
  const element=event.target instanceof Element?event.target:null;
  if(!element)return;
  const fullPrint=element.closest('[data-print-full-integrated]');if(fullPrint){event.preventDefault();event.stopImmediatePropagation();fullPrint.closest('details')?.removeAttribute('open');try{await printFullIntegratedOrder(fullPrint.dataset.printFullIntegrated)}catch(error){window.alert(error?.message||'Não foi possível imprimir o pedido.')}return}
  const labelPrint=element.closest('[data-print-label-integrated]');if(labelPrint){event.preventDefault();event.stopImmediatePropagation();labelPrint.closest('details')?.removeAttribute('open');try{await printIntegratedOrder(labelPrint.dataset.printLabelIntegrated)}catch(error){window.alert(error?.message||'Não foi possível preparar a etiqueta.')}return}
  const separationPrint=element.closest('[data-print-separation-integrated]');if(separationPrint){event.preventDefault();event.stopImmediatePropagation();separationPrint.closest('details')?.removeAttribute('open');try{await printSeparationIntegratedOrder(separationPrint.dataset.printSeparationIntegrated)}catch(error){window.alert(error?.message||'Não foi possível preparar a separação.')}return}
  const pdf=element.closest('[data-pdf-integrated]');if(pdf){event.preventDefault();event.stopImmediatePropagation();try{await pdfIntegratedOrder(pdf.dataset.pdfIntegrated)}catch(error){window.alert(error?.message||'Não foi possível preparar o PDF.')}return}
  const target=element.closest('[data-view-order]');
  if(!target)return;
  event.preventDefault();event.stopImmediatePropagation();
  openIntegratedOrder(target.dataset.viewOrder);
},true);

export {openIntegratedOrder,printIntegratedOrder,printSeparationIntegratedOrder,printFullIntegratedOrder,pdfIntegratedOrder};
