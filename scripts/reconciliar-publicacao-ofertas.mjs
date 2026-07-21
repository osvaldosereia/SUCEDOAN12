import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const STATE_PATH = process.env.OFFERS_STATE_PATH || "site/ofertas-automaticas-estado.json";
const HISTORY_PATH = process.env.OFFERS_HISTORY_PATH || "site/ofertas-historico.json";
const BANNERS_PATH = process.env.BANNERS_PATH || "site/banners/banners.json";
const PRODUCTS_HOME_PATH = process.env.PRODUCTS_HOME_PATH || "site/produtos-home.json";
const PUBLICATION_DIR = String(process.env.OFFERS_PUBLICATION_DIR || "").trim();
const MAX_HISTORY = Math.max(1000, Number(process.env.OFFERS_HISTORY_LIMIT || 10000));

const text = value => String(value ?? "").trim();
const number = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

async function readJson(file, fallback = {}) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeState(raw = {}) {
  return {
    versao: number(raw.versao) || 2,
    ultima_execucao: raw.ultima_execucao || null,
    ultima_execucao_status: raw.ultima_execucao_status || "nunca_executada",
    ofertas_ativas: Array.isArray(raw.ofertas_ativas) ? raw.ofertas_ativas : [],
    historico_produtos: raw.historico_produtos && typeof raw.historico_produtos === "object" ? raw.historico_produtos : {},
    solicitacoes_reativacao: Array.isArray(raw.solicitacoes_reativacao) ? raw.solicitacoes_reativacao : [],
    reativacoes: Array.isArray(raw.reativacoes) ? raw.reativacoes : [],
    execucoes: Array.isArray(raw.execucoes) ? raw.execucoes : []
  };
}

function normalizeHistory(raw = {}) {
  return {
    versao: number(raw.versao) || 1,
    atualizado_em: raw.atualizado_em || null,
    ofertas: Array.isArray(raw.ofertas) ? raw.ofertas.filter(Boolean) : [],
    eventos: Array.isArray(raw.eventos) ? raw.eventos.filter(Boolean) : []
  };
}

function normalizeBanners(raw = {}) {
  const source = Array.isArray(raw) ? { banners: raw } : (raw && typeof raw === "object" ? raw : {});
  return {
    ...source,
    schema_version: number(source.schema_version) || 13,
    settings: source.settings && typeof source.settings === "object" ? source.settings : {},
    banners: Array.isArray(source.banners) ? source.banners.filter(Boolean) : []
  };
}

function mergeUniqueBy(items, keyOf, limit = Number.POSITIVE_INFINITY) {
  const map = new Map();
  for (const item of items.filter(Boolean)) {
    const key = text(keyOf(item)) || JSON.stringify(item);
    if (!map.has(key)) map.set(key, item);
    else map.set(key, { ...map.get(key), ...item });
  }
  return [...map.values()].slice(-limit);
}

function requestKey(item) {
  return text(item?.id || `${item?.historico_id || ""}:${item?.produto_key || ""}:${item?.solicitado_em || ""}`);
}

function mergeState(baseRaw, latestRaw, generatedRaw) {
  const base = normalizeState(baseRaw);
  const latest = normalizeState(latestRaw);
  const generated = normalizeState(generatedRaw);
  const baseRequestKeys = new Set(base.solicitacoes_reativacao.map(requestKey));
  const remoteNewRequests = latest.solicitacoes_reativacao.filter(item => !baseRequestKeys.has(requestKey(item)));

  return {
    ...latestRaw,
    ...generatedRaw,
    versao: Math.max(latest.versao, generated.versao, 2),
    ofertas_ativas: generated.ofertas_ativas,
    historico_produtos: { ...latest.historico_produtos, ...generated.historico_produtos },
    solicitacoes_reativacao: mergeUniqueBy(
      [...generated.solicitacoes_reativacao, ...remoteNewRequests],
      requestKey,
      1000
    ),
    reativacoes: mergeUniqueBy(
      [...latest.reativacoes, ...generated.reativacoes],
      item => item?.id || `${item?.produto_key || ""}:${item?.processado_em || ""}`,
      500
    ),
    execucoes: mergeUniqueBy(
      [...latest.execucoes, ...generated.execucoes],
      item => item?.id || item?.executado_em,
      200
    )
  };
}

function mergeHistory(latestRaw, generatedRaw) {
  const latest = normalizeHistory(latestRaw);
  const generated = normalizeHistory(generatedRaw);
  return {
    ...latestRaw,
    ...generatedRaw,
    versao: Math.max(latest.versao, generated.versao, 1),
    atualizado_em: generated.atualizado_em || latest.atualizado_em,
    ofertas: mergeUniqueBy(
      [...latest.ofertas, ...generated.ofertas],
      item => item?.id || `${item?.produto_key || ""}:${item?.criada_em || item?.inicio || ""}`,
      MAX_HISTORY
    ),
    eventos: mergeUniqueBy(
      [...latest.eventos, ...generated.eventos],
      item => item?.id || `${item?.tipo || ""}:${item?.produto_key || ""}:${item?.processado_em || item?.executado_em || item?.criada_em || ""}`,
      2000
    )
  };
}

function mergeBanners(baseRaw, latestRaw, generatedRaw) {
  const base = normalizeBanners(baseRaw);
  const latest = normalizeBanners(latestRaw);
  const generated = normalizeBanners(generatedRaw);
  const baseById = new Map(base.banners.map(item => [text(item?.id), item]));
  const changedById = new Map();

  for (const banner of generated.banners) {
    const id = text(banner?.id);
    if (!id) continue;
    const before = baseById.get(id);
    if (!before || JSON.stringify(before) !== JSON.stringify(banner)) changedById.set(id, banner);
  }

  const merged = latest.banners.map(item => changedById.get(text(item?.id)) || item);
  const present = new Set(merged.map(item => text(item?.id)).filter(Boolean));
  for (const [id, banner] of changedById) {
    if (!present.has(id)) merged.push(banner);
  }

  return {
    ...latestRaw,
    schema_version: Math.max(latest.schema_version, generated.schema_version, 13),
    settings: latest.settings,
    banners: merged,
    updated_at: generatedRaw.updated_at || latestRaw.updated_at || new Date().toISOString()
  };
}

async function run() {
  if (!PUBLICATION_DIR) throw new Error("Defina OFFERS_PUBLICATION_DIR.");
  const temp = name => path.join(PUBLICATION_DIR, name);

  const [
    baseState,
    latestState,
    generatedState,
    latestHistory,
    generatedHistory,
    baseBanners,
    latestBanners,
    generatedBanners,
    generatedHome
  ] = await Promise.all([
    readJson(temp("base-estado.json")),
    readJson(STATE_PATH),
    readJson(temp("gerado-estado.json")),
    readJson(HISTORY_PATH),
    readJson(temp("gerado-historico.json")),
    readJson(temp("base-banners.json")),
    readJson(BANNERS_PATH),
    readJson(temp("gerado-banners.json")),
    readJson(temp("gerado-produtos-home.json"))
  ]);

  await Promise.all([
    writeJson(PRODUCTS_HOME_PATH, generatedHome),
    writeJson(STATE_PATH, mergeState(baseState, latestState, generatedState)),
    writeJson(HISTORY_PATH, mergeHistory(latestHistory, generatedHistory)),
    writeJson(BANNERS_PATH, mergeBanners(baseBanners, latestBanners, generatedBanners))
  ]);

  console.log(JSON.stringify({ status: "publicacao_reconciliada", diretorio: PUBLICATION_DIR }));
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
