import { readFileSync, writeFileSync } from 'node:fs';

const path = 'scripts/sincronizar-bling-v2.mjs';
let source = readFileSync(path, 'utf8');

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: esperado 1 trecho, encontrado ${count}.`);
  source = source.replace(before, after);
}

replaceOnce(
`function productIndexes(rows) {
  const byId = new Map();
  const byCode = new Map();
  const gtinBuckets = new Map();
  for (const row of rows) {
    if (row?.id === undefined || row?.id === null) continue;
    byId.set(String(row.id), row);
    if (text(row.codigo)) byCode.set(text(row.codigo), row);
    const gtin = text(row.gtin || row.ean);
    if (gtin) {
      if (!gtinBuckets.has(gtin)) gtinBuckets.set(gtin, []);
      gtinBuckets.get(gtin).push(row);
    }
  }
  const byGtin = new Map([...gtinBuckets].filter(([, values]) => values.length === 1).map(([key, values]) => [key, values[0]]));
  return { byId, byCode, byGtin };
}

function resolveExisting(product, previous, indexes) {
  const stateId = text(previous?.blingId);
  if (stateId && indexes.byId.has(stateId)) return { row: indexes.byId.get(stateId), matchedBy: 'state-id' };
  if (indexes.byCode.has(product.codigo)) return { row: indexes.byCode.get(product.codigo), matchedBy: 'codigo' };
  const previousCode = text(previous?.codigo);
  if (previousCode && indexes.byCode.has(previousCode)) return { row: indexes.byCode.get(previousCode), matchedBy: 'codigo-anterior' };
  if (product.gtin && indexes.byGtin.has(product.gtin)) return { row: indexes.byGtin.get(product.gtin), matchedBy: 'gtin' };
  return { row: null, matchedBy: '' };
}`,
`function productIndexes(rows) {
  const byId = new Map();
  const codeBuckets = new Map();
  const gtinBuckets = new Map();
  for (const row of rows) {
    if (row?.id === undefined || row?.id === null) continue;
    byId.set(String(row.id), row);
    const codigo = text(row.codigo);
    if (codigo) {
      if (!codeBuckets.has(codigo)) codeBuckets.set(codigo, []);
      codeBuckets.get(codigo).push(row);
    }
    const gtin = text(row.gtin || row.ean);
    if (gtin) {
      if (!gtinBuckets.has(gtin)) gtinBuckets.set(gtin, []);
      gtinBuckets.get(gtin).push(row);
    }
  }
  const byCode = new Map([...codeBuckets].filter(([, values]) => values.length === 1).map(([key, values]) => [key, values[0]]));
  const duplicateCodes = new Map([...codeBuckets].filter(([, values]) => values.length > 1));
  const byGtin = new Map([...gtinBuckets].filter(([, values]) => values.length === 1).map(([key, values]) => [key, values[0]]));
  return { byId, byCode, duplicateCodes, byGtin };
}

function resolveExisting(product, previous, indexes) {
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
'Índices e resolução de identidade'
);

replaceOnce(
`    if (id === undefined) {
      report.categoriesPlanned++;
      if (!APPLY) return null;
      const payload = { descricao };
      if (parentId) payload.categoriaPai = { id: parentId };
      const response = await apiFetch('/categorias/produtos', {
        method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(payload)
      }, { label: \`Criar categoria \${descricao}\` });
      id = (await response.json())?.data?.id;
      if (id === undefined || id === null) throw new Error(\`Categoria \${descricao}: Bling não retornou ID.\`);
      categories.set(key, id);
      report.categoriesCreated++;
    } else report.categoriesReused++;`,
`    if (id === undefined) {
      report.categoriesPlanned++;
      if (!APPLY) {
        id = \`dry-category-\${categories.size + 1}\`;
        categories.set(key, id);
      } else {
        const payload = { descricao };
        if (parentId) payload.categoriaPai = { id: parentId };
        const response = await apiFetch('/categorias/produtos', {
          method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(payload)
        }, { label: \`Criar categoria \${descricao}\` });
        id = (await response.json())?.data?.id;
        if (id === undefined || id === null) throw new Error(\`Categoria \${descricao}: Bling não retornou ID.\`);
        categories.set(key, id);
        report.categoriesCreated++;
      }
    } else report.categoriesReused++;`,
'Categorias simuladas sem duplicação'
);

