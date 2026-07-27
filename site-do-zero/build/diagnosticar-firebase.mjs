import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const FIREBASE_URL = String(
  process.env.FIREBASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com'
).replace(/\/$/, '');

const OUTPUT = path.resolve(
  process.cwd(),
  process.env.DIAGNOSTIC_OUTPUT || 'site-do-zero/diagnosticos/firebase-leitura.json'
);

const PATHS = [
  'produtos',
  'cestas',
  'cestas_basicas',
  'cestas-basicas',
  'produtos_cesta_basica',
  'produtos-cesta-basica',
  'kits',
  'config_site/categorias'
];

async function probe(firebasePath) {
  const clean = String(firebasePath).replace(/^\/+|\/+$/g, '');
  const url = `${FIREBASE_URL}/${clean}.json?shallow=true`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal
    });

    const text = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}

    const keys = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? Object.keys(parsed)
      : [];

    return {
      path: `/${clean}`,
      status: response.status,
      readable: response.ok,
      valueType: parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed,
      keyCount: keys.length,
      sampleKeys: keys.slice(0, 12),
      error: response.ok ? '' : String(parsed?.error || parsed?.message || text).slice(0, 160)
    };
  } catch (error) {
    return {
      path: `/${clean}`,
      status: 0,
      readable: false,
      valueType: 'error',
      keyCount: 0,
      sampleKeys: [],
      error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error)
    };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
for (const firebasePath of PATHS) {
  results.push(await probe(firebasePath));
}

const report = {
  generatedAt: new Date().toISOString(),
  firebase: FIREBASE_URL,
  mode: 'GET_ONLY_SHALLOW',
  results
};

await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, JSON.stringify(report, null, 2), 'utf8');

for (const item of results) {
  console.log(`${String(item.status).padStart(3, ' ')} ${item.readable ? 'OK ' : 'NO '} ${item.path} (${item.keyCount} chaves)`);
}
