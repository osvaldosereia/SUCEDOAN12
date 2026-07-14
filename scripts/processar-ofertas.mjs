import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CONFIG_PATH = process.env.OFFERS_CONFIG_PATH || "site/ofertas-automaticas.json";
const STATE_PATH = process.env.OFFERS_STATE_PATH || "site/ofertas-automaticas-estado.json";
const PRODUCTS_PATH = process.env.PRODUCTS_PATH || "site/produtos.json";
const PRODUCTS_HOME_PATH = process.env.PRODUCTS_HOME_PATH || "site/produtos-home.json";
const TIME_ZONE = "America/Sao_Paulo";

const number = value => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = value => Math.round(Math.max(0, number(value)) * 100) / 100;
const text = value => String(value ?? "").trim();
const normalizedText = value => text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("pt-BR");
const nowIso = clock => clock.toISOString();

function saoPauloDate(clock) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(clock);
  const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

function offerEndsAt(value) {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T23:59:59-03:00`);
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isActive(product) {
  const situation = text(product.situacao ?? product.status ?? "A").toUpperCase();
  return !["I", "INATIVO", "INACTIVE", "0", "FALSE"].includes(situation);
}

function hasCurrentOffer(product, clock) {
  const offer = money(product.preco_oferta ?? product.precoOferta);
  const regular = money(product.preco ?? product.price ?? product.valor);
  if (!(offer > 0 && regular > offer)) return false;
  const ends = offerEndsAt(product.validade_oferta ?? product.validadeOferta);
  return !ends || ends.getTime() >= clock.getTime();
}

function isAutomaticOffer(product) {
  return text(product.oferta_origem) === "campanha_automatica";
}

function closeAutomaticOffer(product, timestamp) {
  delete product.preco_oferta;
  delete product.precoOferta;
  delete product.data_inicio_oferta;
  delete product.inicio_oferta;
  delete product.validade_oferta;
  delete product.validadeOferta;
  delete product.oferta_origem;
  delete product.oferta_regra_id;
  delete product.oferta_criada_em;
  product.updated_at = timestamp;
  product.last_update = Date.now();
}

function firebasePatchFor(product, opening) {
  if (opening) {
    return {
      preco_oferta: product.preco_oferta,
      data_inicio_oferta: product.data_inicio_oferta,
      validade_oferta: product.validade_oferta,
      oferta_origem: product.oferta_origem,
      oferta_regra_id: product.oferta_regra_id,
      oferta_criada_em: product.oferta_criada_em,
      updated_at: product.updated_at,
      last_update: product.last_update
    };
  }
  return {
    preco_oferta: null,
    precoOferta: null,
    data_inicio_oferta: null,
    inicio_oferta: null,
    validade_oferta: null,
    validadeOferta: null,
    oferta_origem: null,
    oferta_regra_id: null,
    oferta_criada_em: null,
    updated_at: product.updated_at,
    last_update: product.last_update
  };
}

function homeProduct(key, product) {
  const image = text(product.url_imagem || product.imagem_url || product.imagem || product.image || product.img || product.foto || product.foto_url || product.imagem_path);
  const name = text(product.nome || product.name || product.titulo);
  const code = text(product.codigo || product.sku || product.id || key);
  const tags = Array.isArray(product.tags) ? product.tags.map(text).filter(Boolean).slice(0, 8) : [];
  return {
    key, firebaseKey: key, id: key, codigo: code, nome: name,
    categoria: text(product.categoria), subcategoria: text(product.subcategoria), subsubcategoria: text(product.subsubcategoria),
    marca: text(product.marca), embalagem: text(product.embalagem), preco: money(product.preco ?? product.price ?? product.valor),
    preco_oferta: money(product.preco_oferta ?? product.precoOferta), estoque: Math.max(0, Math.floor(number(product.estoque))),
    situacao: isActive(product) ? "A" : "I", url_imagem: image, imagem: image, imagem_url: image,
    imagem_path: text(product.imagem_path), imagem_storage: text(product.imagem_storage),
    slug: normalizedText(name || code || key).toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
    tags, descricao_curta: text(product.descricao_curta || product.descricao).slice(0, 180),
    validade: text(product.validade), validade_oferta: text(product.validade_oferta), gtin: text(product.gtin || product.ean)
  };
}

function normalizeConfig(raw = {}) {
  return {
    versao: 1,
    ativo: raw.ativo !== false,
    exigir_quantidade_completa: raw.exigir_quantidade_completa !== false,
    timezone: raw.timezone || TIME_ZONE,
    regras: Array.isArray(raw.regras) ? raw.regras : []
  };
}

function normalizeState(raw = {}) {
  return {
    versao: 1,
    ultima_execucao: raw.ultima_execucao || null,
    ultima_execucao_status: raw.ultima_execucao_status || "nunca_executada",
    ofertas_ativas: Array.isArray(raw.ofertas_ativas) ? raw.ofertas_ativas : [],
    historico_produtos: raw.historico_produtos && typeof raw.historico_produtos === "object" ? raw.historico_produtos : {},
    execucoes: Array.isArray(raw.execucoes) ? raw.execucoes : []
  };
}

function calculateExecution({ products, config: rawConfig, state: rawState, executionId, clock = new Date() }) {
  const config = normalizeConfig(rawConfig);
  const state = normalizeState(rawState);
  const timestamp = nowIso(clock);
  const today = saoPauloDate(clock);
  const changed = [];
  const closed = [];
  const created = [];
  const selected = new Set();
  const closedKeys = new Set();
  let requestedTotal = 0;
  const rules = config.regras.filter(rule => rule && rule.id && text(rule.categoria));
  const cancelled = new Set(rules.filter(rule => rule.status === "cancelada" || rule.encerrar_ofertas_ativas === true).map(rule => text(rule.id)));

  for (const [key, product] of Object.entries(products)) {
    const automatic = isAutomaticOffer(product);
    const ends = offerEndsAt(product.validade_oferta ?? product.validadeOferta);
    const shouldClose = automatic && (cancelled.has(text(product.oferta_regra_id)) || (ends && ends.getTime() < clock.getTime()));
    if (!shouldClose) continue;
    const reason = cancelled.has(text(product.oferta_regra_id)) ? "regra_cancelada" : "vencida";
    closeAutomaticOffer(product, timestamp);
    closedKeys.add(key);
    changed.push({ key, product, opening: false });
    closed.push({ key, reason });
  }

  if (config.ativo) {
    for (const rule of rules.filter(rule => rule.status === "ativa")) {
      const desired = Math.max(1, Math.min(100, Math.floor(number(rule.quantidade_por_execucao) || 1)));
      requestedTotal += desired;
      const discount = Math.max(1, Math.min(50, number(rule.desconto_percentual) || 1));
      const duration = Math.max(1, Math.min(365, Math.floor(number(rule.duracao_dias) || 7)));
      const category = normalizedText(rule.categoria);
      const candidates = Object.entries(products)
        .filter(([key, product]) => !selected.has(key) && !closedKeys.has(key) && normalizedText(product.categoria) === category && isActive(product) && number(product.estoque) > 0 && money(product.preco ?? product.price ?? product.valor) > 0)
        .filter(([, product]) => !hasCurrentOffer(product, clock))
        .sort(([keyA, productA], [keyB, productB]) => {
          const historyA = new Date(state.historico_produtos[keyA]?.ultima_oferta_em || 0).getTime() || 0;
          const historyB = new Date(state.historico_produtos[keyB]?.ultima_oferta_em || 0).getTime() || 0;
          return historyA - historyB || text(productA.nome).localeCompare(text(productB.nome), "pt-BR");
        });

      if (config.exigir_quantidade_completa && candidates.length < desired) continue;
      for (const [key, product] of candidates.slice(0, desired)) {
        const regular = money(product.preco ?? product.price ?? product.valor);
        product.preco_oferta = money(regular * (1 - discount / 100));
        product.data_inicio_oferta = today;
        product.validade_oferta = `${addDays(today, duration)}T23:59:59-03:00`;
        product.oferta_origem = "campanha_automatica";
        product.oferta_regra_id = rule.id;
        product.oferta_criada_em = timestamp;
        product.updated_at = timestamp;
        product.last_update = Date.now();
        selected.add(key);
        changed.push({ key, product, opening: true });
        created.push({ key, rule, product });
        state.historico_produtos[key] = { ultima_oferta_em: timestamp, regra_id: rule.id };
      }
    }
  }

  const activeOffers = Object.entries(products)
    .filter(([, product]) => isAutomaticOffer(product) && hasCurrentOffer(product, clock))
    .map(([key, product]) => ({
      produto_key: key, nome: text(product.nome), categoria: text(product.categoria), origem: "campanha_automatica",
      regra_id: text(product.oferta_regra_id), desconto_percentual: money(100 * (1 - money(product.preco_oferta) / money(product.preco))),
      preco_normal: money(product.preco), preco_oferta: money(product.preco_oferta), inicio: text(product.data_inicio_oferta), fim: text(product.validade_oferta)
    }));
  const summary = { ofertas_solicitadas: requestedTotal, ofertas_criadas: created.length, ofertas_nao_criadas: Math.max(0, requestedTotal - created.length), ofertas_encerradas: closed.length, vencidos: closed.filter(item => item.reason === "vencida").length };
  state.ultima_execucao = timestamp;
  state.ultima_execucao_status = "sucesso";
  state.ofertas_ativas = activeOffers;
  state.execucoes = [...state.execucoes, { id: executionId, executado_em: timestamp, origem: "make", resumo: summary }].slice(-100);
  return { products, state, changed, created, closed, summary };
}

async function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function firebaseUrl(pathname) {
  const base = text(process.env.FIREBASE_DATABASE_URL).replace(/\/+$/, "");
  if (!base) throw new Error("Defina o secret FIREBASE_DATABASE_URL.");
  const auth = text(process.env.FIREBASE_AUTH_TOKEN);
  return `${base}/${pathname.replace(/^\/+/, "")}.json${auth ? `?auth=${encodeURIComponent(auth)}` : ""}`;
}

async function loadFirebaseProducts() {
  const response = await fetch(firebaseUrl("produtos"), { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Firebase GET produtos: ${response.status} ${await response.text()}`);
  const data = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Firebase retornou produtos em formato invÃ¡lido.");
  return data;
}

