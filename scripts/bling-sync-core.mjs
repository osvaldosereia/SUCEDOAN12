const text = value => String(value ?? '').trim();

export const digits = value => text(value).replace(/\D/g, '');

export function isValidGtin(value) {
  const gtin = digits(value);
  if (![8, 12, 13, 14].includes(gtin.length)) return false;
  const expected = Number(gtin.at(-1));
  let sum = 0;
  for (let index = gtin.length - 2, offset = 0; index >= 0; index--, offset++) {
    sum += Number(gtin[index]) * (offset % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === expected;
}

export function normalizeDate(value) {
  const raw = text(value);
  if (!raw) return '';
  let year;
  let month;
  let day;
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (match) [, year, month, day] = match;
  else {
    match = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    if (!match) return '';
    [, day, month, year] = match;
  }
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return '';
  return `${year}-${month}-${day}`;
}

export function normalizeStatus(value) {
  return text(value).toUpperCase() === 'I' ? 'I' : 'A';
}

export function resolveProduct(product, previous, maps) {
  const stateId = text(previous?.blingId);
  const stateRow = stateId ? maps.byId.get(stateId) || null : null;
  const duplicateRows = maps.duplicateCodes.get(product.codigo) || [];

  if (duplicateRows.length) {
    const stateMatch = stateId ? duplicateRows.find(row => String(row.id) === stateId) : null;
    const gtinMatches = product.gtin
      ? duplicateRows.filter(row => digits(row.gtin || row.ean) === product.gtin)
      : [];
    const canonical = stateMatch || (gtinMatches.length === 1 ? gtinMatches[0] : null);
    if (!canonical) return { conflict: 'codigo_duplicado', rows: duplicateRows };
    return {
      row: canonical,
      matchedBy: stateMatch ? 'state-id-entre-duplicados' : 'gtin-entre-duplicados'
    };
  }

  const codeRow = maps.byCode.get(product.codigo) || null;
  if (codeRow) {
    if (stateRow && String(stateRow.id) !== String(codeRow.id)) {
      return { row: codeRow, matchedBy: 'codigo-remapeado', staleStateRow: stateRow };
    }
    return { row: codeRow, matchedBy: stateRow ? 'state-id' : 'codigo' };
  }
  if (stateRow) return { row: stateRow, matchedBy: 'state-id' };
  if (product.gtin && maps.byGtin.has(product.gtin)) return { row: maps.byGtin.get(product.gtin), matchedBy: 'gtin' };
  return { row: null, matchedBy: '' };
}

export function buildCompleteProductPayload(current, desired, summary, status) {
  const allowed = [
    'nome', 'codigo', 'preco', 'tipo', 'formato', 'descricaoCurta', 'descricaoComplementar',
    'dataValidade', 'unidade', 'pesoLiquido', 'pesoBruto', 'volumes', 'itensPorCaixa',
    'gtin', 'gtinEmbalagem', 'tipoProducao', 'condicao', 'freteGratis', 'marca',
    'observacoes', 'linkExterno', 'estoque', 'dimensoes', 'tributacao', 'midia', 'categoria'
  ];
  const payload = {};
  for (const key of allowed) {
    if (current?.[key] !== undefined && current[key] !== null) payload[key] = current[key];
  }
  Object.assign(payload, desired);
  payload.tipo = text(payload.tipo || summary?.tipo || 'P');
  payload.formato = text(payload.formato || summary?.formato || 'S');
  payload.situacao = normalizeStatus(status);
  delete payload.id;
  return payload;
}
