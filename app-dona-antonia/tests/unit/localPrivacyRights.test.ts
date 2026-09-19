import { describe, expect, it } from 'vitest';
import { LocalMediaVault } from '../../src/platform/localMediaVault';
import { LocalPrivacyRights } from '../../src/privacy/localPrivacyRights';

describe('LocalPrivacyRights', () => {
  it('supports local synthetic access and erasure', () => {
    const vault = new LocalMediaVault();
    vault.put({ id: 'TEST-MEDIA-1', kind: 'photo', mimeType: 'image/jpeg', bytes: 10 });
    const rights = new LocalPrivacyRights(vault);
    expect(rights.access('TEST-SUBJECT-1', ['TEST-MEDIA-1']).media).toHaveLength(1);
    expect(rights.erase('TEST-SUBJECT-1', ['TEST-MEDIA-1'])).toBe(1);
    expect(rights.access('TEST-SUBJECT-1', ['TEST-MEDIA-1']).media).toHaveLength(0);
  });

  it('fails closed for non synthetic subjects/resources', () => {
    const rights = new LocalPrivacyRights(new LocalMediaVault());
    expect(() => rights.access('CUSTOMER-1', [])).toThrow();
    expect(() => rights.erase('TEST-SUBJECT-1', ['CUSTOMER-MEDIA-1'])).toThrow();
  });

  it('requires erase/recreate instead of mutating retained metadata', () => {
    const rights = new LocalPrivacyRights(new LocalMediaVault());
    expect(() => rights.correct()).toThrow(/immutable/i);
  });
});