async function syncFirebase(changed) {
  for (const item of changed) {
    const response = await fetch(firebaseUrl(`produtos/${encodeURIComponent(item.key)}`), {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(firebasePatchFor(item.product, item.opening))
    });
    if (!response.ok) throw new Error(`Firebase PATCH produto ${item.key}: ${response.status} ${await response.text()}`);
  }
}

function eventExecutionId() {
  const eventFile = text(process.env.GITHUB_EVENT_PATH);
  if (!eventFile || !existsSync(eventFile)) return `manual-${Date.now()}`;
  const event = JSON.parse(readFileSync(eventFile, "utf8"));
  return text(event.client_payload?.execucao_id || event.client_payload?.execution_id || event.client_payload?.solicitado_em || event.delivery) || `github-${Date.now()}`;
}

async function run() {
  const config = await readJson(CONFIG_PATH, {});
  const previousState = await readJson(STATE_PATH, {});
  const executionId = eventExecutionId();
  if (normalizeState(previousState).execucoes.some(run => run.id === executionId)) {
    console.log(JSON.stringify({ status: "ignorada", motivo: "execucao_ja_processada", executionId }));
    return;
  }
  const products = await loadFirebaseProducts();
  const result = calculateExecution({ products, config, state: previousState, executionId });
  await syncFirebase(result.changed);
  await writeJson(PRODUCTS_PATH, result.products);
  await writeJson(PRODUCTS_HOME_PATH, Object.fromEntries(Object.entries(result.products).map(([key, product]) => [key, homeProduct(key, product)])));
  await writeJson(STATE_PATH, result.state);
  console.log(JSON.stringify({ status: "sucesso", executionId, ...result.summary }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
}

export { calculateExecution, homeProduct, normalizeConfig, normalizeState };

