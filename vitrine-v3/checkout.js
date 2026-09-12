import {CONFIG} from './config.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export function normalizePhone(value){let d=String(value||'').replace(/\D/g,'');if(d.length===10||d.length===11)d=`55${d}`;return d.startsWith('55')&&(d.length===12||d.length===13)?`+${d}`:''}

function renderCheckoutItem(item){
  const p=item?.product||{};
  return `<div class="checkout-item"><div class="checkout-item-photo">${p.image_url?`<img src="${esc(p.image_url)}" alt="" loading="lazy" decoding="async">`:'<span aria-hidden="true">□</span>'}</div><span>${esc(item.quantity)}x ${esc(p.name||'Produto')}</span></div>`;
}

export function renderCheckout({basket=null,basketItems=[],extras={},total=0}={}){
  const basketRows=basketItems.filter(item=>Number(item.quantity||0)>0).map(renderCheckoutItem).join('');
  const extraRows=Object.values(extras||{}).filter(item=>Number(item.quantity||0)>0).map(renderCheckoutItem).join('');
  const basketBlock=basket?`<section class="checkout-group"><h3>${esc(basket.name)}</h3><p>Produtos da cesta</p>${basketRows}</section>`:'';
  const extraBlock=extraRows?`<section class="checkout-group"><h3>Produtos adicionados</h3>${extraRows}</section>`:'';
  return `<section class="checkout"><button class="text-button" type="button" data-back-shopping>← Voltar à compra</button><h1>Finalizar pedido</h1><section class="checkout-summary"><h2>Resumo do pedido</h2>${basketBlock}${extraBlock}<div class="checkout-total"><span>Total</span><strong>${money(total)}</strong></div></section><form id="checkoutForm"><label for="checkoutPhone"><span>Seu telefone com DDD</span></label><input id="checkoutPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="15" aria-describedby="checkoutPhoneHelp" placeholder="(65) 99999-9999" required><small id="checkoutPhoneHelp" class="checkout-phone-help">Usamos seu telefone para localizar seu cadastro e continuar o atendimento no WhatsApp.</small><button id="checkoutSubmit" class="primary-button full" type="submit">Confirmar pedido</button></form></section>`;
}
export function renderSuccess(order){
  const message=String(order?.message||`Olá! Meu pedido é ${order?.number||''}.`).trim();
  const href=`https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
  return `<section class="success-panel"><h1>Pedido recebido</h1><p>Pedido <strong>${esc(order?.number||'')}</strong> salvo. Agora continue o atendimento no WhatsApp.</p><a class="primary-button link-button" href="${href}" target="_blank" rel="noopener">Continuar no WhatsApp</a><button class="secondary-button" type="button" data-new-order>Novo pedido</button></section>`;
}
