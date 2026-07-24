import { number, productCode, productImage, productKey, productName, text } from '../core/utils.js';

function webhookUrl(config, channel) {
  if (channel === 'image') return text(config.makeImageWebhookUrl || config.makeAiWebhookUrl);
  if (channel === 'instagram-kit') return text(config.makeInstagramKitWebhookUrl);
  return text(config.makeTextWebhookUrl || config.makeAiWebhookUrl);
}

export async function callMake(config, channel, payload, { timeout = 120000 } = {}) {
  const url = webhookUrl(config, channel);
  if (!url) {
    const label = channel === 'image' ? 'IA de imagens' : channel === 'instagram-kit' ? 'Instagram de kits' : 'IA de textos';
    throw new Error(`Configure o webhook ${label} nas Configurações da V2.`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const body = new URLSearchParams();
  body.set('payload', JSON.stringify(payload));
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body,
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Make retornou ${response.status}${raw ? `: ${raw.slice(0, 260)}` : ''}`);
    if (!raw.trim()) return { ok: true };
    try {
      return JSON.parse(raw);
    } catch {
      return { ok: true, texto: raw };
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('A automação do Make excedeu o tempo de resposta. Confira a execução no cenário.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function unwrapMakeResult(result) {
  if (typeof result === 'string') {
    try { return unwrapMakeResult(JSON.parse(result)); } catch { return { texto: result }; }
  }
  if (!result || typeof result !== 'object') return {};
  if (typeof result.texto === 'string') {
    try { return { ...result, ...unwrapMakeResult(JSON.parse(result.texto)) }; } catch {}
  }
  if (result.choices?.[0]?.message?.content) return unwrapMakeResult(result.choices[0].message.content);
  if (result.output?.[0]?.content?.[0]?.text) return unwrapMakeResult(result.output[0].content[0].text);
  if (result.body && typeof result.body === 'object') return { ...result, ...result.body };
  if (result.data && !Array.isArray(result.data) && typeof result.data === 'object') return { ...result, ...result.data };
  return result;
}

export function compactProductForMake(product) {
  return {
    firebaseKey: productKey(product),
    id: text(product.id || productKey(product)),
    codigo: productCode(product),
    gtin: text(product.gtin || product.ean),
    nome: productName(product),
    descricao: text(product.descricao),
    descricao_curta: text(product.descricao_curta),
    categoria: text(product.categoria),
    subcategoria: text(product.subcategoria),
    subsubcategoria: text(product.subsubcategoria),
    marca: text(product.marca),
    fornecedor: text(product.fornecedor),
    embalagem: text(product.embalagem),
    ncm: text(product.ncm),
    tags: Array.isArray(product.tags) ? product.tags : text(product.tags).split(/[,;|]/).map(item => item.trim()).filter(Boolean),
    preco: number(product.preco),
    preco_custo: number(product.preco_custo),
    estoque: number(product.estoque),
    validade: text(product.validade),
    imagem_url: productImage(product),
  };
}

export function compactKitForMake(kit, products = []) {
  const byCode = new Map();
  products.forEach(product => {
    [productCode(product), productKey(product), text(product.gtin || product.ean)].filter(Boolean).forEach(code => byCode.set(code, product));
  });
  const items = Array.isArray(kit?.produtos) ? kit.produtos : [];
  const normalizedItems = items.map((item, index) => {
    const code = text(item?.codigo || item?.code || item);
    const product = byCode.get(code);
    return {
      indice: index + 1,
      codigo: code,
      qtd: Math.max(1, Math.floor(number(item?.qtd || item?.quantidade || 1))),
      nome: product ? productName(product) : code,
      marca: text(product?.marca),
      embalagem: text(product?.embalagem),
      descricao: text(product?.descricao),
      preco: number(product?.preco),
      estoque: number(product?.estoque),
      imagem_url: productImage(product || {}),
      substitutos: Array.isArray(item?.substitutos) ? item.substitutos : [],
    };
  });
  return {
    id: text(kit?.id),
    codigo: text(kit?.codigo),
    nome: text(kit?.nome),
    descricao: text(kit?.descricao),
    preco: number(kit?.preco),
    imagem: text(kit?.imagem),
    data_inicio: text(kit?.data_inicio),
    data_fim: text(kit?.data_fim),
    limite_kits: number(kit?.limite_kits),
    produtos: normalizedItems,
    referencias_imagens: normalizedItems.map(item => item.imagem_url).filter(Boolean),
  };
}

export function assertMakeProductIdentity(product, result) {
  const data = unwrapMakeResult(result);
  const expected = [productKey(product), productCode(product)].map(value => text(value).toUpperCase()).filter(Boolean);
  const returned = [data.firebaseKey, data.key, data.id_produto, data.produto_id, data.codigo, data.codigo_produto, data.sku]
    .map(value => text(value).toUpperCase()).filter(Boolean);
  if (expected.length && returned.length && !returned.some(value => expected.includes(value))) {
    throw new Error('O Make retornou dados de outro produto. Confira o cenário antes de aplicar a resposta.');
  }
  const expectedGtin = text(product.gtin || product.ean);
  const returnedGtins = [data.gtin, data.ean, data.codigo_barras, data.barcode].map(text).filter(Boolean);
  if (expectedGtin && returnedGtins.length && !returnedGtins.includes(expectedGtin)) {
    throw new Error('O Make retornou EAN/GTIN diferente do produto aberto.');
  }
  return data;
}

export function extractMakeTags(result) {
  const data = unwrapMakeResult(result);
  const source = data.tags_sugeridas ?? data.tags ?? data.tag ?? [];
  if (Array.isArray(source)) return source.map(text).filter(Boolean);
  return text(source).split(/[,;|]/).map(item => item.trim()).filter(Boolean);
}

export function extractMakeImage(result) {
  const data = unwrapMakeResult(result);
  const direct = data.imagem_principal || data.imagem || data.imagem_url || data.image || data.image_url || data.url_imagem || data.url || data.src;
  if (text(direct)) return text(direct);
  const first = Array.isArray(data.imagens) ? data.imagens[0] : Array.isArray(data.data) ? data.data[0] : null;
  if (typeof first === 'string') return text(first);
  if (first?.url || first?.imagem || first?.image_url) return text(first.url || first.imagem || first.image_url);
  const base64 = data.b64_json || data.base64 || first?.b64_json;
  return text(base64) ? `data:image/png;base64,${text(base64)}` : '';
}