replaceOnce(
`  report.suppliersPlanned++;
  if (!APPLY) return null;
  const response = await apiFetch('/contatos', {
    method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ nome: supplier.nome, situacao: 'A' })
  }, { label: \`Criar fornecedor \${supplier.nome}\` });
  const id = (await response.json())?.data?.id;
  if (id === undefined || id === null) throw new Error(\`Fornecedor \${supplier.nome}: Bling não retornou ID.\`);
  contacts.set(key, id);
  report.suppliersCreated++;
  return id;`,
`  report.suppliersPlanned++;
  if (!APPLY) {
    const id = \`dry-supplier-\${contacts.size + 1}\`;
    contacts.set(key, id);
    return id;
  }
  const response = await apiFetch('/contatos', {
    method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ nome: supplier.nome, situacao: 'A' })
  }, { label: \`Criar fornecedor \${supplier.nome}\` });
  const id = (await response.json())?.data?.id;
  if (id === undefined || id === null) throw new Error(\`Fornecedor \${supplier.nome}: Bling não retornou ID.\`);
  contacts.set(key, id);
  report.suppliersCreated++;
  return id;`,
'Fornecedores simulados sem duplicação'
);

replaceOnce(
`  firebaseProducts: 0, blingProducts: 0, selected: 0, created: 0, updated: 0, unchanged: 0,
  statusUpdated: 0, softDeleted: 0, restored: 0, codeChanges: 0, matchedByStateId: 0,`,
`  firebaseProducts: 0, blingProducts: 0, selected: 0, created: 0, updated: 0, unchanged: 0, baselined: 0,
  statusUpdated: 0, softDeleted: 0, restored: 0, codeChanges: 0, matchedByStateId: 0, relinked: 0,`,
'Contadores de migração'
);

replaceOnce(
`  deferred: 0, invalid: [], conflicts: [], errors: []
};`,
`  deferred: 0, invalid: [], staleLinks: [], conflicts: [], errors: []
};`,
'Detalhes de remapeamento'
);

replaceOnce(
`      let existing = resolved.row;
      if (resolved.matchedBy === 'state-id') report.matchedByStateId++;
      if (existing && indexes.byCode.has(product.codigo) && String(indexes.byCode.get(product.codigo).id) !== String(existing.id)) {
        report.conflicts.push({ firebaseKey: product.firebaseKey, codigo: product.codigo, reason: \`Código já pertence ao produto Bling \${indexes.byCode.get(product.codigo).id}.\` });
        continue;
      }

      const codeChanged = text(previous.codigo) !== product.codigo;
      const statusChanged = text(previous.status) !== product.status;
      const hashChanged = previous.hash !== product.hash;
      const previousSyncedAt = timestamp(previous.syncedAt);
      const dataChanged = !existing || (hashChanged && !(previousSyncedAt && product.changedAt && product.changedAt <= previousSyncedAt));
      const changed = dataChanged || codeChanged || statusChanged || !existing;
      if (!changed && !SYNC_STOCK) {
        if (APPLY && hashChanged) {
          state.products[product.firebaseKey] = { ...previous, hash: product.hash, codigo: product.codigo, status: product.status, migratedAt: new Date().toISOString() };
        }
        report.unchanged++;
        continue;
      }

      let categoryId = null;
      if (product.categoryPath.length) categoryId = await ensureCategoryPath(product.categoryPath, categories, report);
      const patch = structuredClone(product.patch);
      if (categoryId) patch.categoria = { id: categoryId };

      let id = existing?.id || null;
      const wasDeleted = text(previous.status) === 'E' || Boolean(previous.deletedAt);`,
`      let existing = resolved.row;
      if (resolved.matchedBy === 'state-id') report.matchedByStateId++;
      if (indexes.duplicateCodes.has(product.codigo)) {
        report.conflicts.push({
          firebaseKey: product.firebaseKey,
          codigo: product.codigo,
          blingIds: indexes.duplicateCodes.get(product.codigo).map(row => row.id),
          reason: 'Há mais de um produto no Bling com o mesmo código.'
        });
        continue;
      }
      if (resolved.staleStateRow) {
        report.relinked++;
        report.staleLinks.push({
          firebaseKey: product.firebaseKey,
          codigo: product.codigo,
          gtin: product.gtin,
          blingIdAnterior: resolved.staleStateRow.id,
          codigoAnteriorNoBling: text(resolved.staleStateRow.codigo),
          blingIdCanonico: existing?.id,
          motivo: 'O código atual já pertence a outro ID; a sincronização foi remapeada para o ID do código atual sem excluir o registro antigo.'
        });
      }

      const codeChanged = Boolean(existing && text(existing.codigo) !== product.codigo);
      const hashChanged = previous.hash !== product.hash;
      const previousSyncedAt = timestamp(previous.syncedAt);
      const reliableTimestamp = previousSyncedAt > 0 && product.changedAt > 0;
      const dataChanged = !existing || codeChanged || (hashChanged && reliableTimestamp && product.changedAt > previousSyncedAt);
      const currentStatus = text(existing?.situacao).toUpperCase();
      const wasDeleted = text(previous.status) === 'E' || Boolean(previous.deletedAt);
      const statusNeedsSync = existing
        ? product.status !== currentStatus || (wasDeleted && product.status !== 'E')
        : product.status === 'E';
      const nextSupplierHash = product.supplier ? sha256(product.supplier) : '';
      const supplierNeedsSync = Boolean(product.supplier && (previous.supplierHash !== nextSupplierHash || !previous.supplierLinkId));
      const baselineMigration = Boolean(existing && hashChanged && !dataChanged);
      const changed = dataChanged || statusNeedsSync || supplierNeedsSync || !existing;

      if (!changed && !SYNC_STOCK) {
        if (APPLY && existing) {
          state.products[product.firebaseKey] = {
            ...previous,
            hash: product.hash,
            blingId: existing.id,
            codigo: product.codigo,
            status: product.status,
            syncedAt: previous.syncedAt || new Date().toISOString(),
            migratedAt: baselineMigration ? new Date().toISOString() : previous.migratedAt,
            deletedAt: null
          };
        }
        if (baselineMigration) report.baselined++; else report.unchanged++;
        continue;
      }

      let categoryId = null;
      if (dataChanged && product.categoryPath.length) categoryId = await ensureCategoryPath(product.categoryPath, categories, report);
      const patch = structuredClone(product.patch);
      if (categoryId) patch.categoria = { id: categoryId };

      let id = existing?.id || null;`,
'Seleção segura de alterações'
);

