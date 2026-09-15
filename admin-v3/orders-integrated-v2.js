import {api} from './api.js';

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

async function openIntegratedOrder(id){
  const dialog=document.getElementById('editorDialog'),body=document.getElementById('editorBody');
  if(!dialog||!body)return;
  body.innerHTML='<div class="editor-shell"><div class="panel">Carregando pedido…</div></div>';
  if(!dialog.open)dialog.showModal();
  try{
    const data=await api('order',{id}),o=data.order||{},customer=o.customer_snapshot||o.checkout_snapshot?.customer||{},address=o.delivery_address||o.checkout_snapshot?.delivery_address||{},groups=groupItems(data.items||[]);
    body.innerHTML=`<div class="editor-shell"><div class="editor-head"><div><h2>Pedido ${esc(o.order_number||'')}</h2><div class="muted">${date(o.created_at)} · ${esc(sourceLabel(o.source))}</div></div><button class="close-dialog" type="button" data-close-integrated-order>×</button></div>
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

document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target.closest('[data-view-order]'):null;
  if(!target)return;
  event.preventDefault();event.stopImmediatePropagation();
  openIntegratedOrder(target.dataset.viewOrder);
},true);

export {openIntegratedOrder};
