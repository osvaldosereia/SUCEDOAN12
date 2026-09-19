import { describe, expect, it } from 'vitest';
import { sanitizeMediaDescriptor } from '../../src/platform/mediaPrivacyPolicy';

describe('media privacy policy', () => {
  it('returns only bounded metadata and mandates EXIF stripping', () => {
    const result = sanitizeMediaDescriptor({ id: 'TEST-MEDIA-PHOTO', source: 'photo-picker', mimeType: 'image/jpeg', bytes: 100, exifPresent: true });
    expect(result.metadataPolicy).toBe('strip-exif-before-boundary');
    expect('exifPresent' in result).toBe(false);
  });

  it('bounds audio duration and source/MIME combinations', () => {
    expect(sanitizeMediaDescriptor({ id: 'TEST-MEDIA-AUDIO', source: 'microphone', mimeType: 'audio/mp4', bytes: 100, durationSeconds: 30 }).durationSeconds).toBe(30);
    expect(() => sanitizeMediaDescriptor({ id: 'TEST-MEDIA-LONG', source: 'microphone', mimeType: 'audio/mp4', bytes: 100, durationSeconds: 121 })).toThrow();
    expect(() => sanitizeMediaDescriptor({ id: 'TEST-MEDIA-WRONG', source: 'camera', mimeType: 'audio/mp4', bytes: 100, durationSeconds: 10 })).toThrow();
  });

  it('fails closed for real ids and unsupported MIME', () => {
    expect(() => sanitizeMediaDescriptor({ id: 'CUSTOMER-1', source: 'camera', mimeType: 'image/jpeg', bytes: 100 })).toThrow();
    expect(() => sanitizeMediaDescriptor({ id: 'TEST-MEDIA-X', source: 'camera', mimeType: 'image/svg+xml', bytes: 100 })).toThrow();
  });
});
