import { calculateUnitConversion, findCatalogMatch, isValidGtin, PRODUCT_CATEGORY_OPTIONS } from './product-management.js';
export { findCatalogMatch } from './product-management.js';

const digits = value => String(value ?? '').replace(/\D/g, '');
const text = value => String(value ?? '').trim();

function elements(root, name) {
  if (!root) return [];
  if (typeof root.getElementsByTagNameNS === 'function') {
    return [...root.getElementsByTagNameNS('*', name)];
  }
  if (typeof root.getElementsByTagName === 'function') {
    return [...root.getElementsByTagName(name)];
  }
  return [];
}

function firstElement(root, name) {
  return elements(root, name)[0] || null;
}

function field(root, name) {
  return text(firstElement(root, name)?.textContent);
}

function decimal(value) {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function validGtin(value) {
  if (text(value).toUpperCase() === 'SEM GTIN') return 'SEM GTIN';
  const code = digits(value);
  return isValidGtin(code) ? code : '';
}

export function readNfeDocument(document) {
  const parserErrors = elements(document, 'parsererror');
  if (parserErrors.length) throw new Error('O arquivo não contém um XML válido.');
  const info = firstElement(document, 'infNFe') || document;
  const invoice = firstElement(info, 'ide');
  const issuer = firstElement(info, 'emit');
  const invoiceKey = text(info.getAttribute?.('Id')).replace(/^NFe/i, '');
  const supplier = field(issuer, 'xNome');
  const items = elements(info, 'det').map(detail => {
    const product = firstElement(detail, 'prod');
    const taxes = firstElement(detail, 'ICMS');
    const rawNcm = digits(field(product, 'NCM'));
    const rawCest = digits(field(product, 'CEST'));
    const cst = digits(field(taxes, 'CST'));
    const csosn = digits(field(taxes, 'CSOSN'));
    const commercialGtin = validGtin(field(product, 'cEAN'));
    const taxGtin = validGtin(field(product, 'cEANTrib'));
    return {
      item_number: Number(detail.getAttribute?.('nItem')) || 0,
      supplier_item_code: field(product, 'cProd'),
      description: field(product, 'xProd'),
      commercial_gtin: commercialGtin,
      tax_gtin: taxGtin,
      ncm: rawNcm.length === 8 ? rawNcm : '',
      cest: rawCest.length === 7 ? rawCest : '',
      cfop: digits(field(product, 'CFOP')),
      origin_code: /^\d$/.test(field(taxes, 'orig')) ? field(taxes, 'orig') : '',
      tax_code: cst ? `CST ${cst}` : csosn ? `CSOSN ${csosn}` : '',
      purchase_unit: field(product, 'uCom').toUpperCase(),
      purchase_quantity: decimal(field(product, 'qCom')),
      purchase_unit_price: decimal(field(product, 'vUnCom')),
      tax_unit: field(product, 'uTrib').toUpperCase(),
      tax_quantity: decimal(field(product, 'qTrib')),
      supplier_name: supplier,
      invoice_number: field(invoice, 'nNF'),
      invoice_key: invoiceKey
    };
  }).filter(item => item.item_number > 0 && item.description);
  if (!items.length) throw new Error('Não encontrei produtos nesta NF-e.');
  return items;
}

export function parseNfeXml(xml, DOMParserImpl = globalThis.DOMParser) {
  if (typeof DOMParserImpl !== 'function') throw new Error('Este navegador não oferece leitura de XML.');
  const document = new DOMParserImpl().parseFromString(String(xml ?? ''), 'application/xml');
  return readNfeDocument(document);
}

export function createProductDraft(item, now = new Date(), existing = null) {
  const conversion = calculateUnitConversion(item);
  return {
    id: globalThis.crypto?.randomUUID?.() || `draft-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    source: 'purchase_xml',
    status: 'draft',
    created_at: now.toISOString(),
    catalog_product_id: text(existing?.id),
    matched_by: text(existing?.matched_by),
    name: text(existing?.name || item.description),
    sku: text(existing?.sku),
    supplier_item_code: text(item.supplier_item_code),
    supplier_name: text(item.supplier_name),
    gtin: text(existing?.gtin),
    commercial_gtin: text(existing?.gtin || item.commercial_gtin),
    xml_commercial_gtin: text(item.commercial_gtin),
    tax_gtin: text(item.tax_gtin),
    ncm: text(item.ncm),
    cest: text(item.cest),
    origin_code: text(item.origin_code),
    purchase_unit: text(item.purchase_unit),
    purchase_quantity: item.purchase_quantity,
    cost: item.purchase_unit_price,
    units_per_purchase_unit: conversion?.units_per_purchase_unit ?? null,
    cost_per_tax_unit: conversion?.cost_per_tax_unit ?? null,
    tax_unit: text(item.tax_unit),
    tax_quantity: item.tax_quantity,
    cfop_from_xml: text(item.cfop),
    tax_code_from_xml: text(item.tax_code),
    invoice_number: text(item.invoice_number),
    invoice_key: text(item.invoice_key),
    commercial_unit: text(item.purchase_unit),
    brand: text(existing?.brand),
    packaging: text(existing?.packaging || item.purchase_unit),
    category: text(existing?.category),
    sale_price: existing ? String((Number(existing.sale_price_cents || 0) / 100).toFixed(2)) : '',
    image_url: text(existing?.image_url)
  };
}



export function getFiscalChecklist(product = {}) {
  const required = [
    ['name', 'Descrição do produto'],
    ['sku', 'SKU ou código interno'],
    ['category', 'Categoria do catálogo'],
    ['sale_price', 'Preço de venda'],
    ['ncm', 'NCM'],
    ['origin_code', 'Origem da mercadoria'],
    ['commercial_gtin', 'GTIN comercial'],
    ['tax_gtin', 'GTIN tributável'],
    ['commercial_unit', 'Unidade comercial'],
    ['tax_unit', 'Unidade tributável']
  ];
  const pending = required.filter(([key]) => !text(product[key])).map(([key, label]) => ({ key, label }));
  const invalid = [];
  if (text(product.category) && !PRODUCT_CATEGORY_OPTIONS.includes(text(product.category))) invalid.push({ key: 'category', label: 'Categoria fora da lista do catálogo' });
  if (text(product.sale_price) && (!Number.isFinite(Number(String(product.sale_price).replace(',', '.'))) || Number(String(product.sale_price).replace(',', '.')) <= 0)) invalid.push({ key: 'sale_price', label: 'Preço de venda deve ser maior que zero' });
  if (text(product.ncm) && !/^\d{8}$/.test(digits(product.ncm))) invalid.push({ key: 'ncm', label: 'NCM deve ter 8 dígitos' });
  if (text(product.cest) && !/^\d{7}$/.test(digits(product.cest))) invalid.push({ key: 'cest', label: 'CEST deve ter 7 dígitos' });
  if (text(product.origin_code) && !/^[0-8]$/.test(text(product.origin_code))) invalid.push({ key: 'origin_code', label: 'Origem deve ser de 0 a 8' });
  for (const key of ['commercial_gtin', 'tax_gtin']) {
    const value = text(product[key]);
    if (value && value.toUpperCase() !== 'SEM GTIN' && !validGtin(value)) invalid.push({ key, label: `${key === 'commercial_gtin' ? 'GTIN comercial' : 'GTIN tributável'} inválido` });
  }
  return [...pending, ...invalid];
}

export function readProductDrafts(storage = globalThis.localStorage) {
  if (!storage) return [];
  try {
    const drafts = JSON.parse(storage.getItem('dona-antonia.admin1.product-drafts') || '[]');
    return Array.isArray(drafts) ? drafts : [];
  } catch {
    return [];
  }
}

export function saveProductDraft(draft, storage = globalThis.localStorage) {
  if (!storage) throw new Error('Rascunhos locais não estão disponíveis neste navegador.');
  const drafts = readProductDrafts(storage);
  const next = [...drafts.filter(item => item.id !== draft.id), { ...draft, status: 'draft', updated_at: new Date().toISOString() }];
  storage.setItem('dona-antonia.admin1.product-drafts', JSON.stringify(next));
  return next;
}


