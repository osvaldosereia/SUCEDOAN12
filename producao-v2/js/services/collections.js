import { catalogVersionPayload } from '../core/catalog.js';
import { COLLECTION_PATHS, normalizeCollectionForPublish } from '../core/collections.js?admin_build=20260814-cestas-limites-v1';
import { clone, text } from '../core/utils.js';
import { readJsonFile, upsertText } from './github.js';

function normalizeForCompare(value) {
  if (value === undefined) return null;
  if (typeof value === 'string') return value.replace(/\r\n?/g, '\n').trim();
  if (Array.isArray(value)) return value.map(normalizeForCompare);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalizeForCompare(value[key])]));
  }
  return value;
}

function equalValue(a, b) {
  return JSON.stringify(normalizeForCompare(a)) === JSON.stringify(normalizeForCompare(b));
}

function changedFields(before = {}, after = {}) {
  const fields = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...fields].filter(field => !equalValue(before?.[field], after?.[field]));
}

function collectionId(value) {
  return text(value?.id);
}

function mergeTarget(remoteList, localList, options = {}) {
  const changedId = text(options.changedId);
  const previousId = text(options.previousId || changedId);
  const deletedId = text(options.deletedId);
  const remote = Array.isArray(remoteList) ? clone(remoteList) : [];
  const local = Array.isArray(localList) ? clone(localList) : [];

  if (deletedId) return remote.filter(item => collectionId(item) !== deletedId);
  if (!changedId) return local;

  const localTarget = local.find(item => collectionId(item) === changedId)
    || local.find(item => collectionId(item) === previousId);
  if (!localTarget) throw new Error('O cadastro alterado não foi encontrado na lista local.');

  const remoteIndex = remote.findIndex(item => [previousId, changedId].includes(collectionId(item)));
  const remoteTarget = remoteIndex >= 0 ? remote[remoteIndex] : null;
  let mergedTarget;

  const explicitFields = Array.isArray(options.changedFields) ? options.changedFields.map(text).filter(Boolean) : [];
  if (remoteTarget && explicitFields.length) {
    mergedTarget = clone(remoteTarget);
    for (const field of explicitFields) {
      if (localTarget[field] === undefined) delete mergedTarget[field];
      else mergedTarget[field] = clone(localTarget[field]);
    }
  } else if (remoteTarget && options.originalCollection) {
    mergedTarget = clone(remoteTarget);
    for (const field of changedFields(options.originalCollection, localTarget)) {
      if (localTarget[field] === undefined) delete mergedTarget[field];
      else mergedTarget[field] = clone(localTarget[field]);
    }
  } else {
    mergedTarget = clone(localTarget);
  }

  mergedTarget.id = changedId;
  mergedTarget.atualizado_em = new Date().toISOString();
  const cleaned = remote.filter(item => ![previousId, changedId].includes(collectionId(item)));
  const insertAt = remoteIndex >= 0 ? Math.min(remoteIndex, cleaned.length) : cleaned.length;
  cleaned.splice(insertAt, 0, mergedTarget);
  return cleaned;
}

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(String(value ?? ''));
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

