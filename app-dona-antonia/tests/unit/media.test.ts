import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createHomologationMediaGateway,
  validateHomologationMedia,
} from '../../src/platform/media.ts';
import { createMediaComposer } from '../../src/conversation/mediaComposer.ts';

const photo = {
  id: 'TEST-MEDIA-photo-0001',
  kind: 'photo' as const,
  source: 'photo_picker' as const,
  mimeType: 'image/jpeg',
  sizeBytes: 512_000,
  durationSeconds: null,
};

const audio = {
  id: 'TEST-MEDIA-audio-0001',
  kind: 'audio' as const,
  source: 'microphone' as const,
  mimeType: 'audio/webm',
  sizeBytes: 800_000,
  durationSeconds: 35,
};

test('media policy accepts bounded synthetic photo and audio fixtures', () => {
  assert.deepEqual(validateHomologationMedia(photo), photo);
  assert.deepEqual(validateHomologationMedia(audio), audio);
});

test('media policy rejects oversized, unsupported or non-test media', () => {
  assert.throws(
    () => validateHomologationMedia({ ...photo, id: 'real-photo', sizeBytes: 50_000_000 }),
    /TEST-MEDIA/,
  );
  assert.throws(
    () => validateHomologationMedia({ ...photo, mimeType: 'image/svg+xml' }),
    /mime type/,
  );
  assert.throws(
    () => validateHomologationMedia({ ...audio, durationSeconds: 121 }),
    /duration/,
  );
});

test('homologation gateway returns fixtures without external requests', async () => {
  const gateway = createHomologationMediaGateway({
    pickedPhotos: [photo],
    audioRecordings: [audio],
  });

  assert.deepEqual(await gateway.pickPhoto(), photo);
  assert.deepEqual(await gateway.recordAudio(), audio);
  assert.equal(gateway.getExternalRequestCount(), 0);
});

test('recording cancellation is local and idempotent', () => {
  const gateway = createHomologationMediaGateway();
  gateway.cancelRecording();
  gateway.cancelRecording();
  assert.equal(gateway.isRecording(), false);
  assert.equal(gateway.getExternalRequestCount(), 0);
});

test('media composer caps attachments and blocks duplicates', () => {
  const composer = createMediaComposer();
  assert.equal(composer.add(photo), true);
  assert.equal(composer.add(photo), false);

  for (let index = 2; index <= 4; index += 1) {
    assert.equal(composer.add({ ...photo, id: `TEST-MEDIA-photo-000${index}` }), true);
  }
  assert.equal(composer.add({ ...audio, id: 'TEST-MEDIA-audio-0005' }), false);
  assert.equal(composer.getSnapshot().attachments.length, 4);
});

test('media foundation contains no upload, file path or network implementation', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const mediaSource = readFileSync(resolve(here, '../../src/platform/media.ts'), 'utf8');
  const composerSource = readFileSync(resolve(here, '../../src/conversation/mediaComposer.ts'), 'utf8');
  const source = `${mediaSource}\n${composerSource}`;

  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /FormData|XMLHttpRequest|FileReader/);
  assert.doesNotMatch(source, /exif|filesystem|file:\/\//i);
});
