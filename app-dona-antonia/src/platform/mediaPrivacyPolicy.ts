export type MediaSource = 'photo-picker' | 'camera' | 'microphone';

export interface MediaPrivacyInput {
  id: string;
  source: MediaSource;
  mimeType: string;
  bytes: number;
  durationSeconds?: number;
  exifPresent?: boolean;
}

export interface SanitizedMediaDescriptor {
  id: string;
  source: MediaSource;
  mimeType: string;
  bytes: number;
  durationSeconds?: number;
  metadataPolicy: 'strip-exif-before-boundary';
}

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_AUDIO_SECONDS = 120;
const IMAGE_MIME = new Set(['image/jpeg', 'image/png']);
const AUDIO_MIME = new Set(['audio/mpeg', 'audio/mp4', 'audio/wav']);

/** Pure HML boundary policy. It never receives media bytes or customer text. */
export function sanitizeMediaDescriptor(input: MediaPrivacyInput): SanitizedMediaDescriptor {
  if (!/^TEST-MEDIA-[A-Z0-9_-]+$/i.test(input.id)) throw new Error('Only TEST-MEDIA-* ids are allowed');
  if (!Number.isFinite(input.bytes) || input.bytes <= 0 || input.bytes > MAX_BYTES) throw new Error('Invalid media size');

  const image = IMAGE_MIME.has(input.mimeType);
  const audio = AUDIO_MIME.has(input.mimeType);
  if (!image && !audio) throw new Error('Unsupported media MIME type');
  if (input.source === 'microphone' && !audio) throw new Error('Microphone requires audio MIME');
  if ((input.source === 'camera' || input.source === 'photo-picker') && !image) throw new Error('Image source requires image MIME');
  if (audio) {
    if (!Number.isFinite(input.durationSeconds) || (input.durationSeconds ?? 0) <= 0 || (input.durationSeconds ?? 0) > MAX_AUDIO_SECONDS) {
      throw new Error('Invalid audio duration');
    }
  } else if (input.durationSeconds !== undefined) {
    throw new Error('Image must not carry audio duration');
  }

  return {
    id: input.id,
    source: input.source,
    mimeType: input.mimeType,
    bytes: input.bytes,
    ...(audio ? { durationSeconds: input.durationSeconds } : {}),
    metadataPolicy: 'strip-exif-before-boundary',
  };
}
