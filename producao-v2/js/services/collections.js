import { COLLECTION_PATHS, normalizeCollectionForPublish } from '../core/collections.js';
import { clone, text } from '../core/utils.js';
import { readJsonFile, upsertText } from './github.js';

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

export async function saveCollectionList(config, type, list, products, queue = []) {
  if (!config.writeMode) throw new Error('O modo geral de gravação da V2 está bloqueado.');
  if (!config.collectionsWriteMode) throw new Error('A gravação de cestas e kits está bloqueada.');
  const path = type === 'kit' ? (config.kitsPath || COLLECTION_PATHS.kits) : (config.basketsPath || COLLECTION_PATHS.baskets);
  const normalized = [];
  for (const collection of list || []) {
    const result = normalizeCollectionForPublish(collection, type, products, queue);
    if (result.audit.errors.length) throw new Error(`${text(collection?.nome) || text(collection?.codigo) || 'Coleção'}: ${result.audit.errors.join(', ')}.`);
    normalized.push(result.normalized);
  }
  const result = await upsertText(config, path, JSON.stringify(normalized, null, 2), `Atualiza ${type === 'kit' ? 'kits' : 'cestas'} pelo Admin V2 Dona Antônia`);
  return { ...result, list: clone(normalized), type, savedAt: new Date().toISOString() };
}
