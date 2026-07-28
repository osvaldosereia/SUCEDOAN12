import { existsSync, readFileSync } from "node:fs";
import { createSign } from "node:crypto";

const CONFIG_PATH = process.env.OFFERS_CONFIG_PATH || "site/ofertas-automaticas.json";
const PRODUCTS_NODE = process.env.PRODUCTS_NODE || "produtos";
const TIME_ZONE = process.env.OFFERS_TIME_ZONE || "America/Cuiaba";

const DEFAULT_RULES = Object.freeze([
  { min: 3, max: 7, discount: 50 },
  { min: 8, max: 15, discount: 40 },
  { min: 16, max: 31, discount: 35 },
  { min: 32, max: 46, discount: 30 },
  { min: 47, max: 65, discount: 25 },
  { min: 66, max: 76, discount: 20 },
  { min: 77, max: 91, discount: 10 },
  { min: 92, max: 105, discount: 5 },
]);

const text = value => String(value ?? "").trim();
const number = value => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = value => Math.round(Math.max(0, number(value)) * 100) / 100;
let firebaseAccessToken;

function localDate(clock) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(clock);
  const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseLocalDate(value) {
  const raw = text(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : localDate(parsed);
}

function daysBetween(start, end) {
  const startMs = Date.parse(`${start}T12:00:00Z`);
  const endMs = Date.parse(`${end}T12:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.round((endMs - startMs) / 86400000);
}

function addDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

function firebaseUrl(pathname) {
  const base = text(process.env.FIREBASE_DATABASE_URL).replace(/\/+$/, "");
  if (!base) throw new Error("Defina o secret FIREBASE_DATABASE_URL.");
  const auth = text(process.env.FIREBASE_AUTH_TOKEN);
  return `${base}/${pathname.replace(/^\/+/, "")}.json${auth ? `?auth=${encodeURIComponent(auth)}` : ""}`;
}

function base64Url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

async function firebaseHeaders() {
  if (firebaseAccessToken) return { Authorization: `Bearer ${firebaseAccessToken}` };
  const source = text(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (!source) return {};
  let credentials;
  try { credentials = JSON.parse(source); }
  catch { throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON nao contem um JSON valido."); }
  if (!credentials.client_email || !credentials.private_key) throw new Error("A service account do Firebase precisa de client_email e private_key.");
  const issuedAt = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url({ alg: "RS256", typ: "JWT" })}.${base64Url({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/firebase.database",
    aud: "https://oauth2.googleapis.com/token",
    iat: issuedAt,
    exp: issuedAt + 3600,
  })}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(credentials.private_key, "base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`Google OAuth para Firebase: ${response.status} ${await response.text()}`);
  const data = await response.json();
  if (!data.access_token) throw new Error("Google OAuth nao retornou access_token para o Firebase.");
  firebaseAccessToken = data.access_token;
  return { Authorization: `Bearer ${firebaseAccessToken}` };
}

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
}

function normalizeRules(config) {
  const validity = config?.regras_validade || {};
  const source = Array.isArray(validity.faixas) ? validity.faixas : DEFAULT_RULES;
  const rules = source.map(row => ({
    min: Math.max(0, Math.floor(number(row.min))),
    max: Math.max(0, Math.floor(number(row.max))),
    discount: Math.max(0, Math.min(90, number(row.discount ?? row.desconto_percentual))),
  })).filter(row => row.max >= row.min && row.discount > 0)
    .sort((a, b) => a.min - b.min || a.max - b.max);

  return {
    enabled: validity.ativo !== false,
    blockDays: Math.max(0, Math.floor(number(validity.bloquear_dias ?? 2))),
    endBeforeDays: Math.max(0, Math.floor(number(validity.encerrar_oferta_dias_antes ?? 2))),
    rules: rules.length ? rules : [...DEFAULT_RULES],
  };
}

function currentSituation(product) {
  return text(product?.situacao ?? product?.status ?? "A").toUpperCase() || "A";
}

function isValidityOffer(product) {
  return ["validade", "validade_automatica"].includes(text(product?.oferta_origem));
}

function hasProtectedOffer(product) {
  const offer = money(product?.preco_oferta ?? product?.precoOferta);
  const regular = money(product?.preco ?? product?.price ?? product?.valor);
  return offer > 0 && regular > offer && !isValidityOffer(product);
}

function discountForDays(days, rules) {
  return rules.find(rule => days >= rule.min && days <= rule.max)?.discount || 0;
}

function offerEnd(validityDate, endBeforeDays) {
  return `${addDays(validityDate, -endBeforeDays)}T23:59:59-04:00`;
}

function clearPatch(product, now, restoreBlock = true) {
  const patch = {
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
  if (restoreBlock && product?.bloqueio_validade) {
    patch.situacao = currentSituation(product?.situacao_antes_bloqueio_validade || "A");
    patch.bloqueio_validade = null;
    patch.bloqueio_validade_em = null;
    patch.situacao_antes_bloqueio_validade = null;
  }
  return patch;
}

function planProduct(key, product, rulesConfig, now) {
  const today = localDate(now);
  const validityDate = parseLocalDate(product?.validade ?? product?.vencimento ?? product?.data_validade);
  const days = validityDate ? daysBetween(today, validityDate) : null;
  const stock = Math.max(0, number(product?.estoque));
  const price = money(product?.preco ?? product?.price ?? product?.valor);
  const originValidity = isValidityOffer(product);

  if (!rulesConfig.enabled) {
    return originValidity ? { key, action: "clear_disabled", patch: clearPatch(product, now) } : null;
  }
  if (!validityDate || stock <= 0 || price <= 0) {
    return originValidity || product?.bloqueio_validade
      ? { key, action: "clear_unavailable", patch: clearPatch(product, now) }
      : null;
  }
  if (hasProtectedOffer(product)) return null;

  if (days <= rulesConfig.blockDays) {
    const patch = clearPatch(product, now, false);
    patch.situacao = "I";
    patch.bloqueio_validade = true;
    patch.bloqueio_validade_em = now.toISOString();
    if (!product?.bloqueio_validade) patch.situacao_antes_bloqueio_validade = currentSituation(product);
    return { key, action: "block", patch };
  }

  const discount = discountForDays(days, rulesConfig.rules);
  if (!discount) {
    return originValidity || product?.bloqueio_validade
      ? { key, action: "clear_outside_window", patch: clearPatch(product, now) }
      : null;
  }

  const offerPrice = money(price * (1 - discount / 100));
  if (!(offerPrice > 0 && offerPrice < price)) return null;
  const patch = {
    preco_oferta: offerPrice,
    precoOferta: null,
    data_inicio_oferta: today,
    inicio_oferta: today,
    validade_oferta: offerEnd(validityDate, rulesConfig.endBeforeDays),
    validadeOferta: null,
    oferta_origem: "validade_automatica",
    desconto_validade: discount,
    updated_at: now.toISOString(),
    last_update: Date.now(),
  };
  if (product?.bloqueio_validade) {
    patch.situacao = currentSituation(product?.situacao_antes_bloqueio_validade || "A");
    patch.bloqueio_validade = null;
    patch.bloqueio_validade_em = null;
    patch.situacao_antes_bloqueio_validade = null;
  }
  return { key, action: "apply", patch };
}

async function loadProducts() {
  const response = await fetch(firebaseUrl(PRODUCTS_NODE), { headers: { Accept: "application/json", ...await firebaseHeaders() } });
  if (!response.ok) throw new Error(`Firebase GET ${PRODUCTS_NODE}: ${response.status} ${await response.text()}`);
  const data = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Firebase retornou produtos em formato invalido.");
  return data;
}

async function patchProduct(key, patch) {
  const response = await fetch(firebaseUrl(`${PRODUCTS_NODE}/${encodeURIComponent(key)}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...await firebaseHeaders() },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Firebase PATCH produto ${key}: ${response.status} ${await response.text()}`);
}

async function run() {
  const now = new Date();
  const config = loadConfig();
  const rulesConfig = normalizeRules(config);
  const products = await loadProducts();
  const plans = Object.entries(products)
    .map(([key, product]) => planProduct(key, product, rulesConfig, now))
    .filter(Boolean);

  for (const plan of plans) await patchProduct(plan.key, plan.patch);

  const resumo = plans.reduce((acc, plan) => {
    acc[plan.action] = (acc[plan.action] || 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({
    status: "sucesso",
    regras_validade_ativas: rulesConfig.enabled,
    produtos_avaliados: Object.keys(products).length,
    produtos_alterados: plans.length,
    resumo,
  }));
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
