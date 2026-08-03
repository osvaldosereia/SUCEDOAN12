import { createSign } from 'node:crypto';

const PRODUCTS_NODE = process.env.PRODUCTS_NODE || 'produtos';
const text = value => String(value ?? '').trim();
let firebaseAccessToken;

function firebaseUrl(pathname) {
  const base = text(process.env.FIREBASE_DATABASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/+$/, '');
  const auth = text(process.env.FIREBASE_AUTH_TOKEN);
  return `${base}/${pathname.replace(/^\/+/, '')}.json${auth ? `?auth=${encodeURIComponent(auth)}` : ''}`;
}

function base64Url(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
}

async function firebaseHeaders() {
  if (firebaseAccessToken) return { Authorization: `Bearer ${firebaseAccessToken}` };
  const source = text(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (!source) return {};
  let credentials;
  try {
    credentials = JSON.parse(source);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON não contém JSON válido.');
  }
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('A conta de serviço precisa de client_email e private_key.');
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url({ alg: 'RS256', typ: 'JWT' })}.${base64Url({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/firebase.database',
    aud: 'https://oauth2.googleapis.com/token',
    iat: issuedAt,
    exp: issuedAt + 3600,
  })}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(credentials.private_key, 'base64url')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Google OAuth: ${response.status} ${await response.text()}`);
  const data = await response.json();
  if (!data.access_token) throw new Error('Google OAuth não retornou access_token.');
  firebaseAccessToken = data.access_token;
  return { Authorization: `Bearer ${firebaseAccessToken}` };
}

async function request(pathname, options = {}) {
  const response = await fetch(firebaseUrl(pathname), {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...await firebaseHeaders(),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Firebase ${options.method || 'GET'} ${pathname}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json().catch(() => null);
}

function desiredOverride(product = {}) {
  const value = text(product.situacao_manual_override).toUpperCase();
  return ['A', 'I'].includes(value) ? value : '';
}

function needsRestore(product, wanted) {
  const active = wanted === 'A';
  return text(product.situacao).toUpperCase() !== wanted
    || text(product.status).toUpperCase() !== wanted
    || product.ativo !== active
    || product.visivel !== active;
}

async function run() {
  const products = await request(PRODUCTS_NODE);
  if (!products || typeof products !== 'object' || Array.isArray(products)) {
    throw new Error('Firebase retornou produtos em formato inválido.');
  }

  const plans = Object.entries(products)
    .map(([key, product]) => ({ key, product, wanted: desiredOverride(product) }))
    .filter(plan => plan.wanted && needsRestore(plan.product, plan.wanted));

  for (const plan of plans) {
    const active = plan.wanted === 'A';
    const timestamp = new Date().toISOString();
    const patch = {
      situacao: plan.wanted,
      status: plan.wanted,
      ativo: active,
      visivel: active,
      situacao_manual_restaurada_em: timestamp,
      situacao_manual_restaurada_origem: 'github-actions',
      bloqueio_validade_override_manual: active,
      updated_at: timestamp,
      last_update: Date.now(),
    };
    await request(`${PRODUCTS_NODE}/${encodeURIComponent(plan.key)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  console.log(JSON.stringify({
    status: 'sucesso',
    produtos_avaliados: Object.keys(products).length,
    status_manuais_restaurados: plans.length,
    produtos: plans.map(plan => ({ key: plan.key, situacao: plan.wanted })),
  }));
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
