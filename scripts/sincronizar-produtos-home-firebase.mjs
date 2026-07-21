import { createSign } from "node:crypto";
import { writeFile } from "node:fs/promises";

const PRODUCTS_HOME_PATH = process.env.PRODUCTS_HOME_PATH || "site/produtos-home.json";
const PRODUCTS_FULL_PATH = process.env.PRODUCTS_FULL_PATH || "site/produtos.json";
let firebaseAccessToken;

const text = value => String(value ?? "").trim();
const number = value => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = value => Math.round(Math.max(0, number(value)) * 100) / 100;

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

  const credentials = JSON.parse(source);
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("A service account do Firebase precisa de client_email e private_key.");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url({ alg: "RS256", typ: "JWT" })}.${base64Url({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/firebase.database",
    aud: "https://oauth2.googleapis.com/token",
    iat: issuedAt,
    exp: issuedAt + 3600
  })}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(credentials.private_key, "base64url")}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth2:grant-type:jwt-bearer", assertion })
  });
  if (!response.ok) throw new Error(`Google OAuth para Firebase: ${response.status} ${await response.text()}`);

  const data = await response.json();
  if (!data.access_token) throw new Error("Google OAuth não retornou access_token para o Firebase.");
  firebaseAccessToken = data.access_token;
  return { Authorization: `Bearer ${firebaseAccessToken}` };
}

async function loadFirebaseProducts() {
  const response = await fetch(firebaseUrl("produtos"), {
    headers: { Accept: "application/json", ...await firebaseHeaders() }
  });
  if (!response.ok) throw new Error(`Firebase GET produtos: ${response.status} ${await response.text()}`);

  const data = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Firebase retornou produtos em formato inválido.");
  }
  return data;
}

function isActive(product) {
  const situation = text(product?.situacao ?? product?.status ?? "A").toUpperCase();
  return !["I", "INATIVO", "INACTIVE", "0", "FALSE", "EXCLUIDO"].includes(situation);
}

function compactProduct(key, product = {}) {
  const compact = {
    firebaseKey: key,
    id: text(product.id || key),
    codigo: text(product.codigo || product.sku || product.id || key),
    nome: text(product.nome || product.name || product.titulo),
    categoria: text(product.categoria),
    subcategoria: text(product.subcategoria),
    subsubcategoria: text(product.subsubcategoria),
    marca: text(product.marca),
    embalagem: text(product.embalagem),
    preco: money(product.preco ?? product.price ?? product.valor),
    preco_oferta: money(product.preco_oferta ?? product.precoOferta),
    estoque: Math.max(0, Math.floor(number(product.estoque))),
    situacao: isActive(product) ? "A" : "I",
    url_imagem: text(product.url_imagem || product.imagem_url || product.imagem || product.image || product.img || product.foto || product.foto_url || product.imagem_path),
    descricao_curta: text(product.descricao_curta || product.descricao).slice(0, 180),
    validade: text(product.validade || product.data_validade),
    validade_oferta: text(product.validade_oferta || product.validadeOferta),
    gtin: text(product.gtin || product.ean)
  };

  return Object.fromEntries(
    Object.entries(compact).filter(([, value]) => value !== "" && value !== null && value !== undefined)
  );
}

async function run() {
  const products = await loadFirebaseProducts();
  const entries = Object.entries(products);
  const compact = Object.fromEntries(entries.map(([key, product]) => [key, compactProduct(key, product)]));

  if (Object.keys(compact).length !== entries.length) {
    throw new Error("A quantidade de produtos compactados diverge do Firebase.");
  }

  await Promise.all([
    writeFile(PRODUCTS_FULL_PATH, `${JSON.stringify(products, null, 2)}\n`, "utf8"),
    writeFile(PRODUCTS_HOME_PATH, `${JSON.stringify(compact, null, 2)}\n`, "utf8")
  ]);

  console.log(`${PRODUCTS_FULL_PATH} e ${PRODUCTS_HOME_PATH} sincronizados diretamente do Firebase com ${entries.length} produtos.`);
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
