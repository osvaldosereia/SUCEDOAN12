import { createSign } from "node:crypto";
import { writeFile } from "node:fs/promises";

const DEFAULT_FIREBASE_DATABASE_URL = "https://cedar-chemist-310801-default-rtdb.firebaseio.com";
const PRODUCTS_HOME_PATH = process.env.PRODUCTS_HOME_PATH || "site/produtos-home.json";
const PRODUCTS_ADMIN_PATH = process.env.PRODUCTS_ADMIN_PATH || "site/produtos-admin.json";
const CATALOG_VERSION_PATH = process.env.CATALOG_VERSION_PATH || "catalog-version.json";
let firebaseAccessToken;

const text = value => String(value ?? "").trim();
const number = value => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = value => Math.round(Math.max(0, number(value)) * 100) / 100;
const integer = (value, minimum = 0) => Math.max(minimum, Math.floor(number(value) || minimum));
const bool = value => value === true || value === 1 || ["1", "true", "sim", "yes"].includes(text(value).toLowerCase());

function firebaseUrl(pathname) {
  const configured = text(process.env.FIREBASE_DATABASE_URL);
  const base = (configured || DEFAULT_FIREBASE_DATABASE_URL).replace(/\/+$/, "");
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
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth-type:jwt-bearer", assertion })
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
  return !["I", "INATIVO", "INACTIVE", "0", "FALSE", "EXCLUIDO"].includes(situation)
    && product?.ativo !== false && product?.visivel !== false;
}

function isPublicMugModel(product) {
  const category = text(product?.categoria ?? product?.category).toLowerCase();
  return bool(product?.modelo_publico)
    && (bool(product?.modelo_caneca) || category.includes("caneca"));
}

