import assert from 'node:assert/strict';

const base = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
const url = new URL(`${base}/produtos.json`);
url.searchParams.set('orderBy', JSON.stringify('categoria'));
url.searchParams.set('startAt', JSON.stringify('Caneca'));
url.searchParams.set('endAt', JSON.stringify(`Caneca\uf8ff`));
url.searchParams.set('limitToFirst', '10');

const started = Date.now();
const response = await fetch(url, { headers: { Accept: 'application/json' } });
const raw = await response.text();
assert.equal(response.status, 200, `consulta Firebase falhou: HTTP ${response.status} ${raw.slice(0,300)}`);

let data;
try { data = JSON.parse(raw); } catch { throw new Error(`Firebase não retornou JSON: ${raw.slice(0,300)}`); }
assert.ok(data && typeof data === 'object' && !Array.isArray(data), 'Firebase deve retornar objeto de produtos');
const rows = Object.entries(data).map(([id, value]) => ({ id, ...(value || {}) }));
assert.ok(rows.length > 0, 'consulta indexada não retornou nenhuma caneca');

for (const row of rows) {
  const category = String(row.categoria || '');
  assert.ok(category.startsWith('Caneca'), `produto fora do escopo retornado: ${row.id} categoria=${category}`);
}

const image = rows.map(row => row.mockup_1 || row.url_imagem || row.imagem_url || row.imagem).find(v => /^https?:\/\//i.test(String(v || '')));
assert.ok(image, 'nenhuma imagem pública encontrada na amostra de canecas');
const imageResponse = await fetch(image, { redirect: 'follow' });
assert.ok(imageResponse.ok, `imagem de caneca falhou: HTTP ${imageResponse.status} ${image}`);
const contentType = imageResponse.headers.get('content-type') || '';
assert.ok(contentType.startsWith('image/'), `URL da caneca não retornou imagem: ${contentType} ${image}`);
const bytes = Buffer.from(await imageResponse.arrayBuffer());
assert.ok(bytes.length > 500, `imagem retornou arquivo muito pequeno (${bytes.length} bytes)`);

console.log(`OK smoke Firebase: ${rows.length} caneca(s) consultadas em ${Date.now()-started} ms; imagem ${bytes.length} bytes (${contentType}).`);
