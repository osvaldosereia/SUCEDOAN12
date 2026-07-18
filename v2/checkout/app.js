import { APP_CONFIG } from '../shared/config.js';
import { loadCatalog, createProductIndex } from '../shared/catalog.js';
import { cartSummary } from '../shared/cart.js';
import { buildOrderDraft, readCheckoutDraft, saveCheckoutDraft } from '../shared/checkout.js';
import { buildDeliveryPreview, prepareOrderEnvelope, saveToOutbox } from '../shared/order-delivery.js';

const form=document.getElementById('checkout-form');
const summaryEl=document.getElementById('summary');
const totalEl=document.getElementById('total');
const minimumEl=document.getElementById('minimum');
const errorsEl=document.getElementById('errors');
const resultEl=document.getElementById('result');
const trocoField=document.getElementById('troco-field');
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));

function fillForm(draft){
  for(const [key,value] of Object.entries({...draft.cliente,...draft.entrega,observacoes:draft.observacoes,trocoPara:draft.pagamento.trocoPara})){
    const field=form.elements.namedItem(key);if(field)field.value=value||'';
  }
  const payment=form.querySelector(`[name="pagamento"][value="${draft.pagamento.tipo}"]`);if(payment)payment.checked=true;
  updateTroco();
}
function readForm(){
  const data=new FormData(form);
  return {cliente:{nome:data.get('nome'),telefone:data.get('telefone'),cpf:data.get('cpf'),email:data.get('email')},entrega:{cidade:data.get('cidade'),bairro:data.get('bairro'),logradouro:data.get('logradouro'),numero:data.get('numero'),complemento:data.get('complemento'),referencia:data.get('referencia'),agendamento:data.get('agendamento')},pagamento:{tipo:data.get('pagamento'),trocoPara:data.get('trocoPara')},observacoes:data.get('observacoes')};
}
function updateTroco(){trocoField.hidden=form.querySelector('[name="pagamento"]:checked')?.value!=='dinheiro';}
function renderSummary(summary){
  summaryEl.innerHTML=summary.rows.length?summary.rows.map(({product,quantity,subtotal})=>`<article><img src="${escapeHtml(product.imagem||'../../img/logoantonia5.png')}" alt=""><div><strong>${escapeHtml(product.nome)}</strong><span>${quantity} × ${money(subtotal/quantity)}</span></div><b>${money(subtotal)}</b></article>`).join(''):'<div class="empty">Sua compra está vazia.</div>';
  totalEl.textContent=money(summary.total);
  const missing=Math.max(0,APP_CONFIG.commerce.minimumOrder-summary.total);
  minimumEl.textContent=missing>0?`Faltam ${money(missing)} para o pedido mínimo.`:'Pedido mínimo atingido.';
  minimumEl.dataset.ok=missing<=0?'true':'false';
}

const draft=readCheckoutDraft();
fillForm(draft);
form.addEventListener('input',()=>saveCheckoutDraft(readForm()));
form.addEventListener('change',()=>{updateTroco();saveCheckoutDraft(readForm());});

try{
  const catalog=await loadCatalog();
  const productMap=createProductIndex(catalog.products);
  const summary=cartSummary(productMap);
  renderSummary(summary);
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const current=readForm();saveCheckoutDraft(current);
    const result=buildOrderDraft(current,summary);
    if(!result.valid){errorsEl.hidden=false;errorsEl.innerHTML=result.errors.map(error=>`<div>${escapeHtml(error)}</div>`).join('');resultEl.hidden=true;return;}
    const envelope=prepareOrderEnvelope(result.order);
    const outbox=saveToOutbox(envelope);
    const preview=buildDeliveryPreview(envelope);
    errorsEl.hidden=true;
    resultEl.hidden=false;
    resultEl.querySelector('pre').textContent=JSON.stringify({salvoNaFilaLocal:outbox.saved,duplicado:outbox.duplicate,preview},null,2);
    resultEl.scrollIntoView({behavior:'smooth',block:'start'});
  });
}catch(error){summaryEl.innerHTML=`<div class="errors">Não foi possível carregar o catálogo seguro: ${escapeHtml(error.message||error)}</div>`;form.querySelector('button[type="submit"]').disabled=true;}
