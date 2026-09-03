import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const state = {};
const text = value => String(value ?? '').trim();

function segments(url = '') {
  const pathname = new URL(url, 'http://local').pathname.replace(/^\/+|\.json$/g, '');
  return pathname ? pathname.split('/').map(decodeURIComponent) : [];
}
function readPath(parts) {
  let cur = state;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object' || !(part in cur)) return null;
    cur = cur[part];
  }
  return cur;
}
function writePath(parts, value, patch = false) {
  let cur = state;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!cur[part] || typeof cur[part] !== 'object') cur[part] = {};
    cur = cur[part];
  }
  const key = parts.at(-1);
  if (!key) return;
  if (patch) cur[key] = { ...(cur[key] && typeof cur[key] === 'object' ? cur[key] : {}), ...(value || {}) };
  else cur[key] = value;
}

const server = http.createServer(async (req, res) => {
  try {
    const parts = segments(req.url);
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(readPath(parts)));
      return;
    }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    if (req.method === 'PUT') writePath(parts, body, false);
    else if (req.method === 'PATCH') writePath(parts, body, true);
    else throw new Error(`método não suportado: ${req.method}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;
const script = path.resolve('scripts/fila-midia-loja-integrada-v1.mjs');
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-media-queue-'));

async function run(mode, extra = {}) {
  const outputFile = path.join(tempDir, `out-${mode}-${Date.now()}-${Math.random()}.txt`);
  await fs.writeFile(outputFile, '');
  const env = {
    ...process.env,
    FIREBASE_BASE_URL: base,
    MODE: mode,
    GITHUB_OUTPUT: outputFile,
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])),
  };
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
  if (result.code !== 0) throw new Error(`${mode} falhou (${result.code})\n${result.stdout}\n${result.stderr}`);
  const outputs = {};
  const rawOut = await fs.readFile(outputFile, 'utf8');
  for (const line of rawOut.split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) outputs[line.slice(0, i)] = line.slice(i + 1);
  }
  return { ...result, outputs };
}

try {
  const productKey = 'mug-test-media-1';
  state.produtos = {
    [productKey]: {
      nome: 'Caneca Teste',
      arte_horizontal: 'https://example.test/master.png',
      vitrine_horizontal_quadrada: 'https://example.test/square.webp',
      vitrine_loja_integrada: {
        source_art: 'https://example.test/master.png',
        url: 'https://example.test/square.webp',
      },
    },
  };

  await run('enqueue', { PRODUCT_KEY: productKey, FORCE: false, SOURCE: 'unit_test' });
  const queueKey = Buffer.from(productKey, 'utf8').toString('base64url');
  assert.equal(state.canecas.integracoes.loja_integrada.midia_fila[queueKey].status, 'pendente');
  assert.equal(state.produtos[productKey].vitrine_loja_integrada_status, 'pendente_github');
  assert.equal(state.canecas.integracoes.loja_integrada.midia_fila[queueKey].tentativas, 0);

  const firstClaim = await run('claim', { PRODUCT_KEY: productKey, STALE_MINUTES: 20 });
  assert.equal(firstClaim.outputs.has_work, 'true');
  assert.equal(firstClaim.outputs.product_key, productKey);
  assert.equal(state.canecas.integracoes.loja_integrada.midia_fila[queueKey].status, 'processando');
  assert.equal(state.canecas.integracoes.loja_integrada.midia_fila[queueKey].tentativas, 1);
  assert.equal(state.produtos[productKey].vitrine_loja_integrada_status, 'processando_github');

  await run('fail', { PRODUCT_KEY: productKey, QUEUE_KEY: queueKey, FAIL_MESSAGE: 'falha simulada do worker' });
  assert.equal(state.canecas.integracoes.loja_integrada.midia_fila[queueKey].status, 'erro');
  assert.match(state.canecas.integracoes.loja_integrada.midia_fila[queueKey].erro, /falha simulada/);
  assert.equal(state.produtos[productKey].vitrine_loja_integrada_status, 'erro');

  const retryClaim = await run('claim', { PRODUCT_KEY: productKey });
  assert.equal(retryClaim.outputs.has_work, 'true');
  assert.equal(state.canecas.integracoes.loja_integrada.midia_fila[queueKey].status, 'processando');
  assert.equal(state.canecas.integracoes.loja_integrada.midia_fila[queueKey].tentativas, 2);

  await run('finalize', { PRODUCT_KEY: productKey, QUEUE_KEY: queueKey });
  assert.equal(state.canecas.integracoes.loja_integrada.midia_fila[queueKey].status, 'concluido');
  assert.equal(state.produtos[productKey].vitrine_loja_integrada_status, 'pronto');
  assert.equal(state.canecas.integracoes.loja_integrada.midia_fila[queueKey].media_url, 'https://example.test/square.webp');

  const staleKey = 'mug-test-media-stale';
  const staleQueueKey = Buffer.from(staleKey, 'utf8').toString('base64url');
  state.produtos[staleKey] = {
    arte_horizontal: 'https://example.test/stale-master.png',
    vitrine_horizontal_quadrada: 'https://example.test/stale-square.webp',
    vitrine_loja_integrada: { source_art: 'https://example.test/stale-master.png' },
  };
  state.canecas.integracoes.loja_integrada.midia_fila[staleQueueKey] = {
    product_key: staleKey,
    status: 'processando',
    force: false,
    solicitado_em: '2026-01-01T00:00:00.000Z',
    atualizado_em: '2026-01-01T00:00:00.000Z',
    iniciado_em: '2026-01-01T00:00:00.000Z',
    tentativas: 1,
  };
  const staleClaim = await run('claim', { PRODUCT_KEY: staleKey, STALE_MINUTES: 5 });
  assert.equal(staleClaim.outputs.has_work, 'true');
  assert.equal(state.canecas.integracoes.loja_integrada.midia_fila[staleQueueKey].recuperado_de_processamento_travado, true);
  assert.equal(state.canecas.integracoes.loja_integrada.midia_fila[staleQueueKey].tentativas, 2);

  console.log('OK fila mídia GitHub: enqueue → claim → fail → retry → finalize + recuperação de processamento stale.');
} finally {
  server.close();
  await fs.rm(tempDir, { recursive: true, force: true });
}
