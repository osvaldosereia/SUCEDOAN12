import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductDraft, findCatalogMatch, getFiscalChecklist, getNfeItemReviewIssues, readNfeDocument, readProductDrafts, saveProductDraft } from '../src/product-drafts.js';

class XmlNode {
  constructor(name, content = '', attributes = {}) { this.localName = name; this.textContent = content; this.attributes = attributes; this.children = []; }
  append(child) { this.children.push(child); return this; }
  getAttribute(name) { return this.attributes[name] || ''; }
  getElementsByTagNameNS(_namespace, name) { return this.children.flatMap(child => [ ...(child.localName === name ? [child] : []), ...child.getElementsByTagNameNS('*', name) ]); }
}

function node(name, content = '', attributes = {}) { return new XmlNode(name, content, attributes); }
function xmlDocument() {
  const doc = node('document');
  const info = node('infNFe', '', { Id: 'NFe123456' });
  const ide = node('ide').append(node('nNF', '145')).append(node('serie', '2')).append(node('dhEmi', '2026-10-21T09:30:00-04:00'));
  const issuer = node('emit').append(node('xNome', 'Fornecedor Teste')).append(node('CNPJ', '12345678000199'));
  const product = node('prod');
  for (const [key, value] of Object.entries({ cProd: 'ARZ-5', xProd: 'Arroz 5 kg', cEAN: '7891234567895', cEANTrib: '7891234567895', NCM: '10063021', CEST: '1708900', CFOP: '5102', indEscala: 'S', CNPJFab: '12345678000199', EXTIPI: '01', uCom: 'FD', qCom: '2.0000', vUnCom: '42.50', vProd: '85.00', vFrete: '3.00', vSeg: '0.50', vDesc: '2.00', vOutro: '1.25', indTot: '1', uTrib: 'UN', qTrib: '20.0000', vUnTrib: '4.25' })) product.append(node(key, value));
  const tax = node('ICMS').append(node('ICMS00').append(node('orig', '0')).append(node('CST', '00')));
  const pis = node('PIS').append(node('PISAliq').append(node('CST', '01')));
  const cofins = node('COFINS').append(node('COFINSAliq').append(node('CST', '01')));
  const ipi = node('IPI').append(node('IPITrib').append(node('CST', '53')));
  const ibsCbs = node('IBSCBS').append(node('CST', '000')).append(node('cClassTrib', '000001'));
  const item = node('det', '', { nItem: '1' }).append(product).append(tax).append(pis).append(cofins).append(ipi).append(ibsCbs).append(node('infAdProd', 'Lote de teste'));
  info.append(ide).append(issuer).append(item);
  doc.append(info);
  return doc;
}

test('lê os campos de produto e da nota sem perder unidades e códigos fiscais do XML', () => {
  const [item] = readNfeDocument(xmlDocument());
  assert.equal(item.description, 'Arroz 5 kg');
  assert.equal(item.supplier_item_code, 'ARZ-5');
  assert.equal(item.commercial_gtin, '7891234567895');
  assert.equal(item.tax_gtin, '7891234567895');
  assert.equal(item.ncm, '10063021');
  assert.equal(item.cest, '1708900');
  assert.equal(item.cfop, '5102');
  assert.equal(item.origin_code, '0');
  assert.equal(item.tax_code, 'CST 00');
  assert.deepEqual(item.tax_codes, {
    icms_cst: '00', icms_csosn: '', pis_cst: '01', cofins_cst: '01',
    ipi_cst: '53', ibs_cbs_cst: '000', ibs_cbs_classification: '000001'
  });
  assert.equal(item.supplier_cnpj, '12345678000199');
  assert.equal(item.purchase_unit, 'FD');
  assert.equal(item.tax_unit, 'UN');
  assert.equal(item.purchase_quantity, 2);
  assert.equal(item.purchase_unit_price, 42.5);
  assert.equal(item.product_line_total, 85);
  assert.equal(item.tax_quantity, 20);
  assert.equal(item.tax_unit_price, 4.25);
  assert.equal(item.scale_indicator, 'S');
  assert.equal(item.manufacturer_cnpj, '12345678000199');
  assert.equal(item.extipi, '01');
  assert.equal(item.product_line_freight, 3);
  assert.equal(item.product_line_insurance, 0.5);
  assert.equal(item.product_line_discount, 2);
  assert.equal(item.product_line_other_expenses, 1.25);
  assert.equal(item.included_in_invoice_total, '1');
  assert.equal(item.item_additional_info, 'Lote de teste');
  assert.equal(item.invoice_number, '145');
  assert.equal(item.invoice_series, '2');
  assert.equal(item.invoice_date, '2026-10-21T09:30:00-04:00');
  assert.equal(item.supplier_name, 'Fornecedor Teste');
});

test('preserva SEM GTIN indicado explicitamente pela NF-e', () => {
  const document = xmlDocument();
  const productNode = document.getElementsByTagNameNS('*', 'prod')[0];
  productNode.children.find(child => child.localName === 'cEAN').textContent = 'SEM GTIN';
  assert.equal(readNfeDocument(document)[0].commercial_gtin, 'SEM GTIN');
});