async function writeCollectionFile(config, path, localList, products, queue, type, options) {
  const cleanPath = text(path).replace(/^\/+/, '');
  const isKit = type === 'kit';
  const preserveInvalidExisting = options.preserveInvalidExisting !== false;
  const changedId = text(options.changedId);
  const deletedId = text(options.deletedId);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const currentFile = await readJsonFile(config, cleanPath).catch(error => {
      if (/404|não contém/.test(String(error?.message || error))) return null;
      throw error;
    });
    const remoteList = Array.isArray(currentFile?.data) ? currentFile.data : [];
    const merged = mergeTarget(remoteList, localList, options);
    const normalized = [];

    for (const collection of merged) {
      const result = normalizeCollectionForPublish(collection, type, products, queue);
      const id = collectionId(collection);
      const changedTarget = changedId && id === changedId;
      if (result.audit.errors.length) {
        if (!preserveInvalidExisting || changedTarget) {
          throw new Error(`${text(collection?.nome) || text(collection?.codigo) || 'Coleção'}: ${result.audit.errors.join(', ')}.`);
        }
        normalized.push(clone(collection));
        continue;
      }
      normalized.push(result.normalized);
    }

    const normalizedContent = `${JSON.stringify(normalized, null, 2).trimEnd()}\n`;
    const currentContent = currentFile?.content ? `${String(currentFile.content).replace(/\r\n/g, '\n').trimEnd()}\n` : '';
    if (currentContent === normalizedContent) {
      return { path: cleanPath, skipped: true, sha: currentFile?.sha || '', list: normalized };
    }

    const url = `https://api.github.com/repos/${encodeURIComponent(config.githubOwner)}/${encodeURIComponent(config.githubRepo)}/contents/${cleanPath.split('/').map(encodeURIComponent).join('/')}`;
    const body = {
      message: `Atualiza ${isKit ? 'kits' : 'cestas'} pelo Admin V2 Dona Antônia`,
      branch: config.githubBranch,
      content: utf8ToBase64(normalizedContent),
      ...(currentFile?.sha ? { sha: currentFile.sha } : {}),
    };
    const response = await fetch(url, {
      method: 'PUT',
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${text(config.githubToken)}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const result = await response.json().catch(() => null);
      return {
        path: cleanPath,
        skipped: false,
        sha: result?.content?.sha || '',
        commit: result?.commit?.sha || '',
        list: normalized,
        mergedId: changedId || '',
        deletedId,
      };
    }

    const detail = await response.text().catch(() => '');
    if (![409, 422].includes(response.status) || attempt === 5) {
      throw new Error(`GitHub retornou ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ''}`);
    }
    await new Promise(resolve => setTimeout(resolve, attempt * 350));
  }

  throw new Error(`Não foi possível atualizar ${cleanPath}.`);
}

export async function loadCollections(config) {
  const [basketsFile, kitsFile, queueFile] = await Promise.all([
    readJsonFile(config, config.basketsPath || COLLECTION_PATHS.baskets),
    readJsonFile(config, config.kitsPath || COLLECTION_PATHS.kits),
    readJsonFile(config, config.kitQueuePath || COLLECTION_PATHS.kitQueue).catch(() => null),
  ]);
  return {
    baskets: Array.isArray(basketsFile?.data) ? basketsFile.data : [],
    kits: Array.isArray(kitsFile?.data) ? kitsFile.data : [],
    queue: Array.isArray(queueFile?.data) ? queueFile.data : [],
    shas: { baskets: basketsFile?.sha || '', kits: kitsFile?.sha || '', queue: queueFile?.sha || '' },
  };
}

export async function saveCollectionList(config, type, list, products, queue = [], options = {}) {
  if (!config.writeMode) throw new Error('O modo geral de gravação da V2 está bloqueado.');
  if (!config.collectionsWriteMode) throw new Error('A gravação de cestas e kits está bloqueada.');
  if (!text(config.githubToken)) throw new Error('Configuração incompleta: token GitHub.');
  const isKit = type === 'kit';
  const path = isKit ? (config.kitsPath || COLLECTION_PATHS.kits) : (config.basketsPath || COLLECTION_PATHS.baskets);

  const collectionResult = await writeCollectionFile(config, path, list, products, queue, type, options);
  let versionResult = { path: config.catalogVersionPath || 'catalog-version.json', skipped: true };
  if (!collectionResult.skipped) {
    const changed = [isKit ? 'kits' : 'baskets', 'merchant', 'meta', 'sitemap'];
    versionResult = await upsertText(
      config,
      config.catalogVersionPath || 'catalog-version.json',
      JSON.stringify(catalogVersionPayload(config, changed), null, 2),
      `Atualiza versão do catálogo após ${isKit ? 'kits' : 'cestas'} pelo Admin V2`,
    );
  }

  return {
    ...collectionResult,
    collection: collectionResult,
    version: versionResult,
    list: clone(collectionResult.list || []),
    type,
    savedAt: new Date().toISOString(),
  };
}

export { changedFields, equalValue, mergeTarget };
