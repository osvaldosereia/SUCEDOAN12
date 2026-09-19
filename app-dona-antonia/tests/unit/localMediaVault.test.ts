import { describe, expect, it } from 'vitest';
import { LocalMediaVault } from '../../src/platform/localMediaVault';

describe('LocalMediaVault', () => {
  it('keeps only synthetic metadata and expires it', () => {
    let now = 1_000;
    const vault = new LocalMediaVault({ now: () => now, ttlMs: 100 });
    const record = vault.put({ id: 'TEST-MEDIA-1', kind: 'photo', mimeType: 'image/jpeg', bytes: 1024 });
    expect(record.expiresAt).toBe(1_100);
    expect(vault.get('TEST-MEDIA-1')?.mimeType).toBe('image/jpeg');
    now = 1_101;
    expect(vault.get('TEST-MEDIA-1')).toBeNull();
    expect(vault.size()).toBe(0);
  });

  it('fails closed for production and real identifiers', () => {
    const production = new LocalMediaVault({ environment: 'production' });
    expect(() => production.put({ id: 'TEST-MEDIA-1', kind: 'audio', mimeType: 'audio/mpeg', bytes: 512 })).toThrow();
    const hml = new LocalMediaVault();
    expect(() => hml.put({ id: 'CUSTOMER-MEDIA-1', kind: 'photo', mimeType: 'image/png', bytes: 512 })).toThrow();
  });

  it('rejects unsupported MIME and oversized payload metadata', () => {
    const vault = new LocalMediaVault();
    expect(() => vault.put({ id: 'TEST-MEDIA-X', kind: 'photo', mimeType: 'image/svg+xml', bytes: 10 })).toThrow();
    expect(() => vault.put({ id: 'TEST-MEDIA-Y', kind: 'audio', mimeType: 'audio/wav', bytes: 9 * 1024 * 1024 })).toThrow();
  });

  it('bounds retained metadata and supports explicit cleanup', () => {
    let now = 10;
    const vault = new LocalMediaVault({ now: () => now++, maxEntries: 2 });
    vault.put({ id: 'TEST-MEDIA-A', kind: 'photo', mimeType: 'image/jpeg', bytes: 10 });
    vault.put({ id: 'TEST-MEDIA-B', kind: 'photo', mimeType: 'image/jpeg', bytes: 10 });
    vault.put({ id: 'TEST-MEDIA-C', kind: 'audio', mimeType: 'audio/mp4', bytes: 10 });
    expect(vault.size()).toBe(2);
    expect(vault.get('TEST-MEDIA-A')).toBeNull();
    expect(vault.delete('TEST-MEDIA-B')).toBe(true);
    vault.clear();
    expect(vault.size()).toBe(0);
  });
});
