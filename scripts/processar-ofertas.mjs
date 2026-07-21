import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createSign } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CONFIG_PATH = process.env.OFFERS_CONFIG_PATH || "site/ofertas-automaticas.json";
const STATE_PATH = process.env.OFFERS_STATE_PATH || "site/ofertas-automaticas-estado.json";
const HISTORY_PATH = process.env.OFFERS_HISTORY_PATH || "site/ofertas-historico.json";
const BANNERS_PATH = process.env.BANNERS_PATH || "site/banners/banners.json";
const PRODUCTS_HOME_PATH = process.env.PRODUCTS_HOME_PATH || "site/produtos-home.json";
const TIME_ZONE = process.env.OFFERS_TIME_ZONE || "America/Cuiaba";
const MAX_HISTORY = Math.max(1000, Number(process.env.OFFERS_HISTORY_LIMIT || 10000));

const number = value => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = value => Math.round(Math.max(0, number(value)) * 100) / 100;
const text = value => String(value ?? "").trim();
const normalizedText = value => text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("pt-BR");
const normalizedRef = value => normalizedText(value).replace(/[^A-Z0-9]/g, "");
const nowIso = clock => clock.toISOString();
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

function addDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

function offerEndsAt(value) {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T23:59:59-04:00`);
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}T23:59:59-04:00`);
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnly(value) {
  const raw = text(value);
  if (!raw) return "";
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : localDate(parsed);
}

