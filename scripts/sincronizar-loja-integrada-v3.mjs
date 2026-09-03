// Compatibilidade V3: mantém o worker robusto existente, mas converte a mídia em tempo de execução
// para o padrão oficial de 3 imagens: mockup 1 + mockup 2 + horizontal quadrada compactada.
const FIREBASE_HOST = 'cedar-chemist-310801-default-rtdb.firebaseio.com';
const LI_HOST = 'api.awsli.com.br';
const nativeFetch = globalThis.fetch.bind(globalThis);
const posted = new Set();

const text = v => String(v ?? '').trim();
function squareOf(p = {}) {
  return text(p.vitrine_horizontal_quadrada || p.vitrine_loja_integrada?.url || p.loja_integrada?.horizontal_quadrada || p.loja_integrada_horizontal_quadrada);
}
function adaptProduct(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return p;
  const square = squareOf(p);
  if (!square) return p;
  // Somente na memória: satisfaz o worker V2 sem recriar campos de recorte no Firebase.
  return { ...p, vitrine_recorte_esquerda:square, vitrine_recorte_direita:square };
}
function adaptFirebasePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const out = structuredClone(value);
  const li = out.loja_integrada;
  if (li && typeof li === 'object') {
    if (Array.isArray(li.synced_storefront_images)) li.synced_storefront_images = [...new Set(li.synced_storefront_images.map(text).filter(Boolean))].slice(0,3);
    if (Array.isArray(li.image_ids)) li.image_ids = li.image_ids.map(text).filter(Boolean).slice(0,3);
  }
  for (const key of ['vitrine_recorte_esquerda','vitrine_recorte_centro','vitrine_recorte_direita','vitrine_recortes']) delete out[key];
  return out;
}

function jsonResponse(data, original) {
  return new Response(JSON.stringify(data), {
    status:original.status,
    statusText:original.statusText,
    headers:{ 'Content-Type':'application/json; charset=utf-8' },
  });
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const method = String(init.method || (typeof input !== 'string' ? input.method : 'GET') || 'GET').toUpperCase();

  if (url.hostname === FIREBASE_HOST && /\/produtos\/[^/]+\.json$/.test(url.pathname) && method === 'GET') {
    const response = await nativeFetch(input, init);
    if (!response.ok) return response;
    const data = await response.clone().json().catch(() => null);
    return jsonResponse(adaptProduct(data), response);
  }

  if (url.hostname === FIREBASE_HOST && method === 'PATCH' && typeof init.body === 'string') {
    try {
      const body = adaptFirebasePayload(JSON.parse(init.body));
      return nativeFetch(input, { ...init, body:JSON.stringify(body) });
    } catch {}
  }

  if (url.hostname === LI_HOST && url.pathname.endsWith('/produto_imagem') && method === 'POST' && typeof init.body === 'string') {
    try {
      const body = JSON.parse(init.body);
      const key = `${text(body.produto)}|${text(body.imagem_url)}`;
      if (posted.has(key)) {
        console.log(`LI V3 · imagem duplicada suprimida: ${text(body.imagem_url)}`);
        return new Response('{}', { status:201, headers:{ 'Content-Type':'application/json' } });
      }
      posted.add(key);
    } catch {}
  }

  return nativeFetch(input, init);
};

console.log('CanecaFácil LI Sync V3 · compatibilidade 3 imagens ativada');
await import('./sincronizar-loja-integrada.mjs');
