import test from 'node:test';
import assert from 'node:assert/strict';
import { createHomologationMediaGateway } from '../../src/platform/media.ts';

const photo = {
  id: 'TEST-MEDIA-photo-safe-0001',
  kind: 'photo' as const,
  source: 'photo_picker' as const,
  mimeType: 'image/jpeg',
  sizeBytes: 128_000,
  durationSeconds: null,
};

test('synthetic media is allowed only in homologation', async () => {
  const gateway = createHomologationMediaGateway({ pickedPhotos: [photo] });
  assert.deepEqual(await gateway.pickPhoto(), photo);
  assert.equal(gateway.getExternalRequestCount(), 0);
});

test('production environment blocks media before consuming fixture', async () => {
  const gateway = createHomologationMediaGateway({ pickedPhotos: [photo], environment: 'production' });
  await assert.rejects(() => gateway.pickPhoto(), /production_environment_blocked/);
  await assert.rejects(() => gateway.pickPhoto(), /production_environment_blocked/);
  assert.equal(gateway.getExternalRequestCount(), 0);
});

test('production flag blocks media fail-closed', async () => {
  const gateway = createHomologationMediaGateway({ pickedPhotos: [photo], productionEnabled: true });
  await assert.rejects(() => gateway.pickPhoto(), /production_flag_blocked/);
  assert.equal(gateway.getExternalRequestCount(), 0);
});

test('non TEST resource is rejected by central guard before local validation', async () => {
  const gateway = createHomologationMediaGateway({ pickedPhotos: [{ ...photo, id: 'real-media-1' }] });
  await assert.rejects(() => gateway.pickPhoto(), /test_resource_required/);
  assert.equal(gateway.getExternalRequestCount(), 0);
});
