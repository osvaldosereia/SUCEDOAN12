import {
  clone, number, productCode, productImage, productKey, productName, text,
} from './utils.js';

const MAX_DISCOUNT_PERCENT = 50;

function cleanText(value = '') {
  return text(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanDescription(value = '') {
  const raw = text(value);
  if (!raw) return '';
  try {
    const documentValue = new DOMParser().parseFromString(
      raw.replace(/<br\s*\/?>/gi, ' ').replace(/<\/(?:div|p|li)>/gi, ' '),
      'text/html',
    );
    return cleanText(documentValue.body.textContent || '');
  } catch {
    return cleanText(raw.replace(/<[^>]*>/g, ' '));
  }
}

function normalizeLabel(value = '') {
  return cleanText(value).toLocaleUpperCase('pt-BR');
}

function normalizeDate(value = '', { endOfDay = false } = {}) {
  const raw = text(value);
  if (!raw) return '';
  let year;
  let month;
  let day;
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
      day = Number(match[1]);
      month = Number(match[2]);
      year = Number(match[3]);
    }
  }
  if (!year) return '';
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return '';
  const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return endOfDay ? `${date}T23:59:59-04:00` : date;
}

function isDataImage(value = '') {
  return /^data:image\//i.test(text(value));
}

function publicImage(value, config) {
  const raw = cleanText(value);
  if (!raw || isDataImage(raw)) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.replace(/^\/+/, '');
  if (!config.githubOwner || !config.githubRepo) return path;
  return `https://raw.githubusercontent.com/${encodeURIComponent(config.githubOwner)}/${encodeURIComponent(config.githubRepo)}/${encodeURIComponent(config.githubBranch || 'main')}/${path}`;
}

function parseTags(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[,;|]/);
  return [...new Set(source.map(cleanText).filter(Boolean))];
}

function activeProduct(product) {
  const status = text(product?.situacao ?? product?.status ?? 'A').toLocaleLowerCase('pt-BR');
  return !['i', 'inativo', 'false', '0', 'excluido', 'excluído'].includes(status)
    && product?.ativo !== false
    && product?.visivel !== false;
}

export function normalizeProductForSite(product, config = {}) {
  const source = product && typeof product === 'object' ? clone(product) : {};
  const key = cleanText(productKey(source));
  const regularPrice = Math.round(Math.max(0, number(source.preco)) * 100) / 100;
  const requestedOffer = Math.round(Math.max(0, number(source.preco_oferta ?? source.precoOferta)) * 100) / 100;
  const normalized = {
    ...source,
    firebaseKey: key,
    id: key,
    codigo: cleanText(productCode(source)),
    sku: cleanText(source.sku),
    nome: cleanText(source.nome || source.titulo || ''),
    preco: regularPrice,
    preco_custo: Math.round(Math.max(0, number(source.preco_custo)) * 100) / 100,
    estoque: Math.max(0, Math.floor(number(source.estoque))),
    situacao: activeProduct(source) ? 'A' : 'I',
    categoria: normalizeLabel(source.categoria),
    subcategoria: normalizeLabel(source.subcategoria),
    subsubcategoria: normalizeLabel(source.subsubcategoria),
    marca: cleanText(source.marca),
    fornecedor: cleanText(source.fornecedor),
    embalagem: cleanText(source.embalagem),
    unidade: cleanText(source.unidade),
    descricao: cleanDescription(source.descricao || source.description),
    gtin: String(source.gtin || source.ean || '').replace(/\D/g, ''),
    ean: String(source.ean || source.gtin || '').replace(/\D/g, ''),
    ncm: String(source.ncm || '').replace(/\D/g, ''),
    gondola: cleanText(source.gondola || source['gôndola']),
    prateleira: cleanText(source.prateleira),
    localizacao: cleanText(source.localizacao || source.localização),
    validade: normalizeDate(source.validade || source.data_validade),
    url_imagem: publicImage(productImage(source), config),
    tags: parseTags(source.tags || source.tag_global),
    tag_global: cleanText(source.tag_global),
  };

  const gallerySource = [
    normalized.url_imagem,
    ...(Array.isArray(source.imagens) ? source.imagens : []),
    ...(Array.isArray(source.images) ? source.images : []),
  ];
  normalized.imagens = [...new Set(gallerySource.map(value => publicImage(value, config)).filter(Boolean))];

  if (requestedOffer > 0) {
    normalized.preco_oferta = requestedOffer;
    normalized.data_inicio_oferta = normalizeDate(source.data_inicio_oferta || source.inicio_oferta);
    normalized.validade_oferta = normalizeDate(source.validade_oferta || source.validadeOferta, { endOfDay: true });
    normalized.oferta_origem = source.oferta_origem === 'validade' ? 'validade' : 'manual';
    normalized.desconto_validade = Math.max(0, number(source.desconto_validade));
  } else {
    delete normalized.preco_oferta;
    delete normalized.data_inicio_oferta;
    delete normalized.validade_oferta;
    delete normalized.oferta_origem;
    delete normalized.desconto_validade;
  }

  return normalized;
}

