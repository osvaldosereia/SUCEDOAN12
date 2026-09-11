import {CONFIG} from './config.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function normalizePhone(value){let d=String(value||'').replace(/\D/g,'');if(d.length===10||d.length===11)d=`55${d}`;return d.startsWith('55')&&(d.length===12||d.length===13)?`+${d}`:''}
export function renderCheckout(summary=''){
  return `<section class="checkout"><button class="text-button" type="button" data-home>← Voltar</button><h1>Finalizar pedido</h1><p>${esc(summary)}</p><form id="checkoutForm"><label><span>Seu telefone com DDD</span><input id="checkoutPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(65) 99999-9999" required></label><button id="checkoutSubmit" class="primary-button full" type="submit">Enviar pedido</button></form></section>`;
}
export function renderSuccess(order){
  const message=String(order?.message||`Olá! Meu pedido é ${order?.number||''}.`).trim();
  const href=`https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
  return `<section class="success-panel"><h1>Pedido recebido</h1><p>Pedido <strong>${esc(order?.number||'')}</strong> salvo. Agora continue o atendimento no WhatsApp.</p><a class="primary-button link-button" href="${href}" target="_blank" rel="noopener">Continuar no WhatsApp</a><button class="secondary-button" type="button" data-new-order>Novo pedido</button></section>`;
}
