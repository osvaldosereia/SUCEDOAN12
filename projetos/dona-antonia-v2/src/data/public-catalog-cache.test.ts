import { describe, expect, it } from 'vitest';
import { createPublicCatalogCache } from './public-catalog-cache';

describe('cache da projeção pública', () => {
  it('reusa uma resposta fresca e invalida explicitamente', async () => {
    let now = 1_000;
    let calls = 0;
    const cache = createPublicCatalogCache({
      freshForMs: 100,
      staleForMs: 300,
      now: () => now,
    });
    const fetcher = async () => ({ version: ++calls });

    await expect(cache.get(fetcher)).resolves.toMatchObject({
      value: { version: 1 },
      source: 'network',
      stale: false,
    });
    now += 50;
    await expect(cache.get(fetcher)).resolves.toMatchObject({
      value: { version: 1 },
      source: 'cache',
      stale: false,
    });
    cache.invalidate();
    await expect(cache.get(fetcher)).resolves.toMatchObject({
      value: { version: 2 },
      source: 'network',
    });
    expect(calls).toBe(2);
  });

  it('entrega stale imediatamente e atualiza em segundo plano', async () => {
    let now = 1_000;
    let release: (() => void) | undefined;
    const cache = createPublicCatalogCache({
      freshForMs: 10,
      staleForMs: 100,
      now: () => now,
    });
    await cache.get(async () => 'v1');
    now += 20;
    const pending = new Promise<string>((resolve) => {
      release = () => resolve('v2');
    });
    const stale = await cache.get(() => pending);
    expect(stale).toMatchObject({ value: 'v1', source: 'cache', stale: true });
    release?.();
    await Promise.resolve();
    now += 1;
    await expect(cache.get(async () => 'unused')).resolves.toMatchObject({
      value: 'v2',
      source: 'cache',
      stale: false,
    });
  });

  it('não mantém uma resposta além da janela stale', async () => {
    let now = 1_000;
    const cache = createPublicCatalogCache({ freshForMs: 10, staleForMs: 20, now: () => now });
    await cache.get(async () => 'v1');
    now += 21;
    await expect(cache.get(async () => 'v2')).resolves.toMatchObject({
      value: 'v2',
      source: 'network',
      stale: false,
    });
  });
});
