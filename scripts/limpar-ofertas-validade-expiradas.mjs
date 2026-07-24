import { createSign } from 'node:crypto';

const text = value => String(value ?? '').trim();
let firebaseAccessToken;

function firebaseUrl(pathname) {
  const base = text(process.env.FIREBASE_DATABASE_URL).replace(/\/+$/, '');
  if (!base) throw new Error('Defina o secret FIREBASE_DATABASE_URL.');
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
  try { credentials = JSON.parse(source); }
  catch { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON não contém um JSON válido.'); }
  if (!credentials.client_email || !credentials.private_key) throw new Error('A service account do Firebase precisa de client_email e private_key.');
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
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) throw new Error(`Google OAuth para Firebase: ${response.status} ${await response.text()}`);
  const data = await response.json();
  if (!data.access_token) throw new Error('Google OAuth não retornou access_token para o Firebase.');
  firebaseAccessToken = data.access_token;
  return { Authorization: `Bearer ${firebaseAccessToken}` };
}

function offerEnd(value) {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T23:59:59-04:00`);
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}T23:59:59-04:00`);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function shouldClear(product, now) {
  const origin = text(product?.oferta_origem);
  if (!['validade', 'validade_automatica'].includes(origin)) return false;
  const end = offerEnd(product?.validade_oferta ?? product?.validadeOferta);
  return Boolean(end && end.getTime() < now.getTime());
}

function clearPatch(now) {
  return {
    preco_oferta: null,
    precoOferta: null,
    data_inicio_oferta: null,
    inicio_oferta: null,
    validade_oferta: null,
    validadeOferta: null,
    oferta_origem: null,
    desconto_validade: null,
    oferta_regra_id: null,
    oferta_criada_em: null,
    updated_at: now.toISOString(),
    last_update: Date.now(),
  };
}

async function loadProducts() {
  const response = await fetch(firebaseUrl('produtos'), { headers: { Accept: 'application/json', ...await firebaseHeaders() } });
  if (!response.ok) throw new Error(`Firebase GET produtos: ${response.status} ${await response.text()}`);
  const data = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Firebase retornou produtos em formato inválido.');
  return data;
}

async function patchProduct(key, patch) {
  const response = await fetch(firebaseUrl(`produtos/${encodeURIComponent(key)}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...await firebaseHeaders() },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Firebase PATCH produto ${key}: ${response.status} ${await response.text()}`);
}

async function run() {
  const now = new Date();
  const products = await loadProducts();
  const expired = Object.entries(products).filter(([, product]) => shouldClear(product, now));
  for (const [key] of expired) await patchProduct(key, clearPatch(now));
  console.log(JSON.stringify({ status: 'sucesso', ofertas_validade_encerradas: expired.length, produtos: expired.map(([key, product]) => ({ key, nome: text(product.nome), fim: text(product.validade_oferta) })) }));
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
