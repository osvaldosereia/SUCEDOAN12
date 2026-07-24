import { clone, normalizeSearch, number, productCode, productKey, productName, text } from './utils.js';

export const NFE_RECORDS_PATH = 'fiscal/nfe-importadas/registros';

export function digits(value = '') {
  return String(value ?? '').replace(/\D/g, '');
}

export function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(number(value) * factor) / factor;
}

function nodeText(parent, ...names) {
  for (const name of names) {
    const node = parent?.getElementsByTagName(name)?.[0];
    const value = String(node?.textContent || '').trim();
    if (value) return value;
  }
  return '';
}

async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle) return '';
  const buffer = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value ?? '')));
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function detectMultiplier({ name, commercialUnit, commercialQuantity, taxableUnit, taxableQuantity }) {
  const qCom = number(commercialQuantity);
  const qTrib = number(taxableQuantity);
  const unitCom = text(commercialUnit).toUpperCase();
  const unitTrib = text(taxableUnit).toUpperCase();

  if (qCom > 0 && qTrib > qCom && unitCom && unitTrib && unitCom !== unitTrib) {
    const ratio = qTrib / qCom;
    if (Number.isInteger(ratio) && ratio >= 2 && ratio <= 1000) {
      return { value: ratio, source: `NF-e: ${qTrib} ${unitTrib} ÷ ${qCom} ${unitCom}` };
    }
  }

  const haystack = `${text(name).toUpperCase()} ${unitCom}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ' ')
    .replace(/\s+/g, ' ');
  const patterns = [
    /(?:C\/|C\s*\/\s*|COM\s+)(\d{1,4})\s*(?:UN|UND|UNID|UNIDADE|UNIDADES)\b/,
    /(?:CAIXA|CX|FARDO|FD|DISPLAY|PACK|PACOTE|PCT)\s*(?:C\/|COM|DE)?\s*(\d{1,4})\s*(?:UN|UND|UNID|UNIDADE|UNIDADES)\b/,
    /\b(?:CX|FD|PCT|PACK)(\d{1,4})\b/,
  ];
  for (const pattern of patterns) {
    const match = haystack.match(pattern);
    const value = Number(match?.[1]);
    if (Number.isInteger(value) && value >= 2 && value <= 1000) {
      return { value, source: `Detectado na descrição/embalagem: ${match[0]}` };
    }
  }
  return { value: 1, source: 'Produto unitário ou embalagem sem quantidade explícita' };
}

function allocateEqualDiscount(items, discountValue) {
  const totalCents = Math.max(0, Math.round(number(discountValue) * 100));
  const capacities = items.map(item => Math.max(0, Math.round(number(item.gross) * 100) - 1));
  const allocated = items.map(() => 0);
  let remaining = Math.min(totalCents, capacities.reduce((sum, value) => sum + value, 0));
  let active = capacities.map((capacity, index) => ({ capacity, index })).filter(row => row.capacity > 0);

  while (remaining > 0 && active.length) {
    const baseShare = Math.max(1, Math.floor(remaining / active.length));
    let progressed = 0;
    for (const row of active) {
      if (remaining <= 0) break;
      const room = row.capacity - allocated[row.index];
      if (room <= 0) continue;
      const give = Math.min(room, baseShare, remaining);
      allocated[row.index] += give;
      remaining -= give;
      progressed += give;
    }
    active = active.filter(row => allocated[row.index] < row.capacity);
    if (!progressed) break;
  }
  items.forEach((item, index) => { item.discount = allocated[index] / 100; });
}

export function recalculateNfeItems(items, note, margin = 40) {
  const safeMargin = Math.min(95, Math.max(0, number(margin)));
  allocateEqualDiscount(items, note?.discount || 0);
  items.forEach(item => {
    item.multiplier = Math.max(1, Math.floor(number(item.multiplier) || 1));
    item.incomingUnits = round(number(item.commercialQuantity) * item.multiplier);
    item.net = Math.max(0, round(number(item.gross) - number(item.discount)));
    item.unitCost = item.incomingUnits > 0 ? round(item.net / item.incomingUnits) : 0;
    item.suggestedPrice = safeMargin < 100 ? round(item.unitCost / (1 - safeMargin / 100)) : item.unitCost;
    const baseStock = number(item.matchedProduct?.estoque);
    item.projectedStock = round(baseStock + item.incomingUnits);
  });
  return items;
}

export async function parseNfeXml(rawXml, { scannedKey = '', margin = 40 } = {}) {
  const raw = String(rawXml || '').trim();
  if (!raw) throw new Error('Selecione ou cole o XML completo da NF-e.');
  if (!raw.includes('<')) {
    const possibleKey = digits(raw);
    if (possibleKey.length === 44) throw new Error('Chave identificada. Agora selecione o arquivo XML da mesma nota.');
    throw new Error('O conteúdo informado não é um XML válido.');
  }

  const documentXml = new DOMParser().parseFromString(raw, 'application/xml');
  if (documentXml.querySelector('parsererror')) throw new Error('XML inválido ou incompleto.');
  const infNFe = documentXml.getElementsByTagName('infNFe')[0];
  if (!infNFe) throw new Error('O arquivo não possui a estrutura de uma NF-e.');
  const details = [...infNFe.getElementsByTagName('det')];
  if (!details.length) throw new Error('Não encontrei produtos dentro da NF-e.');

  const ide = infNFe.getElementsByTagName('ide')[0];
  const emit = infNFe.getElementsByTagName('emit')[0];
  const totals = infNFe.getElementsByTagName('ICMSTot')[0] || documentXml;
  const infId = String(infNFe.getAttribute('Id') || '').replace(/^NFe/i, '');
  const protocolKey = nodeText(documentXml, 'chNFe');
  const accessKey = digits(infId || protocolKey);
  const expectedKey = digits(scannedKey);
  if (accessKey.length !== 44) throw new Error('O XML não possui uma chave de acesso válida com 44 números.');
  if (expectedKey && expectedKey.length !== 44) throw new Error('A chave informada precisa ter exatamente 44 números.');
  if (expectedKey && expectedKey !== accessKey) throw new Error('A chave escaneada não corresponde ao XML selecionado.');

  const note = {
    key: accessKey,
    number: nodeText(ide, 'nNF'),
    series: nodeText(ide, 'serie'),
    issuedAt: nodeText(ide, 'dhEmi', 'dEmi'),
    supplier: nodeText(emit, 'xNome'),
    supplierCnpj: digits(nodeText(emit, 'CNPJ', 'CPF')),
    gross: number(nodeText(totals, 'vProd')),
    discount: number(nodeText(totals, 'vDesc')),
    freight: number(nodeText(totals, 'vFrete')),
    other: number(nodeText(totals, 'vOutro')),
    total: number(nodeText(totals, 'vNF')),
    lineCount: details.length,
    xmlHash: await sha256Hex(raw),
  };

  const grouped = new Map();
  details.forEach((detail, index) => {
    const productNode = detail.getElementsByTagName('prod')[0];
    if (!productNode) return;
    const rawEan = nodeText(productNode, 'cEAN') || nodeText(productNode, 'cEANTrib');
    const ean = /SEM GTIN/i.test(rawEan) ? '' : digits(rawEan);
    const supplierCode = nodeText(productNode, 'cProd');
    const name = nodeText(productNode, 'xProd') || `Produto ${index + 1}`;
    const commercialQuantity = number(nodeText(productNode, 'qCom'));
    const taxableQuantity = number(nodeText(productNode, 'qTrib'));
    const commercialUnit = nodeText(productNode, 'uCom');
    const taxableUnit = nodeText(productNode, 'uTrib');
    const gross = number(nodeText(productNode, 'vProd')) || round(number(nodeText(productNode, 'vUnCom')) * commercialQuantity);
    const groupKey = ean ? `EAN:${ean}` : `COD:${supplierCode || normalizeSearch(name)}`;
    const detected = detectMultiplier({ name, commercialUnit, commercialQuantity, taxableUnit, taxableQuantity });
    let item = grouped.get(groupKey);
    if (!item) {
      item = {
        id: `nfe_${index + 1}_${grouped.size + 1}`,
        groupKey,
        lines: [],
        supplierCodes: [],
        ean,
        name,
        ncm: digits(nodeText(productNode, 'NCM')),
        cest: digits(nodeText(productNode, 'CEST')),
        packaging: commercialUnit,
        commercialUnit,
        taxableUnit,
        commercialQuantity: 0,
        taxableQuantity: 0,
        gross: 0,
        discount: 0,
        multiplier: detected.value,
        multiplierSource: detected.source,
        incomingUnits: 0,
        net: 0,
        unitCost: 0,
        suggestedPrice: 0,
        projectedStock: 0,
        matchStatus: 'unmatched',
        duplicate: false,
        duplicateReason: '',
        matchedProduct: null,
        suggestions: [],
      };
      grouped.set(groupKey, item);
    }
    item.lines.push(index + 1);
    if (supplierCode && !item.supplierCodes.includes(supplierCode)) item.supplierCodes.push(supplierCode);
    item.commercialQuantity += commercialQuantity;
    item.taxableQuantity += taxableQuantity;
    item.gross += gross;
    if (detected.value > item.multiplier) {
      item.multiplier = detected.value;
      item.multiplierSource = detected.source;
    }
  });

  const items = [...grouped.values()];
  recalculateNfeItems(items, note, margin);
  return { note, items, rawXml: raw };
}

function entryList(product) {
  const value = product?.entradas_nfe;
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function exactEanProduct(products, ean) {
  const target = digits(ean);
  if (!target) return null;
  return products.find(product => {
    const aliases = Array.isArray(product.ean_aliases) ? product.ean_aliases : [];
    return [product.gtin, product.ean, ...aliases].some(value => digits(value) === target);
  }) || null;
}

function suggestionScore(product, item) {
  const supplierCodes = item.supplierCodes.map(digits).filter(Boolean);
  if (supplierCodes.includes(digits(productCode(product)))) return 100;
  const itemWords = normalizeSearch(item.name).split(/\s+/).filter(word => word.length > 2);
  const productText = normalizeSearch([productName(product), product.marca, product.embalagem, product.categoria].join(' '));
  const hits = itemWords.filter(word => productText.includes(word)).length;
  return itemWords.length ? Math.round((hits / itemWords.length) * 70) : 0;
}

export function matchNfeAnalysis(analysis, products, importRecord = null, margin = 40) {
  const result = clone(analysis);
  const registeredGroups = new Set((Array.isArray(importRecord?.itens_aplicados) ? importRecord.itens_aplicados : [])
    .map(entry => String(entry?.grupo || '')).filter(Boolean));
  const globalDuplicate = importRecord?.status === 'concluida';

  result.items.forEach(item => {
    const exact = exactEanProduct(products, item.ean);
    item.matchedProduct = exact ? clone(exact) : null;
    item.matchStatus = exact ? 'exact' : 'unmatched';
    item.suggestions = exact ? [] : products
      .map(product => ({ product, score: suggestionScore(product, item) }))
      .filter(row => row.score >= 35)
      .sort((a, b) => b.score - a.score || productName(a.product).localeCompare(productName(b.product), 'pt-BR'))
      .slice(0, 5)
      .map(row => ({ key: productKey(row.product), name: productName(row.product), code: productCode(row.product), score: row.score }));

    const entryId = `${result.note.key}|${item.groupKey}`;
    const productDuplicate = exact && entryList(exact).some(entry => String(entry?.id || '') === entryId);
    item.duplicate = globalDuplicate || registeredGroups.has(item.groupKey) || productDuplicate;
    item.duplicateReason = globalDuplicate
      ? 'A nota inteira já está concluída no registro fiscal.'
      : registeredGroups.has(item.groupKey)
        ? 'Este grupo já consta como aplicado no registro fiscal.'
        : productDuplicate
          ? 'O produto já possui esta entrada em entradas_nfe.'
          : '';
  });
  result.importRecord = importRecord ? clone(importRecord) : null;
  result.globalDuplicate = globalDuplicate;
  recalculateNfeItems(result.items, result.note, margin);
  return result;
}

export function chooseNfeProduct(analysis, itemId, product, margin = 40) {
  const result = clone(analysis);
  const item = result.items.find(candidate => candidate.id === itemId);
  if (!item) return result;
  item.matchedProduct = product ? clone(product) : null;
  item.matchStatus = product ? 'manual' : 'unmatched';
  item.suggestions = [];
  const entryId = `${result.note.key}|${item.groupKey}`;
  const registeredGroups = new Set((Array.isArray(result.importRecord?.itens_aplicados) ? result.importRecord.itens_aplicados : [])
    .map(entry => String(entry?.grupo || '')).filter(Boolean));
  const globalDuplicate = result.globalDuplicate || result.importRecord?.status === 'concluida';
  const productDuplicate = Boolean(product && entryList(product).some(entry => String(entry?.id || '') === entryId));
  item.duplicate = globalDuplicate || registeredGroups.has(item.groupKey) || productDuplicate;
  item.duplicateReason = globalDuplicate
    ? 'A nota inteira já está concluída no registro fiscal.'
    : registeredGroups.has(item.groupKey)
      ? 'Este grupo já consta como aplicado no registro fiscal.'
      : productDuplicate
        ? 'O produto escolhido já possui esta entrada em entradas_nfe.'
        : '';
  recalculateNfeItems(result.items, result.note, margin);
  return result;
}

export function nfeAnalysisSummary(analysis) {
  const items = analysis?.items || [];
  return {
    lines: number(analysis?.note?.lineCount),
    groups: items.length,
    exact: items.filter(item => item.matchStatus === 'exact').length,
    manual: items.filter(item => item.matchStatus === 'manual').length,
    unmatched: items.filter(item => item.matchStatus === 'unmatched').length,
    duplicates: items.filter(item => item.duplicate).length,
    incomingUnits: round(items.reduce((sum, item) => sum + number(item.incomingUnits), 0)),
    calculatedNet: round(items.reduce((sum, item) => sum + number(item.net), 0)),
  };
}
