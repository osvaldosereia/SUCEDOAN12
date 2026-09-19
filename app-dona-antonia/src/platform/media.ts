import { evaluateHomologationExecution } from './homologationGuard.ts';

export type MediaKind = 'photo' | 'audio';
export type MediaSource = 'photo_picker' | 'camera' | 'microphone';

export interface MediaAttachment {
  id: string;
  kind: MediaKind;
  source: MediaSource;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
}

export interface MediaFixtureInput extends MediaAttachment {}

export interface MediaGateway {
  pickPhoto(): Promise<MediaAttachment | null>;
  takePhoto(): Promise<MediaAttachment | null>;
  recordAudio(): Promise<MediaAttachment | null>;
  cancelRecording(): void;
  isRecording(): boolean;
  getExternalRequestCount(): 0;
}

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const MAX_AUDIO_SECONDS = 120;
const TEST_MEDIA_ID = /^TEST-MEDIA-[A-Za-z0-9_-]{8,160}$/;
const PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AUDIO_MIME_TYPES = new Set(['audio/webm', 'audio/mp4', 'audio/aac', 'audio/mpeg']);

function cloneAttachment(value: MediaAttachment): MediaAttachment {
  return { ...value };
}

export function validateHomologationMedia(value: MediaFixtureInput): MediaAttachment {
  if (!TEST_MEDIA_ID.test(value.id)) throw new Error('homologation media id must use TEST-MEDIA-*');
  if (!Number.isInteger(value.sizeBytes) || value.sizeBytes <= 0) throw new Error('media size must be a positive integer');
  if (value.kind === 'photo') {
    if (value.source !== 'photo_picker' && value.source !== 'camera') throw new Error('photo source must be photo_picker or camera');
    if (!PHOTO_MIME_TYPES.has(value.mimeType)) throw new Error('unsupported photo mime type');
    if (value.sizeBytes > MAX_PHOTO_BYTES) throw new Error('photo exceeds homologation size limit');
    if (value.durationSeconds !== null) throw new Error('photo cannot have duration');
  } else {
    if (value.source !== 'microphone') throw new Error('audio source must be microphone');
    if (!AUDIO_MIME_TYPES.has(value.mimeType)) throw new Error('unsupported audio mime type');
    if (value.sizeBytes > MAX_AUDIO_BYTES) throw new Error('audio exceeds homologation size limit');
    if (value.durationSeconds === null || !Number.isFinite(value.durationSeconds) || value.durationSeconds <= 0 || value.durationSeconds > MAX_AUDIO_SECONDS) throw new Error('audio duration is outside homologation limit');
  }
  return cloneAttachment(value);
}

export function createHomologationMediaGateway(options: {
  pickedPhotos?: MediaFixtureInput[];
  cameraPhotos?: MediaFixtureInput[];
  audioRecordings?: MediaFixtureInput[];
  environment?: 'homologation' | 'production';
  productionEnabled?: boolean;
} = {}): MediaGateway {
  const pickedPhotos = [...(options.pickedPhotos ?? [])];
  const cameraPhotos = [...(options.cameraPhotos ?? [])];
  const audioRecordings = [...(options.audioRecordings ?? [])];
  const environment = options.environment ?? 'homologation';
  const productionEnabled = options.productionEnabled ?? false;
  let recording = false;

  function assertSyntheticMediaAllowed(resourceId: string): void {
    const decision = evaluateHomologationExecution({ action: 'simulate_media', environment, productionEnabled, resourceId });
    if (!decision.allowed) throw new Error(`media blocked by homologation guard: ${decision.reason}`);
  }

  async function next(queue: MediaFixtureInput[]): Promise<MediaAttachment | null> {
    const value = queue[0];
    if (!value) return null;
    assertSyntheticMediaAllowed(value.id);
    queue.shift();
    return validateHomologationMedia(value);
  }

  return {
    pickPhoto() { return next(pickedPhotos); },
    takePhoto() { return next(cameraPhotos); },
    async recordAudio() {
      const candidate = audioRecordings[0];
      if (!candidate) return null;
      assertSyntheticMediaAllowed(candidate.id);
      recording = true;
      try { return await next(audioRecordings); } finally { recording = false; }
    },
    cancelRecording() { recording = false; },
    isRecording() { return recording; },
    getExternalRequestCount() { return 0; },
  };
}