replaceOnce(
`      } else if (dataChanged || codeChanged) {
        if (text(previous.codigo) && text(previous.codigo) !== product.codigo) report.codeChanges++;
        if (APPLY) await patchProduct(id, patch);
        report.updated++;
      }

      const currentStatus = text(existing?.situacao).toUpperCase();
      if (product.status !== currentStatus || wasDeleted) {
        if (APPLY && !String(id).startsWith('novo:')) await setProductStatus(id, product.status, product.codigo);
        report.statusUpdated++;
        if (wasDeleted && product.status !== 'E') report.restored++;
      }

      let supplierLinkId = previous.supplierLinkId;
      let supplierHash = previous.supplierHash;
      if (product.supplier) {
        const supplierId = await ensureSupplier(product.supplier, contacts, report);
        const nextSupplierHash = sha256(product.supplier);
        if (APPLY && supplierId && !String(id).startsWith('novo:') && (supplierHash !== nextSupplierHash || !supplierLinkId)) {
          supplierLinkId = await upsertSupplierLink(id, supplierId, product.supplier, supplierLinks, report);
        }
        supplierHash = nextSupplierHash;
      }`,
`      } else if (dataChanged) {
        if (codeChanged) report.codeChanges++;
        if (APPLY) await patchProduct(id, patch);
        report.updated++;
      }

      if (statusNeedsSync) {
        if (APPLY && !String(id).startsWith('novo:')) await setProductStatus(id, product.status, product.codigo);
        report.statusUpdated++;
        if (wasDeleted && product.status !== 'E') report.restored++;
      }

      let supplierLinkId = previous.supplierLinkId;
      let supplierHash = previous.supplierHash;
      if (supplierNeedsSync) {
        const supplierId = await ensureSupplier(product.supplier, contacts, report);
        if (APPLY && supplierId && !String(id).startsWith('novo:')) {
          supplierLinkId = await upsertSupplierLink(id, supplierId, product.supplier, supplierLinks, report);
        }
        supplierHash = nextSupplierHash;
      }`,
'Atualização parcial e fornecedor'
);

writeFileSync(path, source, 'utf8');
console.log('Migração segura do sincronizador Bling aplicada.');
