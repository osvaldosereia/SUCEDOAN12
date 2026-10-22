import test from 'node:test';
import assert from 'node:assert/strict';
import { compressProductImage } from '../src/product-images.js';

function mocks(sizeForQuality) {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage() {} }),
    toBlob(callback, type, quality) { callback(new Blob([new Uint8Array(sizeForQuality(quality, this.width, this.height))], { type })); }
  };
  return {
    decodeImage: async () => ({ width: 1600, height: 1200 }),
    createCanvas: () => canvas,
    readAsDataUrl: async () => 'data:image/webp;base64,AA=='
  };
}

test('prepara imagem de produto em até 30.000 bytes e redimensiona para até 1200 px', async () => {
  const result = await compressProductImage({ type: 'image/jpeg', size: 90_000 }, { ...mocks(q => q > 0.55 ? 40_000 : 29_900), maxBytes: 30_000 });
  assert.equal(result.size, 29_900);
  assert.equal(result.width, 1200);
  assert.equal(result.height, 900);
  assert.equal(result.dataUrl, 'data:image/webp;base64,AA==');
});

test('falha com uma mensagem clara quando não consegue atingir o limite de 30 KB', async () => {
  await assert.rejects(compressProductImage({ type: 'image/png', size: 90_000 }, { ...mocks(() => 31_000), maxBytes: 30_000 }), /30 KB/);
});

