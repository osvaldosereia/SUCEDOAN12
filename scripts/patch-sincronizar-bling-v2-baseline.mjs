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
  "const SOFT_DELETE_STATUS = 'E';\nlet lastRequestAt = 0;",
  "const SOFT_DELETE_STATUS = 'E';\nconst SYNC_SCHEMA_VERSION = 2;\nlet lastRequestAt = 0;",
  'Versão do estado',
);

replaceOnce(
  "  statusUpdated: 0, softDeleted: 0, restored: 0, codeChanges: 0, matchedByStateId: 0, relinked: 0,",
  "  statusUpdated: 0, softDeleted: 0, restored: 0, codeChanges: 0, matchedByStateId: 0, relinked: 0, duplicateResolved: 0,",
  'Contador de duplicidades resolvidas',
);

replaceOnce(
  "  deferred: 0, invalid: [], staleLinks: [], conflicts: [], errors: []",
  "  deferred: 0, invalid: [], staleLinks: [], duplicateLinks: [], conflicts: [], errors: []",
  'Detalhes de duplicidades',
);

replaceOnce(
`        state.products[firebaseKey] = { ...entry, status: SOFT_DELETE_STATUS, deletedAt: new Date().toISOString(), syncedAt: new Date().toISOString() };`,
`        state.products[firebaseKey] = {
          ...entry,
          syncSchemaVersion: SYNC_SCHEMA_VERSION,
          status: SOFT_DELETE_STATUS,
          deletedAt: new Date().toISOString(),
          syncedAt: new Date().toISOString()
        };`,
  'Versão do estado em exclusões',
);

replaceOnce(
`      const resolved = resolveExisting(product, previous, indexes);
      let existing = resolved.row;
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
      if (resolved.staleStateRow) {`,
`      const resolved = resolveExisting(product, previous, indexes);
      let existing = resolved.row;
      if (resolved.matchedBy === 'state-id') report.matchedByStateId++;

      const duplicateRows = indexes.duplicateCodes.get(product.codigo) || [];
      if (duplicateRows.length) {
        const stateId = text(previous.blingId);
        const stateMatch = stateId ? duplicateRows.find(row => String(row.id) === stateId) : null;
        const gtinMatches = product.gtin
          ? duplicateRows.filter(row => text(row.gtin || row.ean) === product.gtin)
          : [];
        const canonical = stateMatch || (gtinMatches.length === 1 ? gtinMatches[0] : null);
        const matchedBy = stateMatch ? 'state-id' : gtinMatches.length === 1 ? 'gtin' : '';
        if (!canonical) {
          report.conflicts.push({
            firebaseKey: product.firebaseKey,
            codigo: product.codigo,
            gtin: product.gtin,
            blingIds: duplicateRows.map(row => row.id),
            reason: 'Há mais de um produto no Bling com o mesmo código e não foi possível escolher um único registro pelo ID histórico ou GTIN.'
          });
          continue;
        }
        existing = canonical;
        const companions = duplicateRows.filter(row => String(row.id) !== String(canonical.id));
        report.duplicateResolved++;
        report.duplicateLinks.push({
          firebaseKey: product.firebaseKey,
          codigo: product.codigo,
          gtin: product.gtin,
          blingIdCanonico: canonical.id,
          resolvidoPor: matchedBy,
          outrosBlingIds: companions.map(row => row.id),
          observacao: 'Os demais registros não foram excluídos nem alterados automaticamente.'
        });
      }
      if (!duplicateRows.length && resolved.staleStateRow) {`,
  'Resolução segura de códigos duplicados',
);

replaceOnce(
`      const codeChanged = Boolean(existing && text(existing.codigo) !== product.codigo);
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
      }`,
`      const legacyEntry = Number(previous.syncSchemaVersion || 0) !== SYNC_SCHEMA_VERSION;
      const codeChanged = Boolean(existing && text(existing.codigo) !== product.codigo);
      const hashChanged = previous.hash !== product.hash;
      const previousSyncedAt = timestamp(previous.syncedAt);
      const reliableTimestamp = previousSyncedAt > 0 && product.changedAt > 0;
      const dataChanged = !existing
        || codeChanged
        || (!legacyEntry && hashChanged && reliableTimestamp && product.changedAt > previousSyncedAt);
      const currentStatus = text(existing?.situacao).toUpperCase();
      const wasDeleted = text(previous.status) === 'E' || Boolean(previous.deletedAt);
      const statusNeedsSync = existing
        ? product.status !== currentStatus || (wasDeleted && product.status !== 'E')
        : product.status === 'E';
      const nextSupplierHash = product.supplier ? sha256(product.supplier) : '';
      const supplierNeedsSync = Boolean(product.supplier && (previous.supplierHash !== nextSupplierHash || !previous.supplierLinkId));
      const baselineMigration = Boolean(existing && legacyEntry);
      const changed = dataChanged || statusNeedsSync || supplierNeedsSync || !existing;
      if (baselineMigration) report.baselined++;

      if (!changed && !SYNC_STOCK) {
        if (APPLY && existing) {
          state.products[product.firebaseKey] = {
            ...previous,
            syncSchemaVersion: SYNC_SCHEMA_VERSION,
            hash: product.hash,
            blingId: existing.id,
            codigo: product.codigo,
            status: product.status,
            syncedAt: previous.syncedAt || new Date().toISOString(),
            migratedAt: baselineMigration ? new Date().toISOString() : previous.migratedAt,
            deletedAt: null
          };
        }
        if (!baselineMigration) report.unchanged++;
        continue;
      }`,
  'Baseline seguro da migração',
);

replaceOnce(
`        state.products[product.firebaseKey] = {
          ...previous, hash: product.hash, blingId: id, codigo: product.codigo, status: product.status,
          syncedAt: new Date().toISOString(), deletedAt: null, supplierHash, supplierLinkId
        };`,
`        state.products[product.firebaseKey] = {
          ...previous,
          syncSchemaVersion: SYNC_SCHEMA_VERSION,
          hash: product.hash,
          blingId: id,
          codigo: product.codigo,
          status: product.status,
          syncedAt: new Date().toISOString(),
          deletedAt: null,
          supplierHash,
          supplierLinkId
        };`,
  'Versão do estado em produtos processados',
);

writeFileSync(path, source, 'utf8');
console.log('Baseline e resolução segura de duplicidades aplicados ao sincronizador Bling.');
