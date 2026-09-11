const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export function normalizePhone(value){
  const digits=String(value||'').replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'');
  if(![10,11].includes(digits.length))throw new Error('Informe um telefone com DDD.');
  return digits;
}

export function whatsappLink(message,number='5565998150975'){
  return `https://wa.me/${number}?text=${encodeURIComponent(String(message||''))}`;
}

export function renderCheckout(summary='Seu pedido será salvo antes de abrir o WhatsApp.'){
  return `<section class="checkout-shell"><button class="back-link" type="button" data-open-cart>← Voltar à compra</button><div class="checkout-card"><span class="eyebrow">Finalizar</span><h1>Seu telefone</h1><p>${esc(summary)}</p><form id="checkoutForm"><label for="checkoutPhone">WhatsApp com DDD</label><input id="checkoutPhone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="(65) 99999-9999" maxlength="20" required><small>Não pedimos senha nem cadastro para enviar o pedido.</small><button id="checkoutSubmit" class="button primary wide" type="submit">Salvar pedido</button></form></div></section>`;
}

export function renderSuccess(order){
  const link=whatsappLink(order?.message||'');
  return `<section class="checkout-shell success-shell"><div class="checkout-card success-card"><div class="success-icon">✓</div><span class="eyebrow">Pedido salvo</span><h1>${esc(order?.number||'Pedido')}</h1><p>Seu pedido já foi registrado. Agora envie a mensagem para a Dona Antônia confirmar entrega e pagamento.</p><div class="success-total"><span>Total</span><strong>${money(order?.total||0)}</strong></div><a class="button whatsapp wide" href="${esc(link)}" target="_blank" rel="noopener">Enviar pedido no WhatsApp</a><button class="button secondary wide" type="button" data-new-order>Fazer outro pedido</button></div></section>`;
}