function publicImageValue(value) {
  const source = text(value);
  if (!source || /^data:/i.test(source)) return "";

  const rawMatch = source.match(/^https:\/\/raw\.githubusercontent\.com\/osvaldosereia\/SUCEDOAN12\/(?:main|master)\/(.+)$/i);
  if (rawMatch) return rawMatch[1];

  if (/^https?:\/\//i.test(source)) {
    try {
      const parsed = new URL(source);
      if (/^(?:www\.)?donaantonia\.com\.br$/i.test(parsed.hostname)) return parsed.pathname.replace(/^\/+/, "");
      return source;
    } catch {
      return source;
    }
  }

  let clean = source.replace(/^(?:\.\.\/|\.\/)+/g, "").replace(/^\/+/, "");
  if (/^img\/(produtos_3|produtos_2|produtos|kits)\//i.test(clean)) clean = `site/${clean}`;
  return clean;
}

function publicPrice(product) {
  return money(product?.preco ?? product?.price ?? product?.valor);
}

function publicStock(product) {
  return integer(product?.estoque);
}

function isPubliclyAvailable(product) {
  if (publicPrice(product) <= 0) return false;
  if (isPublicMugModel(product)) return true;
  return isActive(product) && publicStock(product) > 0;
}

function mediaList(product = {}) {
  const list = [];
  const push = value => {
    const normalized = publicImageValue(value);
    if (normalized && !list.includes(normalized)) list.push(normalized);
  };
  [product.url_imagem, product.imagem_url, product.imagem, product.image, product.img, product.foto, product.foto_url, product.imagem_path, product.mockup_1, product.mockup_2, product.mockup_3]
    .forEach(push);
  if (Array.isArray(product.imagens)) product.imagens.forEach(push);
  if (Array.isArray(product.imagens_site)) product.imagens_site.forEach(push);
  return list;
}

function compactProduct(key, product = {}) {
  const media = mediaList(product);
  const compact = {
    firebaseKey: key,
    id: text(product.id || key),
    codigo: text(product.codigo || product.sku || product.id || key),
    sku: text(product.sku),
    nome: text(product.nome || product.name || product.titulo),
    slug: text(product.slug),
    categoria: text(product.categoria),
    subcategoria: text(product.subcategoria),
    subsubcategoria: text(product.subsubcategoria),
    marca: text(product.marca),
    fornecedor: text(product.fornecedor),
    codigo_fornecedor: text(product.codigo_fornecedor),
    embalagem: text(product.embalagem),
    unidade: text(product.unidade),
    preco: publicPrice(product),
    preco_custo: money(product.preco_custo),
    preco_atacado: money(product.preco_atacado),
    preco_oferta: money(product.preco_oferta ?? product.precoOferta),
    estoque: publicStock(product),
    estoque_minimo: integer(product.estoque_minimo),
    multiplo_venda: integer(product.multiplo_venda, 1),
    quantidade_caixa: integer(product.quantidade_caixa),
    situacao: isActive(product) ? "A" : "I",
    modelo_caneca: bool(product.modelo_caneca),
    modelo_publico: bool(product.modelo_publico),
    personalizacao_publica: bool(product.personalizacao_publica),
    produto_sob_encomenda: isPublicMugModel(product),
    url_imagem: media[0] || "",
    imagens: media,
    mockup_1: publicImageValue(product.mockup_1),
    mockup_2: publicImageValue(product.mockup_2),
    mockup_3: publicImageValue(product.mockup_3),
    arte_horizontal: publicImageValue(product.arte_horizontal || product.arte_personalizacao || product.arte_impressao?.url),
    descricao: text(product.descricao),
    descricao_curta: text(product.descricao_curta || product.descricao).slice(0, 220),
    descricao_status: text(product.descricao_status),
    seo_titulo: text(product.seo_titulo),
    seo_descricao: text(product.seo_descricao),
    seo_status: text(product.seo_status),
    validade: text(product.validade || product.data_validade),
    data_inicio_oferta: text(product.data_inicio_oferta || product.inicio_oferta),
    validade_oferta: text(product.validade_oferta || product.validadeOferta),
    oferta_origem: text(product.oferta_origem),
    oferta_regra_id: text(product.oferta_regra_id),
    gtin: text(product.gtin || product.ean),
    ean: text(product.ean || product.gtin),
    gtin_tributavel: text(product.gtin_tributavel),
    unidade_tributavel: text(product.unidade_tributavel),
    ncm: text(product.ncm),
    cest: text(product.cest),
    origem_tributaria: text(product.origem_tributaria),
    cfop: text(product.cfop),
    gondola: text(product.gondola || product["gôndola"]),
    prateleira: text(product.prateleira),
    localizacao: text(product.localizacao),
    tags: Array.isArray(product.tags) ? product.tags : [],
    tag_global: text(product.tag_global),
    destaque: bool(product.destaque),
    ordem: Number.isFinite(Number(product.ordem)) ? Number(product.ordem) : undefined,
    peso: Math.max(0, number(product.peso)),
    largura: Math.max(0, number(product.largura)),
    altura: Math.max(0, number(product.altura)),
    comprimento: Math.max(0, number(product.comprimento)),
    bling_id: text(product.bling_id),
    last_update: product.last_update || undefined,
    updated_at: product.updated_at || undefined
  };

  if (!(compact.preco_oferta > 0 && compact.preco_oferta < compact.preco)) {
    delete compact.preco_oferta;
    delete compact.data_inicio_oferta;
    delete compact.validade_oferta;
    delete compact.oferta_origem;
    delete compact.oferta_regra_id;
  }

  return Object.fromEntries(Object.entries(compact).filter(([, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "boolean") return value;
    return value !== "" && value !== null && value !== undefined;
  }));
}

function adminProduct(key, product = {}) {
  const compact = compactProduct(key, product);
  delete compact.descricao;
  delete compact.seo_descricao;
  return compact;
}

async function run() {
  const products = await loadFirebaseProducts();
  const entries = Object.entries(products).filter(([, product]) => product && typeof product === "object" && !Array.isArray(product));
  const visibleEntries = entries.filter(([, product]) => isPubliclyAvailable(product));
  const publicCatalog = Object.fromEntries(visibleEntries.map(([key, product]) => [key, compactProduct(key, product)]));
  const adminCatalog = Object.fromEntries(entries.map(([key, product]) => [key, adminProduct(key, product)]));

  if (Object.keys(publicCatalog).length !== visibleEntries.length) {
    throw new Error("A quantidade de produtos públicos compactados diverge da seleção do Firebase.");
  }
  if (Object.keys(adminCatalog).length !== entries.length) {
    throw new Error("A quantidade de produtos administrativos diverge do Firebase.");
  }

  const timestamp = new Date().toISOString();
  const catalogVersion = {
    version: `catalog-${Date.now()}`,
    updatedAt: timestamp,
    products: PRODUCTS_HOME_PATH,
    adminProducts: PRODUCTS_ADMIN_PATH,
    changed: ["products", "admin-products"],
    productCount: Object.keys(publicCatalog).length,
    adminProductCount: Object.keys(adminCatalog).length,
    source: "firebase-official-sync",
    instructions: "Catálogos atualizados do Firebase; modelos públicos de canecas são tratados como produtos sob encomenda e não dependem de estoque físico."
  };

  await Promise.all([
    writeFile(PRODUCTS_HOME_PATH, `${JSON.stringify(publicCatalog)}\n`, "utf8"),
    writeFile(PRODUCTS_ADMIN_PATH, `${JSON.stringify(adminCatalog)}\n`, "utf8"),
    writeFile(CATALOG_VERSION_PATH, `${JSON.stringify(catalogVersion, null, 2)}\n`, "utf8")
  ]);
  console.log(`${PRODUCTS_HOME_PATH}, ${PRODUCTS_ADMIN_PATH} e ${CATALOG_VERSION_PATH} sincronizados com ${visibleEntries.length} produtos públicos e ${entries.length} produtos administrativos.`);
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});