function durationDays(start, end, fallback = 7) {
  const startDate = dateOnly(start);
  const endDate = dateOnly(end);
  if (!startDate || !endDate) return Math.max(1, Math.floor(number(fallback) || 7));
  const startMs = Date.parse(`${startDate}T12:00:00Z`);
  const endMs = Date.parse(`${endDate}T12:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return Math.max(1, Math.floor(number(fallback) || 7));
  return Math.max(1, Math.round((endMs - startMs) / 86400000));
}

function isActive(product) {
  const situation = text(product?.situacao ?? product?.status ?? "A").toUpperCase();
  return !["I", "INATIVO", "INACTIVE", "0", "FALSE", "EXCLUIDO"].includes(situation);
}

function productExpired(product, clock) {
  const end = offerEndsAt(product?.validade ?? product?.vencimento ?? product?.data_validade);
  return Boolean(end && end.getTime() < clock.getTime());
}

function productEligible(product, clock) {
  return isActive(product)
    && number(product?.estoque) > 0
    && money(product?.preco ?? product?.price ?? product?.valor) > 0
    && !productExpired(product, clock);
}

function hasCurrentOffer(product, clock) {
  const offer = money(product?.preco_oferta ?? product?.precoOferta);
  const regular = money(product?.preco ?? product?.price ?? product?.valor);
  if (!(offer > 0 && regular > offer)) return false;
  const ends = offerEndsAt(product?.validade_oferta ?? product?.validadeOferta);
  return !ends || ends.getTime() >= clock.getTime();
}

function isAutomaticOffer(product) {
  return ["campanha_automatica", "reativacao_historico"].includes(text(product?.oferta_origem));
}

function hasProtectedOffer(product) {
  const offer = money(product?.preco_oferta ?? product?.precoOferta);
  const regular = money(product?.preco ?? product?.price ?? product?.valor);
  return offer > 0 && regular > offer && !isAutomaticOffer(product);
}

function productCode(key, product) {
  return text(product?.codigo || product?.sku || product?.id || key);
}

function productRefs(key, product) {
  return new Set([
    key,
    product?.firebaseKey,
    product?.id,
    product?.codigo,
    product?.sku,
    product?.gtin,
    product?.ean
  ].map(normalizedRef).filter(Boolean));
}

function closeAutomaticOffer(product, timestamp) {
  const snapshot = offerSnapshot("", product);
  delete product.preco_oferta;
  delete product.precoOferta;
  delete product.data_inicio_oferta;
  delete product.inicio_oferta;
  delete product.validade_oferta;
  delete product.validadeOferta;
  delete product.oferta_origem;
  delete product.oferta_regra_id;
  delete product.oferta_criada_em;
  delete product.oferta_reativada_de;
  product.updated_at = timestamp;
  product.last_update = Date.now();
  return snapshot;
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
      oferta_reativada_de: product.oferta_reativada_de || null,
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
    oferta_reativada_de: null,
    updated_at: product.updated_at,
    last_update: product.last_update
  };
}

function homeProduct(key, product) {
  const image = text(product.url_imagem || product.imagem_url || product.imagem || product.image || product.img || product.foto || product.foto_url || product.imagem_path);
  const name = text(product.nome || product.name || product.titulo);
  const code = productCode(key, product);
  const compact = {
    codigo: code, nome: name,
    categoria: text(product.categoria), subcategoria: text(product.subcategoria), subsubcategoria: text(product.subsubcategoria),
    marca: text(product.marca), embalagem: text(product.embalagem), preco: money(product.preco ?? product.price ?? product.valor),
    preco_oferta: money(product.preco_oferta ?? product.precoOferta), estoque: Math.max(0, Math.floor(number(product.estoque))),
    situacao: isActive(product) ? "A" : "I", url_imagem: image,
    descricao_curta: text(product.descricao_curta || product.descricao).slice(0, 180),
    validade: text(product.validade), validade_oferta: text(product.validade_oferta), gtin: text(product.gtin || product.ean)
  };
  return Object.fromEntries(Object.entries(compact).filter(([, value]) => value !== "" && value !== null && value !== undefined && value !== 0));
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
    versao: 2,
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
    versao: 1,
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

function offerSnapshot(key, product) {
  const regular = money(product?.preco ?? product?.price ?? product?.valor);
  const offer = money(product?.preco_oferta ?? product?.precoOferta);
  return {
    produto_key: key,
    codigo: productCode(key, product),
    nome: text(product?.nome || product?.name || product?.titulo),
    categoria: text(product?.categoria),
    regra_id: text(product?.oferta_regra_id),
    origem: text(product?.oferta_origem || "campanha_automatica"),
    preco_normal: regular,
    preco_oferta: offer,
    desconto_percentual: regular > 0 && offer > 0 && offer < regular ? money(100 * (1 - offer / regular)) : 0,
    inicio: text(product?.data_inicio_oferta ?? product?.inicio_oferta),
    fim: text(product?.validade_oferta ?? product?.validadeOferta)
  };
}

function historyId(key, timestamp) {
  return `oferta-${normalizedRef(key).toLocaleLowerCase("pt-BR") || "produto"}-${Date.parse(timestamp) || Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function historyById(history, id) {
  return history.ofertas.find(item => text(item.id) === text(id));
}

function latestHistoryForProduct(history, key) {
  return history.ofertas
    .filter(item => text(item.produto_key) === text(key))
    .sort((a, b) => Date.parse(b.criada_em || b.inicio || 0) - Date.parse(a.criada_em || a.inicio || 0))[0] || null;
}

function activeHistoryForProduct(history, key) {
  return history.ofertas.find(item => text(item.produto_key) === text(key) && item.status === "ativa") || null;
}

function addHistoryRecord(history, snapshot, timestamp, extra = {}) {
  const record = {
    id: historyId(snapshot.produto_key, timestamp),
    produto_key: snapshot.produto_key,
    codigo: snapshot.codigo,
    nome: snapshot.nome,
    categoria: snapshot.categoria,
    regra_id: snapshot.regra_id,
    origem: snapshot.origem || "campanha_automatica",
    status: "ativa",
    preco_normal: money(snapshot.preco_normal),
    preco_oferta: money(snapshot.preco_oferta),
    desconto_percentual: money(snapshot.desconto_percentual),
    inicio: snapshot.inicio,
    fim: snapshot.fim,
    duracao_dias: durationDays(snapshot.inicio, snapshot.fim, extra.duracao_dias || 7),
    criada_em: timestamp,
    encerrada_em: null,
    motivo_encerramento: null,
    banner_ids: [],
    ...extra
  };
  history.ofertas.push(record);
  return record;
}

function closeHistoryRecord(history, key, timestamp, reason, snapshot = {}) {
  let record = activeHistoryForProduct(history, key);
  if (!record) {
    record = addHistoryRecord(history, { ...snapshot, produto_key: key }, snapshot.criada_em || timestamp, { migrado: true });
  }
  record.status = reason === "vencida" ? "vencida" : reason === "regra_cancelada" ? "cancelada" : "encerrada";
  record.encerrada_em = timestamp;
  record.motivo_encerramento = reason;
  record.atualizado_em = timestamp;
  return record;
}

function ensureActiveHistory(history, key, product, timestamp) {
  let record = activeHistoryForProduct(history, key);
  const snapshot = offerSnapshot(key, product);
  if (!record) record = addHistoryRecord(history, snapshot, text(product.oferta_criada_em) || timestamp, { migrado: true });
  Object.assign(record, snapshot, { status: "ativa", encerrada_em: null, motivo_encerramento: null, atualizado_em: timestamp });
  return record;
}

function migrateLegacyHistory({ history, state, products, config, clock }) {
  const timestamp = nowIso(clock);
  const rules = new Map(config.regras.map(rule => [text(rule.id), rule]));
  for (const [key, product] of Object.entries(products)) {
    if (isAutomaticOffer(product) && hasCurrentOffer(product, clock)) ensureActiveHistory(history, key, product, timestamp);
  }
  for (const [key, legacy] of Object.entries(state.historico_produtos || {})) {
    if (latestHistoryForProduct(history, key)) continue;
    const product = products[key];
    if (!product) continue;
    const rule = rules.get(text(legacy?.regra_id));
    const regular = money(product.preco ?? product.price ?? product.valor);
    const currentActive = isAutomaticOffer(product) && hasCurrentOffer(product, clock);
    const discount = currentActive
      ? offerSnapshot(key, product).desconto_percentual
      : Math.max(1, Math.min(50, number(rule?.desconto_percentual) || 1));
    const offer = currentActive ? money(product.preco_oferta) : money(regular * (1 - discount / 100));
    const start = currentActive ? text(product.data_inicio_oferta) : text(legacy?.ultima_oferta_em);
    const end = currentActive ? text(product.validade_oferta) : "";
    addHistoryRecord(history, {
      produto_key: key,
      codigo: productCode(key, product),
      nome: text(product.nome),
      categoria: text(product.categoria),
      regra_id: text(legacy?.regra_id),
      origem: currentActive ? text(product.oferta_origem) : "campanha_automatica",
      preco_normal: regular,
      preco_oferta: offer,
      desconto_percentual: discount,
      inicio: start,
      fim: end
    }, text(legacy?.ultima_oferta_em) || timestamp, {
      status: currentActive ? "ativa" : "encerrada",
      encerrada_em: currentActive ? null : text(legacy?.ultima_oferta_em) || timestamp,
      motivo_encerramento: currentActive ? null : "migrado_historico_legado",
      migrado: true,
      dados_estimados: !currentActive,
      duracao_dias: Math.max(1, Math.floor(number(rule?.duracao_dias) || 7))
    });
  }
}

function bannerRefs(banner) {
  const refs = [
    banner?.origem?.valor,
    banner?.link?.valor,
    banner?.produto_key,
    banner?.produto_id,
    banner?.produto_codigo
  ];
  for (const item of banner?.origem?.produtos || []) {
    refs.push(item?.firebaseKey, item?.id, item?.codigo, item?.sku, item?.gtin, item?.ean);
  }
  return new Set(refs.map(normalizedRef).filter(value => value && value !== "PRODUTO"));
}

function linkedBanners(catalog, key, product) {
  const refs = productRefs(key, product);
  return catalog.banners.filter(banner => {
    const values = bannerRefs(banner);
    return [...values].some(value => refs.has(value));
  });
}

function deactivateLinkedBanners(catalog, key, product, timestamp, reason) {
  const linked = linkedBanners(catalog, key, product);
  for (const banner of linked) {
    banner.ativo = false;
    banner.desativado_em = timestamp;
    banner.motivo_desativacao = reason;
    banner.atualizado_em = timestamp;
    banner.updated_at = timestamp;
    banner.automacao = { ...(banner.automacao || {}), sincronizado_com_oferta: true, ultima_sincronizacao: timestamp };
  }
  return linked.map(item => text(item.id)).filter(Boolean);
}

function reactivateLinkedBanners(catalog, key, product, timestamp, start, end, historyRecordId) {
  const linked = linkedBanners(catalog, key, product);
  const snapshot = offerSnapshot(key, product);
  for (const banner of linked) {
    banner.ativo = true;
    banner.periodo = {
      ...(banner.periodo || {}),
      inicio: start,
      fim: end,
      fuso_horario: TIME_ZONE,
      regra_duracao: "reativacao_da_oferta",
      reativado_do_historico: historyRecordId
    };
    banner.oferta = {
      ...(banner.oferta || {}),
      preco_antigo: snapshot.preco_normal,
      preco_novo: snapshot.preco_oferta,
      desconto_percentual: snapshot.desconto_percentual,
      validade_oferta: end,
      reativada_em: timestamp
    };
    banner.atualizado_em = timestamp;
    banner.updated_at = timestamp;
    delete banner.desativado_em;
    delete banner.motivo_desativacao;
    banner.automacao = {
      ...(banner.automacao || {}),
      sincronizado_com_oferta: true,
      reativado_por_oferta: true,
      oferta_historico_id: historyRecordId,
      reativado_em: timestamp
    };
  }
  return linked.map(item => text(item.id)).filter(Boolean);
}

function reasonToClose(product, cancelledRules, clock) {
  if (!isAutomaticOffer(product)) return "";
  if (cancelledRules.has(text(product.oferta_regra_id))) return "regra_cancelada";
  const end = offerEndsAt(product.validade_oferta ?? product.validadeOferta);
  if (end && end.getTime() < clock.getTime()) return "vencida";
  if (!isActive(product)) return "produto_inativo";
  if (number(product.estoque) <= 0) return "estoque_zerado";
  if (money(product.preco ?? product.price ?? product.valor) <= 0) return "preco_invalido";
  if (productExpired(product, clock)) return "produto_vencido";
  return "";
}

function calculateExecution({ products, config: rawConfig, state: rawState, history: rawHistory, banners: rawBanners, executionId, mode = "completo", clock = new Date() }) {
  const config = normalizeConfig(rawConfig);
  const state = normalizeState(rawState);
  const history = normalizeHistory(rawHistory);
  const banners = normalizeBanners(rawBanners);
  const timestamp = nowIso(clock);
  const today = localDate(clock);
  const changedMap = new Map();
  const closed = [];
  const created = [];
  const reactivated = [];
  const reactivationFailures = [];
  const selected = new Set();
  const closedKeys = new Set();
  const rules = config.regras.filter(rule => rule && rule.id && text(rule.categoria));
  const rulesById = new Map(rules.map(rule => [text(rule.id), rule]));
  const cancelled = new Set(rules.filter(rule => rule.status === "cancelada" || rule.encerrar_ofertas_ativas === true).map(rule => text(rule.id)));
  let requestedTotal = 0;
  let bannersDeactivated = 0;
  let bannersReactivated = 0;

  const markChanged = (key, product, opening) => changedMap.set(key, { key, product, opening });
  migrateLegacyHistory({ history, state, products, config, clock });

  for (const [key, product] of Object.entries(products)) {
    const reason = reasonToClose(product, cancelled, clock);
    if (!reason) continue;
    const snapshot = offerSnapshot(key, product);
    closeHistoryRecord(history, key, timestamp, reason, snapshot);
    closeAutomaticOffer(product, timestamp);
    closedKeys.add(key);
    markChanged(key, product, false);
    const bannerIds = deactivateLinkedBanners(banners, key, product, timestamp, reason);
    bannersDeactivated += bannerIds.length;
    closed.push({ key, reason, banner_ids: bannerIds });
  }

  const requests = [...state.solicitacoes_reativacao];
  state.solicitacoes_reativacao = [];
  for (const request of requests) {
    const requestId = text(request?.id) || `reativacao-${Date.now()}`;
    const source = historyById(history, request?.historico_id) || latestHistoryForProduct(history, request?.produto_key);
    const key = text(request?.produto_key || source?.produto_key);
    const product = products[key];
    let error = "";
    if (!key || !product) error = "produto_nao_encontrado";
    else if (!productEligible(product, clock)) error = number(product?.estoque) <= 0 ? "estoque_zerado" : "produto_indisponivel";
    else if (hasProtectedOffer(product)) error = "oferta_manual_protegida";

    if (error) {
      const failure = { id: requestId, historico_id: text(request?.historico_id), produto_key: key, status: "falha", motivo: error, processado_em: timestamp };
      reactivationFailures.push(failure);
      state.reativacoes.push(failure);
      history.eventos.push({ tipo: "reativacao_falhou", ...failure });
      continue;
    }

    const rule = rulesById.get(text(source?.regra_id));
    const discount = Math.max(1, Math.min(50, number(request?.desconto_percentual) || number(source?.desconto_percentual) || number(rule?.desconto_percentual) || 1));
    const duration = Math.max(1, Math.min(365, Math.floor(number(request?.duracao_dias) || number(source?.duracao_dias) || number(rule?.duracao_dias) || 7)));
    const regular = money(product.preco ?? product.price ?? product.valor);
    const start = today;
    const end = `${addDays(today, duration)}T23:59:59-04:00`;
    product.preco_oferta = money(regular * (1 - discount / 100));
    product.data_inicio_oferta = start;
    product.validade_oferta = end;
    product.oferta_origem = "reativacao_historico";
    product.oferta_regra_id = text(source?.regra_id || rule?.id);
    product.oferta_criada_em = timestamp;
    product.oferta_reativada_de = text(source?.id);
    product.updated_at = timestamp;
    product.last_update = Date.now();
    markChanged(key, product, true);
    selected.add(key);

    const record = addHistoryRecord(history, offerSnapshot(key, product), timestamp, {
      reativada_de: text(source?.id),
      solicitacao_id: requestId,
      solicitado_por: text(request?.solicitado_por || "painel-admin"),
      duracao_dias: duration
    });
    const bannerIds = reactivateLinkedBanners(banners, key, product, timestamp, start, end, record.id);
    record.banner_ids = bannerIds;
    bannersReactivated += bannerIds.length;
    const log = { id: requestId, historico_id: record.id, reativada_de: text(source?.id), produto_key: key, status: "sucesso", banners_reativados: bannerIds, processado_em: timestamp };
    reactivated.push(log);
    state.reativacoes.push(log);
    history.eventos.push({ tipo: "oferta_reativada", ...log });
    state.historico_produtos[key] = { ultima_oferta_em: timestamp, regra_id: product.oferta_regra_id };
  }

  if (config.ativo && mode !== "somente_reativacoes") {
    for (const rule of rules.filter(rule => rule.status === "ativa")) {
      const desired = Math.max(1, Math.min(100, Math.floor(number(rule.quantidade_por_execucao) || 1)));
      requestedTotal += desired;
      const discount = Math.max(1, Math.min(50, number(rule.desconto_percentual) || 1));
      const duration = Math.max(1, Math.min(365, Math.floor(number(rule.duracao_dias) || 7)));
      const category = normalizedText(rule.categoria);
      const candidates = Object.entries(products)
        .filter(([key, product]) => !selected.has(key) && !closedKeys.has(key) && normalizedText(product.categoria) === category && productEligible(product, clock))
        .filter(([, product]) => !hasCurrentOffer(product, clock) && !hasProtectedOffer(product))
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
        product.validade_oferta = `${addDays(today, duration)}T23:59:59-04:00`;
        product.oferta_origem = "campanha_automatica";
        product.oferta_regra_id = rule.id;
        product.oferta_criada_em = timestamp;
        delete product.oferta_reativada_de;
        product.updated_at = timestamp;
        product.last_update = Date.now();
        selected.add(key);
        markChanged(key, product, true);
        created.push({ key, rule, product });
        addHistoryRecord(history, offerSnapshot(key, product), timestamp, { duracao_dias: duration });
        state.historico_produtos[key] = { ultima_oferta_em: timestamp, regra_id: rule.id };
      }
    }
  }

  const activeOffers = Object.entries(products)
    .filter(([, product]) => isAutomaticOffer(product) && hasCurrentOffer(product, clock))
    .map(([key, product]) => {
      const record = ensureActiveHistory(history, key, product, timestamp);
      return { ...offerSnapshot(key, product), historico_id: record.id };
    });

  const summary = {
    ofertas_solicitadas: requestedTotal,
    ofertas_criadas: created.length,
    ofertas_nao_criadas: Math.max(0, requestedTotal - created.length),
    ofertas_encerradas: closed.length,
    vencidos: closed.filter(item => item.reason === "vencida").length,
    ofertas_reativadas: reactivated.length,
    reativacoes_com_falha: reactivationFailures.length,
    banners_reativados: bannersReactivated,
    banners_desativados: bannersDeactivated
  };

  state.ultima_execucao = timestamp;
  state.ultima_execucao_status = "sucesso";
  state.ofertas_ativas = activeOffers;
  state.reativacoes = state.reativacoes.slice(-500);
  state.execucoes = [...state.execucoes, { id: executionId, executado_em: timestamp, origem: "make", modo: mode, resumo: summary }].slice(-200);
  history.atualizado_em = timestamp;
  history.ofertas = history.ofertas
    .sort((a, b) => Date.parse(a.criada_em || 0) - Date.parse(b.criada_em || 0))
    .slice(-MAX_HISTORY);
  history.eventos = history.eventos.slice(-2000);
  banners.updated_at = timestamp;

  return {
    products,
    state,
    history,
    banners,
    changed: [...changedMap.values()],
    created,
    closed,
    reactivated,
    reactivationFailures,
    summary
  };
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
  if (!data.access_token) throw new Error("Google OAuth nao retornou access_token para o Firebase.");
  firebaseAccessToken = data.access_token;
  return { Authorization: `Bearer ${firebaseAccessToken}` };
}

async function loadFirebaseProducts() {
  const response = await fetch(firebaseUrl("produtos"), { headers: { Accept: "application/json", ...await firebaseHeaders() } });
  if (!response.ok) throw new Error(`Firebase GET produtos: ${response.status} ${await response.text()}`);
  const data = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Firebase retornou produtos em formato invalido.");
  return data;
}

async function syncFirebase(changed) {
  for (const item of changed) {
    const response = await fetch(firebaseUrl(`produtos/${encodeURIComponent(item.key)}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...await firebaseHeaders() },
      body: JSON.stringify(firebasePatchFor(item.product, item.opening))
    });
    if (!response.ok) throw new Error(`Firebase PATCH produto ${item.key}: ${response.status} ${await response.text()}`);
  }
}

function eventPayload() {
  const eventFile = text(process.env.GITHUB_EVENT_PATH);
  if (!eventFile || !existsSync(eventFile)) return {};
  return JSON.parse(readFileSync(eventFile, "utf8"));
}

function eventExecutionId(event = eventPayload()) {
  return text(event.client_payload?.execucao_id || event.client_payload?.execution_id || event.client_payload?.solicitado_em || event.delivery) || `github-${Date.now()}`;
}

function eventMode(event = eventPayload()) {
  const mode = text(event.client_payload?.modo || event.client_payload?.mode);
  return mode === "somente_reativacoes" ? mode : "completo";
}

async function run() {
  const [config, previousState, previousHistory, previousBanners] = await Promise.all([
    readJson(CONFIG_PATH, {}),
    readJson(STATE_PATH, {}),
    readJson(HISTORY_PATH, {}),
    readJson(BANNERS_PATH, {})
  ]);
  const event = eventPayload();
  const executionId = eventExecutionId(event);
  const mode = eventMode(event);
  if (normalizeState(previousState).execucoes.some(item => item.id === executionId)) {
    console.log(JSON.stringify({ status: "ignorada", motivo: "execucao_ja_processada", executionId }));
    return;
  }
  const products = await loadFirebaseProducts();
  const result = calculateExecution({
    products,
    config,
    state: previousState,
    history: previousHistory,
    banners: previousBanners,
    executionId,
    mode
  });
  await syncFirebase(result.changed);
  await Promise.all([    writeJson(PRODUCTS_HOME_PATH, Object.fromEntries(Object.entries(result.products).map(([key, product]) => [key, homeProduct(key, product)]))),
    writeJson(STATE_PATH, result.state),
    writeJson(HISTORY_PATH, result.history),
    writeJson(BANNERS_PATH, result.banners)
  ]);
  console.log(JSON.stringify({ status: "sucesso", executionId, ...result.summary }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
}

export {
  calculateExecution,
  homeProduct,
  normalizeConfig,
  normalizeState,
  normalizeHistory,
  normalizeBanners,
  linkedBanners
};
