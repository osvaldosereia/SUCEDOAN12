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

function booleanValue(value) {
  if (value === true || value === 1) return true;
  return ['1', 'true', 'sim', 'yes'].includes(text(value).toLowerCase());
}

function moneyValue(value) {
  return Math.round(Math.max(0, number(value)) * 100) / 100;
}

function integerValue(value, minimum = 0) {
  return Math.max(minimum, Math.floor(number(value) || minimum));
}

function slugValue(value = '') {
  return cleanText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
}

export function normalizeProductForSite(product, config = {}) {
  const source = product && typeof product === 'object' ? clone(product) : {};
  const key = cleanText(productKey(source));
  const regularPrice = moneyValue(source.preco);
  const requestedOffer = moneyValue(source.preco_oferta ?? source.precoOferta);
  const normalized = {
    ...source,
    firebaseKey: key,
    id: key,
    codigo: cleanText(productCode(source)),
    sku: cleanText(source.sku),
    nome: cleanText(source.nome || source.titulo || ''),
    slug: cleanText(source.slug) || slugValue(source.nome || source.titulo),
    preco: regularPrice,
    preco_custo: moneyValue(source.preco_custo),
    preco_atacado: moneyValue(source.preco_atacado),
    estoque: integerValue(source.estoque),
    estoque_minimo: integerValue(source.estoque_minimo),
    multiplo_venda: integerValue(source.multiplo_venda, 1),
    quantidade_caixa: integerValue(source.quantidade_caixa),
    situacao: activeProduct(source) ? 'A' : 'I',
    categoria: normalizeLabel(source.categoria),
    subcategoria: normalizeLabel(source.subcategoria),
    subsubcategoria: normalizeLabel(source.subsubcategoria),
    marca: cleanText(source.marca),
    fornecedor: cleanText(source.fornecedor),
    codigo_fornecedor: cleanText(source.codigo_fornecedor),
    embalagem: cleanText(source.embalagem),
    unidade: cleanText(source.unidade),
    descricao: cleanDescription(source.descricao || source.description),
    descricao_status: cleanText(source.descricao_status),
    seo_titulo: cleanText(source.seo_titulo),
    seo_descricao: cleanDescription(source.seo_descricao),
    seo_status: cleanText(source.seo_status),
    gtin: String(source.gtin || source.ean || '').replace(/\D/g, ''),
    ean: String(source.ean || source.gtin || '').replace(/\D/g, ''),
    gtin_tributavel: String(source.gtin_tributavel || '').replace(/\D/g, ''),
    unidade_tributavel: cleanText(source.unidade_tributavel),
    ncm: String(source.ncm || '').replace(/\D/g, ''),
    cest: String(source.cest || '').replace(/\D/g, ''),
    origem_tributaria: cleanText(source.origem_tributaria),
    cfop: cleanText(source.cfop),
    gondola: cleanText(source.gondola || source['gôndola']),
    prateleira: cleanText(source.prateleira),
    localizacao: cleanText(source.localizacao || source.localização),
    validade: normalizeDate(source.validade || source.data_validade),
    url_imagem: publicImage(productImage(source), config),
    tags: parseTags(source.tags || source.tag_global),
    tag_global: cleanText(source.tag_global),
    destaque: booleanValue(source.destaque),
    ordem: Number.isFinite(Number(source.ordem)) ? Number(source.ordem) : undefined,
    peso: Math.max(0, number(source.peso)),
    largura: Math.max(0, number(source.largura)),
    altura: Math.max(0, number(source.altura)),
    comprimento: Math.max(0, number(source.comprimento)),
    bling_id: cleanText(source.bling_id),
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
    normalized.oferta_origem = cleanText(source.oferta_origem || 'manual');
    normalized.oferta_regra_id = cleanText(source.oferta_regra_id);
    normalized.desconto_validade = Math.max(0, number(source.desconto_validade));
  } else {
    delete normalized.preco_oferta;
    delete normalized.data_inicio_oferta;
    delete normalized.validade_oferta;
    delete normalized.oferta_origem;
    delete normalized.oferta_regra_id;
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
      slug: product.slug,
      preco: product.preco,
      preco_custo: product.preco_custo,
      preco_atacado: product.preco_atacado,
      estoque: product.estoque,
      estoque_minimo: product.estoque_minimo,
      multiplo_venda: product.multiplo_venda,
      quantidade_caixa: product.quantidade_caixa,
      situacao: product.situacao,
      categoria: product.categoria,
      subcategoria: product.subcategoria,
      subsubcategoria: product.subsubcategoria,
      marca: product.marca,
      fornecedor: product.fornecedor,
      codigo_fornecedor: product.codigo_fornecedor,
      embalagem: product.embalagem,
      unidade: product.unidade,
      descricao: product.descricao,
      descricao_status: product.descricao_status,
      seo_titulo: product.seo_titulo,
      seo_descricao: product.seo_descricao,
      seo_status: product.seo_status,
      gtin: product.gtin,
      ean: product.ean,
      gtin_tributavel: product.gtin_tributavel,
      unidade_tributavel: product.unidade_tributavel,
      ncm: product.ncm,
      cest: product.cest,
      origem_tributaria: product.origem_tributaria,
      cfop: product.cfop,
      gondola: product.gondola,
      prateleira: product.prateleira,
      localizacao: product.localizacao,
      validade: product.validade,
      url_imagem: product.url_imagem,
      imagens: product.imagens,
      tags: product.tags,
      tag_global: product.tag_global,
      destaque: product.destaque === true,
      ordem: product.ordem,
      peso: product.peso,
      largura: product.largura,
      altura: product.altura,
      comprimento: product.comprimento,
      bling_id: product.bling_id,
      last_update: product.last_update || undefined,
      updated_at: product.updated_at || undefined,
    };
    if (number(product.preco_oferta) > 0) item.preco_oferta = product.preco_oferta;
    if (product.data_inicio_oferta) item.data_inicio_oferta = product.data_inicio_oferta;
    if (product.validade_oferta) item.validade_oferta = product.validade_oferta;
    if (product.oferta_origem) item.oferta_origem = product.oferta_origem;
    if (product.oferta_regra_id) item.oferta_regra_id = product.oferta_regra_id;
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
    instructions: 'Arquivo atualizado automaticamente pelo Admin oficial Dona Antônia.',
  };
}
