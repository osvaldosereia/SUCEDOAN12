import fs from 'node:fs';

const path='vitrine/admin/index.html';
let s=fs.readFileSync(path,'utf8');
const start='  function orderV3SearchMatch(o,q){';
const end='  async function renderOrders(){';
const a=s.indexOf(start),b=s.indexOf(end,a);
if(a<0||b<0)throw new Error('orders v3 list markers not found');

const replacement=`  function orderV3SearchMatch(o,q){const n=normalize(q||'');if(!n)return true;return normalize([o.order_number,o.customer_name,o.whatsapp_phone_e164,o.delivery_address_snapshot?.street,o.delivery_address_snapshot?.district].filter(Boolean).join(' ')) .includes(n)}
  function orderCustomerDataPendingReasons(o){
    const labels=['Cliente não identificado','Telefone pendente','Endereço incompleto','CPF/CNPJ pendente'];
    const a=o?.delivery_address_snapshot||{},missing=(Array.isArray(o?.registration_missing_fields)?o.registration_missing_fields:[]).map(x=>normalize(String(x||'')));
    const reasons=[];
    if(!o?.customer_id)reasons.push(labels[0]);
    if(!String(o?.whatsapp_phone_e164||a.phone||'').replace(/\\D/g,''))reasons.push(labels[1]);
    if(![a.street,a.number,a.city,a.state].every(v=>String(v||'').trim()))reasons.push(labels[2]);
    if(o?.document_only_pending===true||missing.some(x=>x.includes('cpf')||x.includes('cnpj')||x.includes('document')))reasons.push(labels[3]);
    return [...new Set(reasons)];
  }
  function orderCustomerDataPending(o){return orderCustomerDataPendingReasons(o).length>0}
  function orderV3Milestones(o){const s=String(o?.status||'');return {confirmed:['confirmed','processing','ready','out_for_delivery','delivered'].includes(s),separated:['ready','out_for_delivery','delivered'].includes(s),delivered:s==='delivered',cancelled:s==='cancelled'}}
  function orderV3Tags(o){const m=orderV3Milestones(o),tags=[];if(m.confirmed)tags.push('<span class="order-v3-tag">CONFIRMADO</span>');if(m.separated)tags.push('<span class="order-v3-tag">SEPARADO</span>');if(m.delivered)tags.push('<span class="order-v3-tag">ENTREGUE</span>');if(m.cancelled)tags.push('<span class="order-v3-tag cancelled">CANCELADO</span>');if(!tags.length)tags.push('<span class="order-v3-tag neutral">RECEBIDO</span>');if(orderCustomerDataPending(o))tags.push('<span class="order-v3-tag neutral" title="'+esc(orderCustomerDataPendingReasons(o).join(' · '))+'">AGUARDANDO DADOS DO CLIENTE</span>');return tags.join('')}
  function orderRow(o){const m=orderV3Milestones(o),disabled=m.cancelled?'disabled':'';let controls='';if(orderCustomerDataPending(o)){const label=!m.confirmed?'CONFIRMADO':!m.separated?'SEPARADO':!m.delivered?'ENTREGUE':'';if(label)controls+='<button class="order-v3-control" type="button" disabled title="'+esc(orderCustomerDataPendingReasons(o).join(' · '))+'">'+label+'</button>'}else{if(!m.confirmed&&!m.cancelled)controls+='<button class="order-v3-control" type="button" data-v3-confirm="'+esc(o.id)+'">CONFIRMADO</button>';if(m.confirmed&&!m.separated&&!m.cancelled)controls+='<button class="order-v3-control" type="button" data-v3-separate="'+esc(o.id)+'">SEPARADO</button>';if(m.separated&&!m.delivered&&!m.cancelled)controls+='<button class="order-v3-control" type="button" data-v3-deliver="'+esc(o.id)+'">ENTREGUE</button>'}return '<article class="order-v3-card"><div class="order-v3-head"><div><small>Código do pedido</small><strong>#'+esc(shortOrder(o.order_number||o.id))+'</strong></div><div><small>Data</small><strong>'+esc(dateTime(o.created_at))+'</strong></div><div><small>Cliente</small><strong>'+esc(o.customer_name||'Sem cliente')+'</strong></div><div><small>Total</small><strong>'+money(o.total_cents||0)+'</strong></div></div><div class="order-v3-tags">'+orderV3Tags(o)+'</div>'+(controls?'<div class="order-v3-controls">'+controls+'</div>':'')+'<div class="order-v3-actions"><button class="order-v3-action" type="button" data-v3-separation="'+esc(o.id)+'" '+disabled+'>ABRIR VITRINE SEPARAÇÃO</button><button class="order-v3-action primary" type="button" data-open-order="'+esc(o.id)+'">ABRIR PEDIDO</button></div></article>'}
`;
s=s.slice(0,a)+replacement+s.slice(b);

