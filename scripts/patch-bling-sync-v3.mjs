import fs from 'node:fs';

const syncPath = 'scripts/sincronizar-bling-v2.mjs';
const offersPath = 'scripts/processar-ofertas.mjs';
const filterPath = 'producao-v2/js/product-delete-filter.js';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, content) => fs.writeFileSync(path, content, 'utf8');
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  const count = content.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: esperado 1 trecho, encontrado ${count}`);
  return content.replace(before, after);
}

let sync = read(syncPath);
sync = replaceOnce(sync, "const SOFT_DELETE_STATUS = 'E';", "const SOFT_DELETE_STATUS = 'I';", 'inativação segura');
sync = replaceOnce(sync,
"  optional(estoque, 'crossdocking', sourceNumber(source, 'crossDocking', 'crossdocking'));",
"  optional(estoque, 'crossDocking', sourceNumber(source, 'crossDocking', 'crossdocking'));",
'crossDocking');
sync = replaceOnce(sync,
"  optional(dimensoes, 'unidadeMedida', sourceNumber(source, 'unidadeMedida', 'unidade_medida'));",
"  optional(dimensoes, 'unidadeMedida', sourceText(source, 'unidadeMedida', 'unidade_medida'));",
'unidadeMedida textual');

sync = replaceOnce(sync,
`function resolveExisting(product, previous, indexes) {
  const stateId = text(previous?.blingId);
  const stateRow = stateId ? indexes.byId.get(stateId) : null;
  const codeRow = indexes.byCode.get(product.codigo) || null;

  if (stateRow && codeRow && String(stateRow.id) !== String(codeRow.id)) {
    return { row: codeRow, matchedBy: 'codigo-remapeado', staleStateRow: stateRow };
  }
  if (codeRow) return { row: codeRow, matchedBy: 'codigo' };
  if (stateRow) return { row: stateRow, matchedBy: 'state-id' };

  const previousCode = text(previous?.codigo);
  if (previousCode && indexes.byCode.has(previousCode)) return { row: indexes.byCode.get(previousCode), matchedBy: 'codigo-anterior' };
  if (product.gtin && indexes.byGtin.has(product.gtin)) return { row: indexes.byGtin.get(product.gtin), matchedBy: 'gtin' };
  return { row: null, matchedBy: '' };
}`,
`function resolveExisting(product, previous, indexes) {
  const stateId = text(previous?.blingId);
  const stateRow = stateId ? indexes.byId.get(stateId) : null;
  const codeRow = indexes.byCode.get(product.codigo) || null;

  // O ID histórico é a identidade principal. Nunca remapeamos silenciosamente
  // para outro produto apenas porque o código atual já está ocupado no Bling.
  if (stateRow) {
    if (codeRow && String(stateRow.id) !== String(codeRow.id)) {
      return { row: stateRow, matchedBy: 'state-id', codeConflictRow: codeRow };
    }
    return { row: stateRow, matchedBy: 'state-id' };
  }
  if (codeRow) return { row: codeRow, matchedBy: 'codigo' };

  const previousCode = text(previous?.codigo);
  if (previousCode && indexes.byCode.has(previousCode)) return { row: indexes.byCode.get(previousCode), matchedBy: 'codigo-anterior' };
  if (product.gtin && indexes.byGtin.has(product.gtin)) return { row: indexes.byGtin.get(product.gtin), matchedBy: 'gtin' };
  return { row: null, matchedBy: '' };
}`,
'identidade principal pelo ID histórico');

sync = replaceOnce(sync,
`async function patchProduct(id, patch) {
  const response = await apiFetch(\`/produtos/\${encodeURIComponent(id)}\`, {
    method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(patch)
  }, { label: \`PATCH produto \${patch.codigo}\` });
  const body = await response.json().catch(() => ({}));
  return body?.data?.id || id;
}`,
`async function productDetail(id) {
  const response = await apiFetch(\`/produtos/\${encodeURIComponent(id)}\`, { headers: authHeaders() }, { label: \`Detalhe do produto Bling \${id}\` });
  return (await response.json())?.data || {};
}

function completeProductPayload(detail, patch, existing = {}) {
  const allowed = [
    'nome', 'codigo', 'preco', 'tipo', 'formato', 'descricaoCurta', 'descricaoComplementar',
    'dataValidade', 'unidade', 'pesoLiquido', 'pesoBruto', 'volumes', 'itensPorCaixa',
    'gtin', 'gtinEmbalagem', 'tipoProducao', 'condicao', 'freteGratis', 'marca',
    'observacoes', 'linkExterno', 'estoque', 'dimensoes', 'tributacao', 'midia', 'categoria'
  ];
  const payload = {};
  for (const key of allowed) {
    if (detail[key] !== undefined && detail[key] !== null) payload[key] = detail[key];
  }
  Object.assign(payload, patch);
  payload.tipo = text(payload.tipo || existing.tipo || 'P');
  payload.formato = text(payload.formato || existing.formato || 'S');
  delete payload.id;
  delete payload.situacao;
  return payload;
}

async function updateProduct(id, patch, existing) {
  const detail = await productDetail(id);
  const payload = completeProductPayload(detail, patch, existing);
  const response = await apiFetch(\`/produtos/\${encodeURIComponent(id)}\`, {
    method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(payload)
  }, { label: \`PUT produto \${patch.codigo}\` });
  const body = await response.json().catch(() => ({}));
  return body?.data?.id || id;
}`,
'PUT completo do produto');

sync = replaceOnce(sync,
"      const resolved = resolveExisting(product, previous, indexes);\n      let existing = resolved.row;\n      if (resolved.matchedBy === 'state-id') report.matchedByStateId++;",
"      const resolved = resolveExisting(product, previous, indexes);\n      let existing = resolved.row;\n      if (resolved.matchedBy === 'state-id') report.matchedByStateId++;\n      if (resolved.codeConflictRow) {\n        report.conflicts.push({\n          firebaseKey: product.firebaseKey,\n          codigo: product.codigo,\n          gtin: product.gtin,\n          blingIdHistorico: existing?.id,\n          blingIdQueJaUsaOCodigo: resolved.codeConflictRow.id,\n          reason: 'O código atual já pertence a outro produto no Bling. O ID histórico foi preservado e nenhuma alteração foi aplicada.'\n        });\n        continue;\n      }",
'bloqueio de conflito de código');

sync = sync.replace(/\n      if \(!duplicateRows\.length && resolved\.staleStateRow\) \{[\s\S]*?\n      \}\n\n      const legacyEntry/, '\n\n      const legacyEntry');

sync = replaceOnce(sync,
"      const currentStatus = text(existing?.situacao).toUpperCase();\n      const wasDeleted = text(previous.status) === 'E' || Boolean(previous.deletedAt);\n      const statusNeedsSync = existing\n        ? product.status !== currentStatus || (wasDeleted && product.status !== 'E')\n        : product.status === 'E';",
"      const currentStatus = text(existing?.situacao).toUpperCase();\n      const desiredBlingStatus = product.status === 'E' ? 'I' : product.status;\n      const wasDeleted = text(previous.status) === 'E' || Boolean(previous.deletedAt);\n      const statusNeedsSync = existing\n        ? desiredBlingStatus !== currentStatus || (wasDeleted && desiredBlingStatus !== 'I')\n        : product.status === 'E';",
'comparação da situação Bling');

sync = replaceOnce(sync,
"        if (APPLY) await patchProduct(id, patch);",
"        if (APPLY) await updateProduct(id, patch, existing);",
'uso do PUT completo');
sync = replaceOnce(sync,
"        if (APPLY && !String(id).startsWith('novo:')) await setProductStatus(id, product.status, product.codigo);",
"        if (APPLY && !String(id).startsWith('novo:')) await setProductStatus(id, desiredBlingStatus, product.codigo);",
'situação normalizada');
sync = replaceOnce(sync,
"          status: product.status,\n          syncedAt: new Date().toISOString(),",
"          status: product.status,\n          blingStatus: desiredBlingStatus,\n          syncedAt: new Date().toISOString(),",
'estado da situação Bling');

write(syncPath, sync);

let offers = read(offersPath);
const oldWrite = "    writeJson(PRODUCTS_HOME_PATH, Object.fromEntries(Object.entries(result.products).map(([key, product]) => [key, homeProduct(key, product)]))),";
const newWrite = "    writeJson(PRODUCTS_HOME_PATH, Object.fromEntries(Object.entries(result.products)\n      .filter(([, product]) => productEligible(product, new Date()))\n      .map(([key, product]) => [key, homeProduct(key, product)]))),";
if (offers.includes(oldWrite)) offers = offers.replace(oldWrite, newWrite);
write(offersPath, offers);

let filter = read(filterPath);
if (!filter.includes('function forget(key)')) {
  filter = replaceOnce(filter,
`  function remember(key) {
    const normalized = text(decodeURIComponent(text(key)));
    if (!normalized) return;
    const map = readMap();
    map[normalized] = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  }`,
`  function remember(key) {
    const normalized = text(decodeURIComponent(text(key)));
    if (!normalized) return;
    const map = readMap();
    map[normalized] = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  }

  function forget(key) {
    const normalized = text(decodeURIComponent(text(key)));
    if (!normalized) return;
    const map = readMap();
    if (!Object.prototype.hasOwnProperty.call(map, normalized)) return;
    delete map[normalized];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  }`, 'forget restaurado');
  filter = filter.replace('window.AdminV2DeletedProducts = { remember, filterData, keys: () => [...deletedSet()] };', 'window.AdminV2DeletedProducts = { remember, forget, filterData, keys: () => [...deletedSet()] };');
}
write(filterPath, filter);

console.log('Patch Bling V3 aplicado.');
