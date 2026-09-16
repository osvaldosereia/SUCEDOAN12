const STYLE_ID='da-order-label-print-style';
const ROOT_ID='shippingLabelPrintRoot';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=value=>{if(!value)return '—';const parsed=new Date(value);return Number.isNaN(parsed.getTime())?'—':parsed.toLocaleString('pt-BR')};
const payment=value=>({pix:'PIX',credit_card:'Cartão de crédito',meal_card:'Alimentação / refeição',cash:'Dinheiro'})[String(value||'')]||'Não informado';

function ensureStyles(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    #app .data-table tr:has([data-view-order]) .row-actions a[href^="https://wa.me/"]{font-size:0;white-space:nowrap}
    #app .data-table tr:has([data-view-order]) .row-actions a[href^="https://wa.me/"]::after{content:"Imprimir etiqueta";font-size:14px;line-height:1.2}
    #${ROOT_ID}{display:none}
    @media print{
      @page{size:100mm 150mm;margin:4mm}
      html,body{margin:0!important;padding:0!important;background:#fff!important}
      body>*:not(#${ROOT_ID}){display:none!important}
      #${ROOT_ID}{display:block!important;margin:0!important;padding:0!important}
      #${ROOT_ID} .shipping-label{box-sizing:border-box;width:92mm;height:142mm;max-height:142mm;overflow:hidden;margin:0;padding:3mm 4mm 2.5mm;font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;page-break-inside:avoid;break-inside:avoid;page-break-after:always;break-after:page;display:flex;flex-direction:column}
      #${ROOT_ID} .shipping-label:last-child{page-break-after:auto;break-after:auto}
      #${ROOT_ID} .label-brand{font-size:10pt;font-weight:900;line-height:1.05;text-align:center;border-bottom:.8mm solid #000;padding-bottom:1.6mm;margin-bottom:2mm}
      #${ROOT_ID} .label-order{display:flex;justify-content:space-between;gap:2mm;align-items:flex-start;margin-bottom:2mm}
      #${ROOT_ID} .label-order>div:first-child{min-width:0;flex:1}
      #${ROOT_ID} .label-order strong{display:block;font-size:15pt;line-height:1;overflow-wrap:anywhere}
      #${ROOT_ID} .label-volume{font-size:10.5pt;line-height:1.05;font-weight:900;text-align:right;white-space:nowrap}
      #${ROOT_ID} .label-section{border-top:.35mm solid #000;padding-top:1.6mm;margin-top:1.6mm}
      #${ROOT_ID} .label-kicker{font-size:6.8pt;line-height:1;font-weight:900;text-transform:uppercase;letter-spacing:.04em;margin-bottom:.6mm}
      #${ROOT_ID} .label-main{font-size:11.5pt;font-weight:900;line-height:1.1;overflow-wrap:anywhere}
      #${ROOT_ID} .label-line{font-size:8.8pt;line-height:1.15;margin-top:.55mm;overflow-wrap:anywhere}
      #${ROOT_ID} .label-payment{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2.5mm;align-items:end}
      #${ROOT_ID} .label-payment>div{min-width:0}
      #${ROOT_ID} .label-total{font-size:16.5pt;line-height:1;font-weight:900;text-align:right;white-space:nowrap}
      #${ROOT_ID} .label-footer{margin-top:auto;padding-top:1.8mm;border-top:.35mm solid #000;font-size:7.4pt;line-height:1.1;text-align:center}
    }
  `;
  document.head.appendChild(style);
}

function addressLines(address={}){
  const first=[address.street,address.number&&`nº ${address.number}`].filter(Boolean).join(', ');
  const second=[address.complement,address.neighborhood].filter(Boolean).join(' · ');
  const third=[address.city,address.state].filter(Boolean).join(' - ');
  const locality=[third,address.postal_code&&`CEP ${address.postal_code}`].filter(Boolean).join(' · ');
  return [first,second,locality].filter(Boolean);
}

function askVolumeCount(){
  const raw=window.prompt('Quantidade de volumes para este pedido:','1');
  if(raw===null)return null;
  const volumes=Number.parseInt(String(raw).trim(),10);
  if(!Number.isInteger(volumes)||volumes<1||volumes>50){
    window.alert('Informe uma quantidade de volumes entre 1 e 50.');
    return null;
  }
  return volumes;
}

function labelMarkup(order,index,volumes){
  const customer=order.customer_snapshot||order.checkout_snapshot?.customer||{};
  const address=order.delivery_address||order.checkout_snapshot?.delivery_address||{};
  const phone=order.phone_e164||customer.phone||'—';
  const lines=addressLines(address);
  return `<section class="shipping-label">
    <div class="label-brand">SUPER CESTAS BÁSICAS DONA ANTÔNIA</div>
    <div class="label-order"><div><div class="label-kicker">Pedido</div><strong>${esc(order.order_number||order.id||'—')}</strong></div><div class="label-volume">Volume ${index} / ${volumes}</div></div>
    <div class="label-section"><div class="label-kicker">Cliente</div><div class="label-main">${esc(customer.name||'Cliente')}</div><div class="label-line">WhatsApp: ${esc(phone)}</div></div>
    <div class="label-section"><div class="label-kicker">Endereço de entrega</div>${lines.length?lines.map((line,i)=>`<div class="${i===0?'label-main':'label-line'}">${esc(line)}</div>`).join(''):'<div class="label-main">Endereço não informado</div>'}${address.reference?`<div class="label-line"><strong>Referência:</strong> ${esc(address.reference)}</div>`:''}</div>
    <div class="label-section label-payment"><div><div class="label-kicker">Pagamento</div><div class="label-main">${esc(payment(order.payment_method))}</div>${order.basket_name_snapshot?`<div class="label-line">Cesta: ${esc(order.basket_name_snapshot)}</div>`:''}</div><div><div class="label-kicker">Total</div><div class="label-total">${money(order.total)}</div></div></div>
    <div class="label-footer">Pedido em ${esc(date(order.created_at||order.confirmed_at))} · Delivery Dona Antônia</div>
  </section>`;
}

function printShippingLabels(order,volumes){
  ensureStyles();
  document.getElementById(ROOT_ID)?.remove();
  const root=document.createElement('div');
  root.id=ROOT_ID;
  root.innerHTML=Array.from({length:volumes},(_,offset)=>labelMarkup(order,offset+1,volumes)).join('');
  document.body.appendChild(root);
  let cleaned=false;
  const cleanup=()=>{if(cleaned)return;cleaned=true;root.remove();window.removeEventListener('afterprint',cleanup)};
  window.addEventListener('afterprint',cleanup,{once:true});
  requestAnimationFrame(()=>window.print());
  window.setTimeout(cleanup,60000);
}

function requestOrderLabelPrint(order){
  const volumes=askVolumeCount();
  if(volumes===null)return false;
  printShippingLabels(order,volumes);
  return true;
}

ensureStyles();

export {askVolumeCount,printShippingLabels,requestOrderLabelPrint};
