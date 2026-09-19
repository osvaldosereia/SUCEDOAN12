import { assertHomologationAction } from './homologationGuard';

export type LocalMediaKind = 'photo' | 'audio';

export interface LocalMediaRecord {
  id: string;
  kind: LocalMediaKind;
  mimeType: string;
  bytes: number;
  createdAt: number;
  expiresAt: number;
}

export interface LocalMediaVaultOptions {
  now?: () => number;
  ttlMs?: number;
  maxEntries?: number;
  environment?: 'homologation' | 'production';
  productionEnabled?: boolean;
}

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 12;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'audio/mpeg', 'audio/mp4', 'audio/wav']);

/**
 * Metadata-only vault for HML media. It deliberately never stores media bytes,
 * customer text, filenames or external URLs. Records live only in memory and
 * expire automatically, preventing accidental persistence while native storage
 * policy is still awaiting device validation.
 */
export class LocalMediaVault {
  private readonly records = new Map<string, LocalMediaRecord>();
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly environment: 'homologation' | 'production';
  private readonly productionEnabled: boolean;

  constructor(options: LocalMediaVaultOptions = {}) {
    this.now = options.now ?? Date.now;
    this.ttlMs = Math.max(1, options.ttlMs ?? DEFAULT_TTL_MS);
    this.maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
    this.environment = options.environment ?? 'homologation';
    this.productionEnabled = options.productionEnabled ?? false;
  }

  put(input: Omit<LocalMediaRecord, 'createdAt' | 'expiresAt'>): LocalMediaRecord {
    assertHomologationAction({
      action: 'simulate_media',
      environment: this.environment,
      productionEnabled: this.productionEnabled,
      resourceId: input.id,
    });
    if (!/^TEST-MEDIA-[A-Z0-9_-]+$/i.test(input.id)) throw new Error('Only TEST-MEDIA-* ids are allowed');
    if (!ALLOWED_MIME.has(input.mimeType)) throw new Error('Unsupported media MIME type');
    if (!Number.isFinite(input.bytes) || input.bytes <= 0 || input.bytes > MAX_BYTES) throw new Error('Invalid media size');

    this.purgeExpired();
    if (!this.records.has(input.id) && this.records.size >= this.maxEntries) {
      const oldest = [...this.records.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
      if (oldest) this.records.delete(oldest.id);
    }
    const createdAt = this.now();
    const record = { ...input, createdAt, expiresAt: createdAt + this.ttlMs };
    this.records.set(input.id, record);
    return { ...record };
  }

  get(id: string): LocalMediaRecord | null {
    this.purgeExpired();
    const record = this.records.get(id);
    return record ? { ...record } : null;
  }

  delete(id: string): boolean {
    return this.records.delete(id);
  }

  clear(): void {
    this.records.clear();
  }

  size(): number {
    this.purgeExpired();
    return this.records.size;
  }

  private purgeExpired(): void {
    const now = this.now();
    for (const [id, record] of this.records) {
      if (record.expiresAt <= now) this.records.delete(id);
    }
  }
}