test('mantém valores ausentes como null para não mascarar campos vazios do XML', () => {
  const document = xmlDocument();
  const productNode = document.getElementsByTagNameNS('*', 'prod')[0];
  productNode.children = productNode.children.filter(child => !['vUnCom', 'vUnTrib'].includes(child.localName));
  const [item] = readNfeDocument(document);
  assert.equal(item.purchase_unit_price, null);
  assert.equal(item.tax_unit_price, null);
  assert.deepEqual(getNfeItemReviewIssues(item).map(issue => issue.key), ['purchase_unit_price', 'tax_unit_price']);
});

test('valida dados de origem do XML e sinaliza divergência de unidade sem bloquear o rascunho', () => {
  const [item] = readNfeDocument(xmlDocument());
  assert.deepEqual(getNfeItemReviewIssues(item), []);
  const issues = getNfeItemReviewIssues({ ...item, ncm: '', raw_ncm: '', cfop: '51', purchase_quantity: 0, tax_quantity: 0, commercial_gtin: '', tax_gtin: '', raw_commercial_gtin: '', raw_tax_gtin: '' });
  assert.deepEqual(issues.map(issue => issue.key), ['ncm', 'cfop', 'purchase_quantity', 'tax_quantity', 'gtin']);
  const mismatch = getNfeItemReviewIssues({ ...item, tax_unit_price: 2 });
  assert.deepEqual(mismatch.map(issue => issue.key), ['unit_conversion']);
});

test('cria rascunho local preservando dados fiscais e unidade comercial e tributável do XML', () => {
  const draft = createProductDraft({
    description: 'Arroz tipo 1 5 kg', supplier_item_code: 'ARZ-5', commercial_gtin: '7891234567895',
    tax_gtin: '7891234567895', ncm: '10063021', cest: '1708900', origin_code: 0,
    purchase_unit: 'FD', purchase_quantity: 2, tax_unit: 'UN', tax_quantity: 20,
    purchase_unit_price: 42.5, tax_unit_price: 4.25, supplier_name: 'Fornecedor Teste'
  });
  assert.equal(draft.name, 'Arroz tipo 1 5 kg');
  assert.equal(draft.sku, '');
  assert.equal(draft.supplier_item_code, 'ARZ-5');
  assert.equal(draft.commercial_gtin, '7891234567895');
  assert.equal(draft.tax_gtin, '7891234567895');
  assert.equal(draft.ncm, '10063021');
  assert.equal(draft.purchase_unit, 'FD');
  assert.equal(draft.tax_unit, 'UN');
  assert.equal(draft.tax_unit_from_xml, 'UN');
  assert.equal(draft.origin_code_from_xml, '0');
  assert.equal(draft.purchase_quantity, 2);
  assert.equal(draft.purchase_unit_price, 42.5);
  assert.equal(draft.tax_quantity, 20);
  assert.equal(draft.commercial_unit, 'UN');
  assert.equal(draft.cost, 42.5);
  assert.equal(draft.cost_per_tax_unit, 4.25);
  assert.equal(draft.status, 'draft');
});

test('associa produto apenas por GTIN ou SKU exatos e não por nome aproximado', () => {
  const catalog = [
    { id: '1', name: 'Arroz Tipo 1 5 kg', sku: 'ARZ5', gtin: '7891234567895' },
    { id: '2', name: 'Arroz Tipo 1 1 kg', sku: 'ARZ1', gtin: '7891234567802' }
  ];
  assert.equal(findCatalogMatch({ commercial_gtin: '7891234567895', supplier_item_code: 'OTHER' }, catalog).id, '1');
  assert.equal(findCatalogMatch({ commercial_gtin: '', sku: 'ARZ1' }, catalog).id, '2');
  assert.equal(findCatalogMatch({ description: 'Arroz Tipo 1 5kg' }, catalog), null);
});

test('lista pendências fiscais sem tratar CEST como obrigatório para todo produto', () => {
  const checklist = getFiscalChecklist({ name: 'Produto', sku: 'P1', ncm: '10063021', origin_code: 0 });
  assert.deepEqual(checklist.map(item => item.key), ['category', 'sale_price', 'commercial_gtin', 'tax_gtin', 'commercial_unit', 'tax_unit']);
  const complete = getFiscalChecklist({ name: 'Produto', sku: 'P1', category: 'Mercearia', sale_price: '9,99', ncm: '10063021', origin_code: 0, cest: '', commercial_gtin: 'SEM GTIN', tax_gtin: 'SEM GTIN', commercial_unit: 'UN', tax_unit: 'UN' });
  assert.deepEqual(complete, []);
});

test('aponta NCM e GTIN em formato inválido para revisão antes da conclusão do rascunho', () => {
  const checklist = getFiscalChecklist({ name: 'Produto', sku: 'P1', category: 'Mercearia', sale_price: '9,99', ncm: '123', origin_code: '9', commercial_gtin: '12345678', tax_gtin: 'SEM GTIN', commercial_unit: 'UN', tax_unit: 'UN' });
  assert.deepEqual(checklist.map(item => item.key), ['ncm', 'origin_code', 'commercial_gtin']);
});

test('salva e atualiza rascunhos somente no armazenamento local do navegador', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const first = { id: 'draft-1', name: 'Arroz 5 kg' };
  assert.equal(saveProductDraft(first, storage).length, 1);
  assert.equal(saveProductDraft({ ...first, name: 'Arroz 5 kg revisado' }, storage).length, 1);
  assert.equal(readProductDrafts(storage)[0].name, 'Arroz 5 kg revisado');
  assert.equal(readProductDrafts(storage)[0].status, 'draft');
});