s=s.replace(
  "  async function quickConfirmOrder(id,btn){if(btn){btn.disabled=true;btn.textContent='CONFIRMANDO…'}",
  "  async function quickConfirmOrder(id,btn){const current=state.orders.find(o=>String(o.id)===String(id));if(current&&orderCustomerDataPending(current)){toast('Complete os dados essenciais do cliente antes de confirmar');return}if(btn){btn.disabled=true;btn.textContent='CONFIRMANDO…'}"
);
s=s.replace(
  "  async function openOrderSeparationSheet(id){const order=state.orders.find(o=>String(o.id)===String(id));if(order&&!orderV3Milestones(order).confirmed)",
  "  async function openOrderSeparationSheet(id){const order=state.orders.find(o=>String(o.id)===String(id));if(order&&orderCustomerDataPending(order)){toast('Complete os dados essenciais do cliente antes da separação');return}if(order&&!orderV3Milestones(order).confirmed)"
);
s=s.replace(
  "  async function openOrderDeliveryConfirm(id){let order=state.orders.find(o=>String(o.id)===String(id));if(!order){await loadOrders();order=state.orders.find(o=>String(o.id)===String(id))}if(!order||!orderV3Milestones(order).separated",
  "  async function openOrderDeliveryConfirm(id){let order=state.orders.find(o=>String(o.id)===String(id));if(!order){await loadOrders();order=state.orders.find(o=>String(o.id)===String(id))}if(order&&orderCustomerDataPending(order)){toast('Complete os dados essenciais do cliente antes da entrega');return}if(!order||!orderV3Milestones(order).separated"
);

const detailNeedle="    const d=state.currentOrder,o=d.order,c=d.customer||{},delivery=o.delivery_address_snapshot||c.address||{},milestones=orderV3Milestones(o),states=orderV3SeparationMap(),sep=d.separation||{},completion=sep.completion||{},original=Number(completion.original_total??o.total_cents/100??0),missing=Number(completion.missing_subtotal||0),finalTotal=Number(completion.final_total??o.total_cents/100??0),sepStarted=Boolean(completion?.prepared_at||completion?.completed_at)||(sep.items||[]).some(x=>String(x.state||'pending')!=='pending'),locked=milestones.confirmed,editable=!milestones.delivered&&!milestones.cancelled;";
const detailReplacement="    const d=state.currentOrder,o=d.order,c=d.customer||{},delivery=o.delivery_address_snapshot||c.address||{},milestones=orderV3Milestones(o),states=orderV3SeparationMap(),sep=d.separation||{},completion=sep.completion||{},original=Number(completion.original_total??o.total_cents/100??0),missing=Number(completion.missing_subtotal||0),finalTotal=Number(completion.final_total??o.total_cents/100??0),sepStarted=Boolean(completion?.prepared_at||completion?.completed_at)||(sep.items||[]).some(x=>String(x.state||'pending')!=='pending'),locked=milestones.confirmed,editable=!milestones.delivered&&!milestones.cancelled,customerPending=orderCustomerDataPending(o),customerPendingReasons=orderCustomerDataPendingReasons(o);";
if(!s.includes(detailNeedle))throw new Error('order detail declaration marker not found');
s=s.replace(detailNeedle,detailReplacement);

const headerNeedle="    $('#editorBody').innerHTML='<div class=\"order-v3-detail-head\"><div><h2 style=\"margin:0\">Pedido #'";
if(!s.includes(headerNeedle))throw new Error('order detail header marker not found');
s=s.replace(headerNeedle,"    $('#editorBody').innerHTML=(customerPending?'<div class=\"rule-notice warn\"><strong>AGUARDANDO DADOS DO CLIENTE</strong><div>'+esc(customerPendingReasons.join(' · '))+'</div></div>':'')+'<div class=\"order-v3-detail-head\"><div><h2 style=\"margin:0\">Pedido #'");

s=s.replace(
  "(!milestones.confirmed&&!milestones.cancelled?'<button class=\"primary\" id=\"confirmOrderV3\" type=\"button\">CONFIRMAR PEDIDO</button>':'')",
  "(!milestones.confirmed&&!milestones.cancelled?'<button class=\"primary\" id=\"confirmOrderV3\" type=\"button\" '+(customerPending?'disabled title=\"Complete os dados essenciais do cliente\"':'')+'>CONFIRMAR PEDIDO</button>':'')"
);
s=s.replace(
  "(milestones.confirmed&&!milestones.delivered&&!milestones.cancelled?'<button class=\"secondary\" id=\"openSeparationV3\" type=\"button\">ABRIR VITRINE SEPARAÇÃO</button>':'')",
  "(milestones.confirmed&&!milestones.delivered&&!milestones.cancelled?'<button class=\"secondary\" id=\"openSeparationV3\" type=\"button\" '+(customerPending?'disabled title=\"Complete os dados essenciais do cliente\"':'')+'>ABRIR VITRINE SEPARAÇÃO</button>':'')"
);
s=s.replace(
  "(milestones.separated&&!milestones.delivered&&!milestones.cancelled?'<button class=\"primary\" id=\"deliverOrderV3\" type=\"button\">CONFIRMAR ENTREGA</button>':'')",
  "(milestones.separated&&!milestones.delivered&&!milestones.cancelled?'<button class=\"primary\" id=\"deliverOrderV3\" type=\"button\" '+(customerPending?'disabled title=\"Complete os dados essenciais do cliente\"':'')+'>CONFIRMAR ENTREGA</button>':'')"
);

fs.writeFileSync(path,s);
console.log('orders v3 customer data gate patched');
