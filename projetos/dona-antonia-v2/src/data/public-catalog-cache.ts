export type CatalogCacheSource = 'network' | 'cache';

export interface CatalogCacheResult<T> {
  readonly value: T;
  readonly source: CatalogCacheSource;
  readonly stale: boolean;
  readonly fetchedAt: number;
}

interface CacheEntry<T> {
  readonly value: T;
  readonly fetchedAt: number;
}

export interface PublicCatalogCacheOptions {
  readonly freshForMs?: number;
  readonly staleForMs?: number;
  readonly now?: () => number;
}

/**
 * Cache em memória para a projeção pública. Não usa localStorage: o snapshot
 * pode mudar no admin e não deve sobreviver a uma sessão com dados obsoletos.
 */
export function createPublicCatalogCache<T>(options: PublicCatalogCacheOptions = {}) {
  const freshForMs = options.freshForMs ?? 30_000;
  const staleForMs = options.staleForMs ?? 120_000;
  const now = options.now ?? Date.now;
  let entry: CacheEntry<T> | undefined;
  let pending: Promise<CatalogCacheResult<T>> | undefined;
  let generation = 0;

  const fetchNetwork = async (
    fetcher: (signal?: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<CatalogCacheResult<T>> => {
    const requestGeneration = generation;
    const value = await fetcher(signal);
    const fetchedAt = now();
    if (requestGeneration === generation) entry = { value, fetchedAt };
    return { value, source: 'network', stale: false, fetchedAt };
  };

  const revalidate = (fetcher: (signal?: AbortSignal) => Promise<T>, signal?: AbortSignal) => {
    if (!pending) {
      const network = fetchNetwork(fetcher, signal);
      const wrapped = network.finally(() => {
        if (pending === wrapped) pending = undefined;
      });
      pending = wrapped;
    }
    return pending;
  };

  return {
    async get(
      fetcher: (signal?: AbortSignal) => Promise<T>,
      signal?: AbortSignal,
    ): Promise<CatalogCacheResult<T>> {
      const age = entry ? Math.max(0, now() - entry.fetchedAt) : Number.POSITIVE_INFINITY;
      if (entry && age <= freshForMs) {
        return { value: entry.value, source: 'cache', stale: false, fetchedAt: entry.fetchedAt };
      }
      if (entry && age <= staleForMs) {
        void revalidate(fetcher, signal).catch(() => undefined);
        return { value: entry.value, source: 'cache', stale: true, fetchedAt: entry.fetchedAt };
      }
      return revalidate(fetcher, signal);
    },
    invalidate() {
      generation += 1;
      entry = undefined;
      pending = undefined;
    },
    get fetchedAt() {
      return entry?.fetchedAt;
    },
  };
}
