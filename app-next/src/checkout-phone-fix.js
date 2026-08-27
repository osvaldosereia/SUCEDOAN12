import { CONFIG } from './config.js?v=20260727-5';

const CLIENT_STORAGE_KEY = `${CONFIG.STORAGE.PREFIX}${CONFIG.STORAGE.CHECKOUT_CLIENT}`;
const EMPTY_CLIENT_FIELDS = [
  'checkout-name',
  'checkout-phone',
  'checkout-email',
  'checkout-cep',
  'checkout-city',
  'checkout-district',
  'checkout-street',
  'checkout-block',
  'checkout-number',
  'checkout-reference'
];

let lastClearedCpf = '';
let resetScheduled = false;

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function cleanPhoneForTyping(value) {
  let phone = digitsOnly(value).slice(0, 13);
  if ((phone.length === 12 || phone.length === 13) && phone.startsWith('55')) {
    phone = phone.slice(2);
  }
  if (phone.length === 12 && phone.startsWith('0')) {
    phone = phone.slice(1);
  }
  return phone.slice(0, 11);
}

function formatPhoneForTyping(value) {
  const phone = cleanPhoneForTyping(value);
  if (phone.length <= 2) return phone;
  if (phone.length <= 6) return `(${phone.slice(0, 2)}) ${phone.slice(2)}`;
  if (phone.length <= 10) return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`;
  return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`;
}

function isRepeatedPhone(value) {
  const phone = cleanPhoneForTyping(value);
  return phone.length === 11 && /^(\d)\1+$/.test(phone);
}

function isValidMobilePhone(value) {
  const phone = cleanPhoneForTyping(value);
  return /^[1-9]{2}9\d{8}$/.test(phone) && !isRepeatedPhone(phone);
}

function readClient() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CLIENT_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeClient(client) {
  try {
    localStorage.setItem(CLIENT_STORAGE_KEY, JSON.stringify({ ...client, savedAt: Date.now() }));
  } catch {}
}

function savePhone(value) {
  writeClient({ ...readClient(), phone: cleanPhoneForTyping(value) });
}

function currentPayment() {
  return document.querySelector('input[name="payment"]:checked')?.value || readClient().payment || 'DINHEIRO';
}

function currentDeliveryDate() {
  return document.querySelector('input[name="deliveryDate"]:checked')?.value || readClient().deliveryDate || '';
}

function clearNewClientFields(cpf) {
  for (const id of EMPTY_CLIENT_FIELDS) {
    const field = document.getElementById(id);
    if (!field) continue;
    field.value = '';
  }

  writeClient({
    cpf,
    phone: '',
    payment: currentPayment(),
    deliveryDate: currentDeliveryDate()
  });
}

function clearRepeatedPhoneIfNeeded() {
  const phoneInput = document.getElementById('checkout-phone');
  if (!phoneInput) return;
  phoneInput.name = 'phone';
  phoneInput.autocomplete = 'tel';
  phoneInput.maxLength = 15;
  if (!isRepeatedPhone(phoneInput.value)) return;
  phoneInput.value = '';
  savePhone('');
}

function applyNewClientReset() {
  const status = document.getElementById('lookup-status');
  if (!status || !status.textContent?.includes('CPF ainda não cadastrado')) {
    clearRepeatedPhoneIfNeeded();
    return;
  }

  const cpf = digitsOnly(document.getElementById('checkout-cpf')?.value).slice(0, 11);
  if (cpf.length !== 11 || cpf === lastClearedCpf) {
    clearRepeatedPhoneIfNeeded();
    return;
  }

  lastClearedCpf = cpf;
  clearNewClientFields(cpf);
}

function scheduleClientReset() {
  if (resetScheduled) return;
  resetScheduled = true;
  requestAnimationFrame(() => {
    resetScheduled = false;
    applyNewClientReset();
  });
}

function showPhoneError(input) {
  const box = document.getElementById('checkout-errors');
  if (box) {
    box.hidden = false;
    box.innerHTML = '<strong>Revise os seguintes campos:</strong><ul><li>WhatsApp com DDD e 11 números válidos</li></ul>';
  }
  input.setAttribute('aria-invalid', 'true');
  if (isRepeatedPhone(input.value)) {
    input.value = '';
    savePhone('');
  }
  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => input.focus(), 220);
}

document.addEventListener('input', event => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.id !== 'checkout-phone') return;

  event.stopImmediatePropagation();
  event.stopPropagation();

  input.removeAttribute('aria-invalid');
  const cleaned = cleanPhoneForTyping(input.value);
  input.value = isRepeatedPhone(cleaned) ? '' : formatPhoneForTyping(cleaned);
  savePhone(input.value);
}, true);

document.addEventListener('click', event => {
  const button = event.target instanceof Element ? event.target.closest('[data-action="send-order"]') : null;
  if (!button) return;

  const input = document.getElementById('checkout-phone');
  if (!input || isValidMobilePhone(input.value)) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  event.stopPropagation();
  showPhoneError(input);
}, true);

const checkoutContent = document.getElementById('checkout-content');
if (checkoutContent) {
  const observer = new MutationObserver(scheduleClientReset);
  observer.observe(checkoutContent, { childList: true, subtree: true });
}

applyNewClientReset();
