import { LocalMediaVault, type LocalMediaRecord } from '../platform/localMediaVault';

export interface SyntheticPrivacySnapshot {
  subjectId: string;
  media: LocalMediaRecord[];
}

/**
 * Local-only HML privacy-rights facade. No backend, network or production data.
 * Correction is intentionally unsupported for media metadata: delete/recreate is safer.
 */
export class LocalPrivacyRights {
  constructor(private readonly vault: LocalMediaVault) {}

  access(subjectId: string, mediaIds: readonly string[]): SyntheticPrivacySnapshot {
    assertSyntheticSubject(subjectId);
    const media = mediaIds.map((id) => {
      assertSyntheticMedia(id);
      return this.vault.get(id);
    }).filter((record): record is LocalMediaRecord => record !== null);
    return { subjectId, media };
  }

  erase(subjectId: string, mediaIds: readonly string[]): number {
    assertSyntheticSubject(subjectId);
    let removed = 0;
    for (const id of mediaIds) {
      assertSyntheticMedia(id);
      if (this.vault.delete(id)) removed += 1;
    }
    return removed;
  }

  correct(): never {
    throw new Error('Media metadata is immutable; erase and recreate the synthetic record');
  }
}

function assertSyntheticSubject(subjectId: string): void {
  if (!/^TEST-SUBJECT-[A-Z0-9_-]+$/i.test(subjectId)) throw new Error('Only TEST-SUBJECT-* ids are allowed');
}

function assertSyntheticMedia(id: string): void {
  if (!/^TEST-MEDIA-[A-Z0-9_-]+$/i.test(id)) throw new Error('Only TEST-MEDIA-* ids are allowed');
}
