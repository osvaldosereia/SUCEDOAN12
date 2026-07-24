export function text(value = '') {
  return String(value ?? '').trim();
}

export function normalizeSearch(value = '') {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

export function number(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  let raw = text(value).replace(/[^\d,.-]/g, '');
  if (!raw) return 0;
  const comma = raw.lastIndexOf(',');
  const dot = raw.lastIndexOf('.');
  if (comma > -1 && dot > -1) raw = comma > dot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  else if (comma > -1) raw = raw.replace(/\./g, '').replace(',', '.');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function money(value) {
  return number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

export function productKey(product, fallback = '') {
  return text(product?.firebaseKey || product?.id || product?.codigo || fallback);
}

export function productCode(product) {
  return text(product?.codigo || product?.sku || product?.id || product?.firebaseKey);
}

export function productName(product) {
  return text(product?.nome || product?.titulo || product?.descricao || productCode(product) || 'Produto sem nome');
}

export function productImage(product) {
  return text(product?.url_imagem || product?.imagem_url || product?.imagem || product?.image || product?.foto || '');
}

export function isActive(product) {
  const status = text(product?.situacao ?? product?.status ?? 'A').toLocaleLowerCase('pt-BR');
  return !['i', 'inativo', 'false', '0', 'excluido', 'excluído'].includes(status)
    && product?.ativo !== false
    && product?.visivel !== false;
}

export function productMissing(product) {
  const missing = [];
  if (!productName(product) || productName(product) === 'Produto sem nome') missing.push('Nome');
  if (!productCode(product)) missing.push('Código');
  if (!text(product?.gtin || product?.ean)) missing.push('EAN');
  if (!text(product?.ncm)) missing.push('NCM');
  if (!text(product?.categoria)) missing.push('Categoria');
  if (!text(product?.embalagem)) missing.push('Embalagem');
  if (!productImage(product)) missing.push('Imagem');
  if (number(product?.preco) <= 0) missing.push('Preço');
  return missing;
}

export function formatDate(value) {
  const raw = text(value);
  if (!raw) return '—';
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? raw : raw.slice(0, 10);
}

export function debounce(callback, delay = 220) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}

export function nowIso() {
  return new Date().toISOString();
}
