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
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const number = Number(raw.replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function validGtin(value) {
  if (text(value).toUpperCase() === 'SEM GTIN') return 'SEM GTIN';
  const code = digits(value);
  return isValidGtin(code) ? code : '';
}

function taxCode(detail, groupName, codeName) {
  return digits(field(firstElement(detail, groupName), codeName));
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
    const rawCommercialGtin = field(product, 'cEAN');
    const rawTaxGtin = field(product, 'cEANTrib');
    const commercialGtin = validGtin(rawCommercialGtin);
    const taxGtin = validGtin(rawTaxGtin);
    const ibsCbs = firstElement(detail, 'IBSCBS');
    return {
      item_number: Number(detail.getAttribute?.('nItem')) || 0,
      supplier_item_code: field(product, 'cProd'),
      description: field(product, 'xProd'),
      commercial_gtin: commercialGtin,
      tax_gtin: taxGtin,
      raw_commercial_gtin: rawCommercialGtin,
      raw_tax_gtin: rawTaxGtin,
      raw_ncm: field(product, 'NCM'),
      raw_cest: field(product, 'CEST'),
      ncm: rawNcm.length === 8 ? rawNcm : '',
      cest: rawCest.length === 7 ? rawCest : '',
      extipi: digits(field(product, 'EXTIPI')),
      scale_indicator: field(product, 'indEscala'),
      manufacturer_cnpj: digits(field(product, 'CNPJFab')),
      cfop: digits(field(product, 'CFOP')),
      cbenef: field(product, 'cBenef'),
      origin_code: /^\d$/.test(field(taxes, 'orig')) ? field(taxes, 'orig') : '',
      tax_code: cst ? `CST ${cst}` : csosn ? `CSOSN ${csosn}` : '',
      tax_codes: {
        icms_cst: cst,
        icms_csosn: csosn,
        pis_cst: taxCode(detail, 'PIS', 'CST'),
        cofins_cst: taxCode(detail, 'COFINS', 'CST'),
        ipi_cst: taxCode(detail, 'IPI', 'CST'),
        ibs_cbs_cst: digits(field(ibsCbs, 'CST')),
        ibs_cbs_classification: digits(field(ibsCbs, 'cClassTrib'))
      },
      purchase_unit: field(product, 'uCom').toUpperCase(),
      purchase_quantity: decimal(field(product, 'qCom')),
      purchase_unit_price: decimal(field(product, 'vUnCom')),
      product_line_total: decimal(field(product, 'vProd')),
      product_line_freight: decimal(field(product, 'vFrete')),
      product_line_insurance: decimal(field(product, 'vSeg')),
      product_line_discount: decimal(field(product, 'vDesc')),
      product_line_other_expenses: decimal(field(product, 'vOutro')),
      included_in_invoice_total: field(product, 'indTot'),
      item_additional_info: field(detail, 'infAdProd'),
      tax_unit: field(product, 'uTrib').toUpperCase(),
      tax_quantity: decimal(field(product, 'qTrib')),
      tax_unit_price: decimal(field(product, 'vUnTrib')),
      supplier_name: supplier,
      supplier_cnpj: digits(field(issuer, 'CNPJ')),
      supplier_cpf: digits(field(issuer, 'CPF')),
      invoice_number: field(invoice, 'nNF'),
      invoice_series: field(invoice, 'serie'),
      invoice_date: field(invoice, 'dhEmi') || field(invoice, 'dEmi'),
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

export function getNfeItemReviewIssues(item = {}) {
  const issues = [];
  const add = (key, label) => issues.push({ key, label });
  const hasNumber = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  if (!/^\d{8}$/.test(digits(item.raw_ncm || item.ncm))) add('ncm', 'Confira o NCM de 8 dígitos da nota.');
  if (!/^\d{4}$/.test(digits(item.cfop))) add('cfop', 'Confira o CFOP de 4 dígitos da nota.');
  if (!/^\d$/.test(text(item.origin_code))) add('origin_code', 'Confira a origem da mercadoria na nota.');
  if (!text(item.purchase_unit)) add('purchase_unit', 'Unidade comercial ausente no XML.');
  if (!hasNumber(item.purchase_quantity) || Number(item.purchase_quantity) <= 0) add('purchase_quantity', 'Quantidade comercial da nota precisa ser maior que zero.');
  if (!hasNumber(item.purchase_unit_price) || Number(item.purchase_unit_price) < 0) add('purchase_unit_price', 'Valor unitário comercial ausente ou inválido.');
  if (!text(item.tax_unit)) add('tax_unit', 'Unidade tributável ausente no XML.');
  if (!hasNumber(item.tax_quantity) || Number(item.tax_quantity) <= 0) add('tax_quantity', 'Quantidade tributável da nota precisa ser maior que zero.');
  if (!hasNumber(item.tax_unit_price) || Number(item.tax_unit_price) < 0) add('tax_unit_price', 'Valor unitário tributável ausente ou inválido.');
  const rawCommercial = text(item.raw_commercial_gtin || item.commercial_gtin);
  const rawTax = text(item.raw_tax_gtin || item.tax_gtin);
  if (!rawCommercial || !rawTax) add('gtin', 'Confirme o GTIN comercial e o tributável ou indique SEM GTIN.');
  else if ([rawCommercial, rawTax].some(value => value.toUpperCase() !== 'SEM GTIN' && !validGtin(value))) add('gtin', 'Confira o GTIN comercial e o tributável informados na nota.');
  const purchaseQuantity = Number(item.purchase_quantity);
  const taxQuantity = Number(item.tax_quantity);
  const purchasePrice = Number(item.purchase_unit_price);
  const taxPrice = Number(item.tax_unit_price);
  if ([item.purchase_quantity, item.tax_quantity, item.purchase_unit_price, item.tax_unit_price].every(hasNumber)
    && purchaseQuantity > 0 && taxQuantity > 0 && purchasePrice >= 0 && taxPrice >= 0) {
    const calculatedTaxUnitPrice = purchasePrice * purchaseQuantity / taxQuantity;
    const tolerance = Math.max(0.02, calculatedTaxUnitPrice * 0.005);
    if (Math.abs(calculatedTaxUnitPrice - taxPrice) > tolerance) add('unit_conversion', 'O valor por unidade tributável não confere com a conversão das quantidades; revise a embalagem.');
  }
  return issues;
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
    description_from_xml: text(item.description),
    sku: text(existing?.sku),
    supplier_item_code: text(item.supplier_item_code),
    supplier_name: text(item.supplier_name),
    gtin: text(existing?.gtin),
    commercial_gtin: text(existing?.gtin || item.commercial_gtin),
    xml_commercial_gtin: text(item.commercial_gtin),
    tax_gtin: text(item.tax_gtin),
    raw_commercial_gtin: text(item.raw_commercial_gtin || item.commercial_gtin),
    raw_tax_gtin: text(item.raw_tax_gtin || item.tax_gtin),
    ncm: text(item.ncm),
    cest: text(item.cest),
    raw_ncm_from_xml: text(item.raw_ncm || item.ncm),
    raw_cest_from_xml: text(item.raw_cest || item.cest),
    origin_code: text(item.origin_code),
    origin_code_from_xml: text(item.origin_code),
    cbenef_from_xml: text(item.cbenef),
    tax_codes_from_xml: item.tax_codes && typeof item.tax_codes === 'object' ? { ...item.tax_codes } : {},
    purchase_unit: text(item.purchase_unit),
    purchase_quantity: item.purchase_quantity,
    purchase_unit_price: item.purchase_unit_price,
    cost: item.purchase_unit_price,
    product_line_total: item.product_line_total,
    product_line_freight: item.product_line_freight,
    product_line_insurance: item.product_line_insurance,
    product_line_discount: item.product_line_discount,
    product_line_other_expenses: item.product_line_other_expenses,
    included_in_invoice_total: text(item.included_in_invoice_total),
    extipi: text(item.extipi),
    scale_indicator: text(item.scale_indicator),
    manufacturer_cnpj: text(item.manufacturer_cnpj),
    item_additional_info: text(item.item_additional_info),
    units_per_purchase_unit: conversion?.units_per_purchase_unit ?? null,
    cost_per_tax_unit: Number.isFinite(Number(item.tax_unit_price)) && Number(item.tax_unit_price) >= 0
      ? Number(item.tax_unit_price)
      : conversion?.cost_per_tax_unit ?? null,
    tax_unit: text(item.tax_unit),
    tax_unit_from_xml: text(item.tax_unit),
    tax_quantity: item.tax_quantity,
    tax_unit_price: item.tax_unit_price,
    cfop_from_xml: text(item.cfop),
    tax_code_from_xml: text(item.tax_code),
    invoice_number: text(item.invoice_number),
    invoice_series: text(item.invoice_series),
    invoice_date: text(item.invoice_date),
    invoice_key: text(item.invoice_key),
    supplier_cnpj: text(item.supplier_cnpj),
    supplier_cpf: text(item.supplier_cpf),
    commercial_unit: text(existing?.unit || item.tax_unit || item.purchase_unit),
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



