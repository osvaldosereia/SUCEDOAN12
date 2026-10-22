import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLegacyMatchUrl, buildReaderProductsUrl, parseLegacyMatchRequest,
  sanitizeLegacyProducts, sanitizeReaderProductIds
} from '../../supabase/functions/admin1-legacy-catalog-read-v1/read-contract.mjs';

test('permite solicitar somente IDs de produtos capturados pelo Leitor EAN', () => {
  const parsed = parseLegacyMatchRequest(new URL('https://local/?action=reader_products'));
  assert.deepEqual(parsed, { ok: true, action: 'reader_products' });
  assert.equal(buildReaderProductsUrl('https://legacy.test/read').searchParams.get('action'), 'ean-products');
});

test('mantém a consulta antiga restrita a correspondências exatas e limitada a 100 códigos', () => {
  assert.equal(parseLegacyMatchRequest(new URL('https://local/?action=matches')).error, 'missing_identifiers');
  assert.equal(parseLegacyMatchRequest(new URL(`https://local/?action=matches&${Array.from({ length: 101 }, (_, i) => `gtin=${i}`).join('&')}`)).error, 'too_many_identifiers');
  assert.equal(buildLegacyMatchUrl('https://legacy.test/read', { gtin: ['7891'] }).searchParams.get('gtin'), '7891');
});

test('não expõe outros campos nos retornos de catálogo e EAN', () => {
  assert.deepEqual(sanitizeLegacyProducts([{ id: 'legacy', name: 'Arroz', stock: 8 }]), [{ id: 'legacy', name: 'Arroz' }]);
  assert.deepEqual(sanitizeReaderProductIds([{ id: '01234567-89ab-cdef-0123-456789abcdef', ean_reader_capture_count: 8 }, { id: 'bad' }]), ['01234567-89ab-cdef-0123-456789abcdef']);
});
