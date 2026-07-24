import { CONFIG } from './config.js';
import {
  cleanCpf, escapeHtml, fmt, formatCep, formatCpf, formatPhone,
  readStorage, writeStorage
} from './core.js';
import { calculateCartPricing } from './commerce.js';
import {
  buildOrderPayload, buildWhatsAppMessage, enqueueOrder, lookupClientByCpf,
  openWhatsApp, processOrderQueue, validateCheckoutData
} from './integrations.js';

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12);
}

function holidayKeys(year) {
  const fixed = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']
    .map(monthDay => `${year}-${monthDay}`);
  return new Set([...fixed, dateValue(addDays(easterSunday(year), -2))]);
}

export function isNationalHoliday(date) {
  return holidayKeys(date.getFullYear()).has(dateValue(date));
}

export function deliveryDates(nowOverride = null) {
  const now = nowOverride || new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Cuiaba' }));
  const dates = [];
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  while (dates.length < 7) {
    const sameDay = cursor.toDateString() === now.toDateString();
    const allowedToday = !sameDay || now.getHours() < 10;
    const sunday = cursor.getDay() === 0;
    if (allowedToday && !sunday && !isNationalHoliday(cursor)) dates.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function dateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateLabel(date, index) {
  const weekday = date.toLocaleDateString('pt-BR', { weekday: 'long' });
  const dayMonth = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return index === 0 ? `Próxima entrega · ${weekday}` : `${weekday} · ${dayMonth}`;
}

function paymentOptions(selected) {
  const options = [
    ['DINHEIRO', 'Dinheiro'], ['PIX', 'Pix'], ['CARTAO_DE_DEBITO', 'Cartão de débito'],
    ['CARTAO_DE_CREDITO', 'Cartão de crédito'], ['VALE_ALIMENTACAO', 'Vale-alimentação'], ['VALE_REFEICAO', 'Vale-refeição']
  ];
  return options.map(([value, label]) => `<label class="payment-option"><input type="radio" name="payment" value="${value}" ${selected === value ? 'checked' : ''}><span>${label}</span></label>`).join('');
}

function totalsHtml(pricing) {
  return `<div class="checkout-totals"><div><span>Valor normal</span><strong>${fmt(pricing.subtotalBefore)}</strong></div>${pricing.couponDiscount > 0 ? `<div class="discount"><span>Desconto do cupom</span><strong>− ${fmt(pricing.couponDiscount)}</strong></div>` : ''}${pricing.kitDiscount > 0 ? `<div class="discount"><span>Desconto do kit</span><strong>− ${fmt(pricing.kitDiscount)}</strong></div>` : ''}${pricing.expiryBulkDiscount > 0 ? `<div class="discount"><span>Desconto por validade</span><strong>− ${fmt(pricing.expiryBulkDiscount)}</strong></div>` : ''}${pricing.wholesaleDiscount > 0 ? `<div class="discount"><span>Desconto de atacado</span><strong>− ${fmt(pricing.wholesaleDiscount)}</strong></div>` : ''}<div class="total"><span>Total final</span><strong>${fmt(pricing.total)}</strong></div></div>`;
}

export function createCheckout({ store, cart, events, ui, personalization }) {
  const drawer = document.getElementById('checkout-drawer');
  const content = document.getElementById('checkout-content');

  function savedClient() {
    return readStorage(CONFIG.STORAGE.CHECKOUT_CLIENT, {}) || {};
  }

  function saveClientFromForm() {
    const form = readForm();
    writeStorage(CONFIG.STORAGE.CHECKOUT_CLIENT, { ...form, savedAt: Date.now() });
  }

  function readForm() {
    const value = id => document.getElementById(id)?.value?.trim() || '';
    return {
      name: value('checkout-name'), cpf: value('checkout-cpf'), phone: value('checkout-phone'), email: value('checkout-email'),
      cep: value('checkout-cep'), city: value('checkout-city'), district: value('checkout-district'), street: value('checkout-street'),
      block: value('checkout-block'), number: value('checkout-number'), reference: value('checkout-reference'),
      payment: document.querySelector('input[name="payment"]:checked')?.value || 'DINHEIRO',
      deliveryDate: document.querySelector('input[name="deliveryDate"]:checked')?.value || ''
    };
  }

  function render() {
    const state = store.getState();
    const pricing = calculateCartPricing(state);
    const items = pricing.items.filter(item => !item.product.isFee);
    const client = savedClient();
    const lookupReady = ['new', 'existing'].includes(state.customerLookupStatus);
    const activeCoupon = state.coupons.find(coupon => String(coupon.codigo).toUpperCase() === state.activeCouponCode);
    content.innerHTML = `<div id="checkout-errors" class="checkout-errors" hidden></div>
      <section class="checkout-section"><h2>1. Revise sua compra</h2>${items.length ? `<div class="checkout-items">${items.map(item => `<div class="checkout-item"><img src="${escapeHtml(item.product.img)}" alt="${escapeHtml(item.product.name)}"><div><strong>${escapeHtml(item.product.name)}</strong><small>${fmt(item.product.price)} cada</small></div><div class="qty-control"><button data-action="dec" data-id="${escapeHtml(item.id)}">−</button><span>${item.qty}</span><button data-action="inc" data-id="${escapeHtml(item.id)}">+</button></div></div>`).join('')}</div>` : '<p>Sua compra está vazia.</p>'}<button class="text-button danger" data-action="clear-cart">Limpar compra</button></section>
      <section class="checkout-section"><h2>2. Identifique seu cadastro</h2><p>Digite seu CPF para buscar os dados salvos no atendimento.</p><div class="lookup-row"><input id="checkout-cpf" class="field" inputmode="numeric" maxlength="14" placeholder="CPF" value="${escapeHtml(formatCpf(state.customerLookupCpf || client.cpf || ''))}"><button class="secondary-button" data-action="lookup-client">Continuar</button></div><div id="lookup-status" class="lookup-status"></div></section>
      ${lookupReady ? `<section class="checkout-section"><h2>3. Entrega e dados</h2><div class="delivery-options">${deliveryDates().map((date, index) => `<label><input type="radio" name="deliveryDate" value="${dateValue(date)}" ${index === 0 ? 'checked' : ''}><span>${escapeHtml(dateLabel(date, index))}</span></label>`).join('')}</div><div class="form-grid"><label>Nome completo<input id="checkout-name" class="field" value="${escapeHtml(client.name || '')}"></label><label>WhatsApp<input id="checkout-phone" class="field" inputmode="tel" value="${escapeHtml(formatPhone(client.phone || ''))}"></label><label>E-mail<input id="checkout-email" class="field" type="email" value="${escapeHtml(client.email || '')}"></label><label>CEP<input id="checkout-cep" class="field" inputmode="numeric" value="${escapeHtml(formatCep(client.cep || ''))}"></label><label>Cidade<select id="checkout-city" class="field"><option value="">Selecione</option><option ${client.city === 'Cuiabá' ? 'selected' : ''}>Cuiabá</option><option ${client.city === 'Várzea Grande' ? 'selected' : ''}>Várzea Grande</option></select></label><label>Bairro<input id="checkout-district" class="field" value="${escapeHtml(client.district || '')}"></label><label class="wide">Rua ou avenida<input id="checkout-street" class="field" value="${escapeHtml(client.street || '')}"></label><label>Quadra<input id="checkout-block" class="field" value="${escapeHtml(client.block || '')}"></label><label>Número<input id="checkout-number" class="field" value="${escapeHtml(client.number || '')}"></label><label class="wide">Referência<input id="checkout-reference" class="field" value=""></label></div><fieldset><legend>Forma de pagamento</legend><div class="payment-options">${paymentOptions(state.checkoutPayment || 'DINHEIRO')}</div></fieldset></section>
      <section class="checkout-section"><h2>4. Cupom</h2>${activeCoupon ? `<div class="active-coupon"><span><strong>${escapeHtml(activeCoupon.codigo)}</strong><small>Cupom aplicado</small></span><button class="text-button" data-action="remove-coupon">Remover</button></div>` : `<div class="lookup-row"><input id="coupon-code" class="field" placeholder="Digite o código"><button class="secondary-button" data-action="apply-coupon">Aplicar</button></div>`}</section>
      <section class="checkout-section"><h2>5. Total</h2>${totalsHtml(pricing)}${pricing.subtotalBefore < CONFIG.MIN_ORDER ? `<div class="minimum-order">Faltam <strong>${fmt(CONFIG.MIN_ORDER - pricing.subtotalBefore)}</strong> para atingir o pedido mínimo.</div>` : ''}<button id="send-order" class="send-order" data-action="send-order" ${items.length && pricing.subtotalBefore >= CONFIG.MIN_ORDER ? '' : 'disabled'}>Pedir no WhatsApp</button></section>` : '<section class="checkout-section"><p>Depois da consulta do CPF, os campos de entrega serão exibidos.</p></section>'}`;
    ui.bindImageFallbacks(content);
  }

  function open() {
    render();
    ui.openDrawer(drawer);
  }

  function fillClient(raw) {
    const client = raw?.data && !raw.nome ? raw.data : raw || {};
    const address = client.endereco?.geral || client.endereco || {};
    const merged = {
      ...savedClient(),
      name: client.nome || '',
      cpf: client.numeroDocumento || client.cpf || '',
      phone: client.celular || client.telefone || '',
      email: client.email || '',
      cep: address.cep || '',
      city: address.municipio || address.cidade || '',
      district: address.bairro || '',
      street: address.endereco || address.rua || '',
      number: address.numero || '',
      block: ''
    };
    writeStorage(CONFIG.STORAGE.CHECKOUT_CLIENT, merged);
  }

  async function lookup(button) {
    const cpf = cleanCpf(document.getElementById('checkout-cpf')?.value || '');
    const status = document.getElementById('lookup-status');
    if (cpf.length !== 11) { status.textContent = 'Digite os 11 números do CPF.'; status.className = 'lookup-status error'; return; }
    button.disabled = true;
    status.textContent = 'Consultando cadastro...';
    status.className = 'lookup-status warning';
    try {
      const result = await lookupClientByCpf(cpf);
      if (!result.encontrado || !result.cliente) {
        store.mutate(state => { state.customerLookupStatus = 'new'; state.customerLookupCpf = cpf; }, 'checkout:new-client');
        writeStorage(CONFIG.STORAGE.CHECKOUT_CLIENT, { ...savedClient(), cpf });
      } else {
        store.mutate(state => { state.customerLookupStatus = 'existing'; state.customerLookupCpf = cpf; }, 'checkout:existing-client');
        fillClient(result.cliente);
      }
      render();
      document.getElementById('lookup-status').textContent = result.encontrado ? 'Cadastro encontrado. Confira os dados.' : 'CPF não cadastrado. Complete os dados.';
      document.getElementById('lookup-status').className = `lookup-status ${result.encontrado ? 'success' : 'warning'}`;
    } catch (error) {
      status.textContent = error.name === 'AbortError' ? 'A consulta demorou demais. Tente novamente.' : error.message;
      status.className = 'lookup-status error';
    } finally {
      button.disabled = false;
    }
  }

  function showErrors(errors) {
    const box = document.getElementById('checkout-errors');
    box.hidden = false;
    box.innerHTML = `<strong>Revise os seguintes campos:</strong><ul>${errors.map(error => `<li>${escapeHtml(error.label)}</li>`).join('')}</ul>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function send(button) {
    const state = store.getState();
    const form = readForm();
    const validation = validateCheckoutData(form, state);
    if (!validation.valid) { showErrors(validation.errors); return; }
    saveClientFromForm();
    button.disabled = true;
    button.textContent = 'Preparando pedido...';
    try {
      const makePayload = buildOrderPayload(state, form);
      const message = buildWhatsAppMessage(makePayload, validation.pricing, state);
      enqueueOrder(makePayload);
      openWhatsApp(message);
      events.emit('order:opened-whatsapp', { order: makePayload, items: validation.pricing.items.filter(item => !item.product.isFee) });
      ui.closeDrawers();
      ui.showToast('Pedido pronto no WhatsApp.');
      setTimeout(() => processOrderQueue(), 80);
    } finally {
      button.disabled = false;
      button.textContent = 'Pedir no WhatsApp';
    }
  }

  function applyCoupon() {
    const result = cart.activateCoupon(document.getElementById('coupon-code')?.value || '');
    ui.showToast(result.ok ? `Cupom ${result.coupon.codigo} ativado.` : result.message);
    render();
  }

  function handleInput(event) {
    const target = event.target;
    if (!target?.id?.startsWith('checkout-')) return;
    if (target.id === 'checkout-cpf') target.value = formatCpf(target.value);
    if (target.id === 'checkout-phone') target.value = formatPhone(target.value);
    if (target.id === 'checkout-cep') target.value = formatCep(target.value);
    if (target.name === 'payment') store.mutate(state => { state.checkoutPayment = target.value; }, 'checkout:payment');
    saveClientFromForm();
  }

  async function handleAction(action, button) {
    if (action === 'lookup-client') return lookup(button);
    if (action === 'send-order') return send(button);
    if (action === 'apply-coupon') return applyCoupon();
    if (action === 'remove-coupon') { cart.removeCoupon(); render(); ui.showToast('Cupom removido.'); }
  }

  window.addEventListener('online', () => setTimeout(processOrderQueue, 250));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) processOrderQueue(); });
  setInterval(() => { if (!document.hidden) processOrderQueue(); }, 60000);

  return { open, render, handleAction, handleInput };
}