export function validateProduct(product, config = {}) {
  const normalized = normalizeProductForSite(product, config);
  const errors = [];
  const warnings = [];
  const regular = number(normalized.preco);
  const offer = number(normalized.preco_oferta);

  if (!normalized.firebaseKey) errors.push('Chave do Firebase ausente');
  if (!normalized.codigo) errors.push('Código comercial ausente');
  if (!normalized.nome || normalized.nome === 'Produto sem nome') errors.push('Nome ausente');
  if (!normalized.categoria) errors.push('Categoria ausente');
  if (!normalized.embalagem) errors.push('Embalagem ausente');
  if (normalized.situacao === 'A' && regular <= 0) errors.push('Preço de venda deve ser maior que zero');
  if (number(product?.estoque) < 0) errors.push('Estoque não pode ser negativo');
  if ([productImage(product), ...(Array.isArray(product?.imagens) ? product.imagens : [])].some(isDataImage)) errors.push('Imagem local/base64 não pode ser publicada');

  if (offer > 0) {
    if (offer >= regular) errors.push('Preço de oferta deve ser menor que o preço normal');
    if (!normalized.validade_oferta) errors.push('Oferta precisa de data final válida');
    const discount = regular > 0 ? (1 - offer / regular) * 100 : 0;
    if (discount > MAX_DISCOUNT_PERCENT + 0.001) errors.push(`Desconto da oferta ultrapassa ${MAX_DISCOUNT_PERCENT}%`);
  }

  if (!normalized.gtin) warnings.push('EAN ausente');
  if (!normalized.ncm) warnings.push('NCM ausente');
  if (!normalized.url_imagem) warnings.push('Imagem pública ausente');
  if (!normalized.subcategoria) warnings.push('Subcategoria ausente');
  if (!normalized.marca) warnings.push('Marca ausente');
  if (!normalized.fornecedor) warnings.push('Fornecedor ausente');
  if (!normalized.descricao) warnings.push('Descrição ausente');
  if (normalized.preco_custo <= 0) warnings.push('Preço de custo ausente');

  return { product: normalized, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

export function auditCatalog(products, config = {}) {
  const rows = (products || []).map(product => {
    const result = validateProduct(product, config);
    return {
      key: productKey(product),
      name: productName(product),
      errors: result.errors,
      warnings: result.warnings,
      product: result.product,
    };
  });
  return {
    rows,
    errors: rows.filter(row => row.errors.length),
    warnings: rows.filter(row => row.warnings.length),
    valid: rows.filter(row => !row.errors.length),
  };
}

export function buildProductsHomePayload(products, config = {}) {
  const audit = auditCatalog(products, config);
  if (audit.errors.length) {
    const preview = audit.errors.slice(0, 8).map(row => `${row.name}: ${row.errors.join(', ')}`).join('; ');
    throw new Error(`O catálogo possui ${audit.errors.length} produto(s) com erro. ${preview}`);
  }

  const output = {};
  audit.rows.forEach(({ product }, index) => {
    const key = cleanText(product.firebaseKey || `produto_${index}`);
    const item = {
      firebaseKey: key,
      id: key,
      codigo: product.codigo,
      sku: product.sku,
      nome: product.nome,
      preco: product.preco,
      preco_custo: product.preco_custo,
      estoque: product.estoque,
      situacao: product.situacao,
      categoria: product.categoria,
      subcategoria: product.subcategoria,
      subsubcategoria: product.subsubcategoria,
      marca: product.marca,
      fornecedor: product.fornecedor,
      embalagem: product.embalagem,
      unidade: product.unidade,
      descricao: product.descricao,
      gtin: product.gtin,
      ean: product.ean,
      ncm: product.ncm,
      gondola: product.gondola,
      prateleira: product.prateleira,
      localizacao: product.localizacao,
      validade: product.validade,
      url_imagem: product.url_imagem,
      imagens: product.imagens,
      tags: product.tags,
      tag_global: product.tag_global,
      destaque: product.destaque === true,
      ordem: Number.isFinite(Number(product.ordem)) ? Number(product.ordem) : undefined,
      last_update: product.last_update || undefined,
      updated_at: product.updated_at || undefined,
    };
    if (number(product.preco_oferta) > 0) item.preco_oferta = product.preco_oferta;
    if (product.data_inicio_oferta) item.data_inicio_oferta = product.data_inicio_oferta;
    if (product.validade_oferta) item.validade_oferta = product.validade_oferta;
    if (product.oferta_origem) item.oferta_origem = product.oferta_origem;
    if (number(product.desconto_validade) > 0) item.desconto_validade = number(product.desconto_validade);

    output[key] = Object.fromEntries(Object.entries(item).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === 'boolean') return value;
      return value !== '' && value !== null && value !== undefined;
    }));
  });
  return output;
}

export function catalogVersionPayload(config, changed = ['products']) {
  return {
    version: `catalog-${Date.now()}`,
    updatedAt: new Date().toISOString(),
    products: config.productsHomePath || 'site/produtos-home.json',
    changed: [...new Set(changed)],
    source: 'admin-producao-v2',
    instructions: 'Arquivo atualizado automaticamente pelo Admin V2 Dona Antônia.',
  };
}
