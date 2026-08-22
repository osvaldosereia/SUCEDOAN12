import './mug-studio-gallery.js?admin_build=20260821-mug-studio-gallery-v1';
import './mug-studio-v5-controller.js?admin_build=20260821-canecas-v5-controller';

const BUILD = '20260821-canecas-openai-native-v4';
const INSTALLED = '__daMugNativeOpenAiBridgeV4';

function text(value) {
  return String(value ?? '').trim();
}

async function blobToDataUrl(blob) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível preparar a imagem para o Make.'));
    reader.readAsDataURL(blob);
  });
}

async function urlToDataUrl(fetchFn, url) {
  const response = await fetchFn(url, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8' },
  });
  if (!response.ok) throw new Error(`Não foi possível baixar a imagem-base (${response.status}).`);
  return blobToDataUrl(await response.blob());
}

function parseMugPayload(init = {}) {
  const method = String(init.method || 'GET').toUpperCase();
  if (method !== 'POST' || typeof init.body !== 'string') return null;
  try {
    const outer = JSON.parse(init.body);
    if (typeof outer?.payload !== 'string') return null;
    const payload = JSON.parse(outer.payload);
    if (!['generate_mug_art', 'generate_mug_mockup'].includes(text(payload?.action))) return null;
    return { outer, payload };
  } catch {
    return null;
  }
}

function install() {
  if (window[INSTALLED]) return;
  window[INSTALLED] = BUILD;
  const baseFetch = window.fetch.bind(window);

  window.fetch = async function mugNativeOpenAiBridge(input, init = {}) {
    const parsed = parseMugPayload(init);
    if (!parsed || text(parsed.payload.image_base64)) return baseFetch(input, init);

    const sourceUrl = parsed.payload.action === 'generate_mug_art'
      ? text(parsed.payload.reference_image_url)
      : text(parsed.payload.art_url);
    if (!sourceUrl) return baseFetch(input, init);

    try {
      const imageBase64 = await urlToDataUrl(baseFetch, sourceUrl);
      const nextPayload = { ...parsed.payload, image_base64: imageBase64 };
      const nextOuter = { ...parsed.outer, payload: JSON.stringify(nextPayload) };
      return baseFetch(input, { ...init, body: JSON.stringify(nextOuter) });
    } catch (error) {
      console.error('Estúdio de Canecas: falha ao anexar imagem Base64 ao webhook Make.', error);
      throw error;
    }
  };
}

install();

export { install };