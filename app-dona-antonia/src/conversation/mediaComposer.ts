import type { MediaAttachment } from '../platform/media.ts';

export interface MediaComposerSnapshot {
  attachments: MediaAttachment[];
}

export interface MediaComposer {
  add(attachment: MediaAttachment): boolean;
  remove(id: string): boolean;
  clear(): void;
  getSnapshot(): MediaComposerSnapshot;
}

const MAX_ATTACHMENTS = 4;

function cloneAttachment(value: MediaAttachment): MediaAttachment {
  return { ...value };
}

export function createMediaComposer(): MediaComposer {
  let attachments: MediaAttachment[] = [];

  return {
    add(attachment) {
      if (attachments.length >= MAX_ATTACHMENTS) return false;
      if (attachments.some((item) => item.id === attachment.id)) return false;
      attachments = [...attachments, cloneAttachment(attachment)];
      return true;
    },

    remove(id) {
      const next = attachments.filter((item) => item.id !== id);
      if (next.length === attachments.length) return false;
      attachments = next;
      return true;
    },

    clear() {
      attachments = [];
    },

    getSnapshot() {
      return {
        attachments: attachments.map(cloneAttachment),
      };
    },
  };
}
