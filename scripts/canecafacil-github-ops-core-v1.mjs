export const text = value => String(value ?? '').trim();
export const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const nowIso = () => new Date().toISOString();

export function resourceId(item = {}, type = '') {
  const direct = text(item.id);
  if (direct) return direct;
  const rx = new RegExp(`/${type}/(\\d+)`, 'i');
  return text(item.resource_uri).match(rx)?.[1] || '';
}

export function normalizeCategory(item = {}) {
  return { id: resourceId(item, 'categoria'), nome: text(item.nome), resource_uri: text(item.resource_uri), pai: text(item.pai), ativo: item.ativo !== false };
}
export function normalizeBrand(item = {}) {
  return { id: resourceId(item, 'marca'), nome: text(item.nome), resource_uri: text(item.resource_uri), ativo: item.ativo !== false };
}

export function exactSku(objects = [], skuValue = '') {
  const sku = norm(skuValue);
  if (!sku) return null;
  const exact = (Array.isArray(objects) ? objects : []).filter(item => norm(item?.sku) === sku);
  if (exact.length > 1) {
    const error = new Error(`SKU ${text(skuValue)} retornou ${exact.length} produtos.`);
    error.code = 'DUPLICATE_SKU';
    throw error;
  }
  return exact[0] || null;
}

export function retryableStatus(status) {
  return [408, 425, 429, 500, 502, 503, 504].includes(Number(status || 0));
}

export function readyEmailHtml({ creationCode = '', artUrl = '' } = {}) {
  const code = encodeURIComponent(text(creationCode));
  const image = artUrl
    ? `<div style="background:#f5f5f3;border-radius:14px;padding:14px;margin:18px 0;text-align:center"><img src="${escapeHtml(artUrl)}" alt="Sua arte personalizada" style="max-width:100%;height:auto;border-radius:10px"></div>`
    : '';
  // Contrato visual do módulo 115 do Make V15 preservado para que o cutover não altere a comunicação com o cliente.
  return `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#222"><h2 style="margin-bottom:8px">Sua arte ficou pronta ✨</h2><p>Preparamos a personalização que você pediu na Caneca Fácil.</p>${image}<p>Confira a arte antes de comprar. O produto só será enviado ao carrinho depois da sua aprovação.</p><p style="text-align:center;margin:24px 0"><a href="https://www.canecafacil.com.br/?cf_arte=${code}" style="display:inline-block;background:#f47621;color:#fff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:9px">VER MINHA CANECA</a></p><p style="font-size:12px;color:#777">Este e-mail foi enviado porque você solicitou esta personalização. Ele não inscreve você em promoções.</p></div>`;
}

export function buildReadyEmail({ from, to, creationCode, artUrl } = {}) {
  const recipient = text(to);
  if (!recipient) throw new Error('E-mail do cliente ausente.');
  return {
    from: text(from) || 'Caneca Fácil <arte@canecafacil.com.br>',
    to: [recipient],
    subject: 'Sua caneca personalizada está pronta ☕',
    html: readyEmailHtml({ creationCode, artUrl }),
  };
}

export function catalogMaps(categories = [], brands = []) {
  const categorias = {};
  const categorias_lista = {};
  for (const item of categories.map(normalizeCategory).filter(item => item.nome && item.resource_uri)) {
    categorias[item.nome] = item.resource_uri;
    categorias_lista[item.id || `cat_${Object.keys(categorias_lista).length + 1}`] = item;
  }
  const marcas = {};
  const marcas_lista = {};
  for (const item of brands.map(normalizeBrand).filter(item => item.nome && item.resource_uri)) {
    marcas[item.nome] = item.resource_uri;
    marcas_lista[item.id || `brand_${Object.keys(marcas_lista).length + 1}`] = item;
  }
  return { categorias, categorias_lista, total_categorias: Object.keys(categorias_lista).length, marcas, marcas_lista, total_marcas: Object.keys(marcas_lista).length };
}

function escapeHtml(value = '') {
  return text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
