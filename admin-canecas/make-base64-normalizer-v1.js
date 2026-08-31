const BUILD = '20260830-admin-canecas-make-base64-normalizer-v1';
const MAKE_WEBHOOK = window.__CANECAS_ADMIN_CONFIG__?.makeWebhook || window.__CANECAS_ADMIN_CONFIG__?.mugGeneratorWebhook || '';
const underlyingFetch = window.fetch.bind(window);

function rawBase64(value) {
  let out = String(value || '').trim();
  const marker = 'base64,';
  const at = out.toLowerCase().indexOf(marker);
  if (at >= 0) out = out.slice(at + marker.length);
  return out.replace(/\s+/g, '');
}

function validBase64(value) {
  const v = rawBase64(value);
  if (!v || v.length < 32 || v.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(v);
}

window.fetch = async function cfMakeBase64Normalizer(input, init = {}) {
  if (!MAKE_WEBHOOK || String(input) !== MAKE_WEBHOOK || typeof init?.body !== 'string') {
    return underlyingFetch(input, init);
  }

  let wrapper;
  let payload;
  try {
    wrapper = JSON.parse(init.body);
    payload = wrapper && typeof wrapper.payload === 'string' ? JSON.parse(wrapper.payload) : null;
  } catch {
    return underlyingFetch(input, init);
  }

  if (payload?.action !== 'save_mug_storefront_crops') return underlyingFetch(input, init);

  for (const field of ['crop_left_base64', 'crop_center_base64', 'crop_right_base64']) {
    payload[field] = rawBase64(payload[field]);
    if (!validBase64(payload[field])) {
      throw new Error(`Recorte inválido antes de enviar ao Make: ${field}. O envio foi bloqueado para não gravar arquivo corrompido.`);
    }
  }

  payload.base64_transport = 'raw';
  payload.base64_normalizer = BUILD;
  wrapper.payload = JSON.stringify(payload);
  return underlyingFetch(input, { ...init, body: JSON.stringify(wrapper) });
};

document.documentElement.dataset.cfMakeBase64Normalizer = BUILD;
export { BUILD, rawBase64, validBase64 };
