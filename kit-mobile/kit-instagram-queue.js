import { auditCollection } from '../producao-v2/js/core/collections.js';
import { text } from '../producao-v2/js/core/utils.js';
import { loadCollections, saveCollectionList } from '../producao-v2/js/services/collections.js';
import { callMake, compactKitForMake, unwrapMakeResult } from '../producao-v2/js/services/make.js?build=20260805-kit-auto-carousel-v1';

const STORAGE_KEY = 'da_admin_v2_config';
const LAST_KIT_KEY = 'da_kit_mobile_last_published_id';
const ORIGIN = 'kit_mobile_dona_antonia';
const COMMIT_RETRY_DELAYS = [700, 1200, 2000, 3200, 5000, 7500, 10000, 12000];

const $ = selector => document.querySelector(selector);
const state = {
  busy: false,
  kit: null,
  kits: [],
  products: [],
  queue: [],
  pendingPublication: null,
  lastToastMessage: '',
};

function getConfig() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function saveInstagramWebhook(value) {
  const current = getConfig();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...current,
    makeInstagramKitWebhookUrl: text(value),
  }));
}

function showToast(message, kind = '') {
  const node = $('#toast');
  if (!node) return;
  node.textContent = message;
  node.className = `toast show ${kind}`.trim();
  window.setTimeout(() => {
    if (node.textContent === message) node.className = 'toast';
  }, kind === 'error' ? 7000 : 4600);
}

function injectStyles() {
  if ($('#kitInstagramQueueStyles')) return;
  const style = document.createElement('style');
  style.id = 'kitInstagramQueueStyles';
  style.textContent = `
    .instagram-publish-box{margin-top:14px;padding:14px;border:1px solid #d7c17b;border-radius:14px;background:#fffaf0}
    .instagram-publish-box strong,.instagram-publish-box small{display:block}
    .instagram-publish-box strong{font-size:14px;color:#3e351d}
    .instagram-publish-box small{margin:5px 0 11px;color:#75694d;line-height:1.45}
    .instagram-publish-box .badge{display:inline-flex;margin-bottom:10px}
    .instagram-publish-box .btn[disabled]{opacity:.55}
  `;
  document.head.appendChild(style);
}

function timestamp(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestFirst(first, second) {
  return timestamp(second.atualizado_em || second.criado_em) - timestamp(first.atualizado_em || first.criado_em);
}

function sleep(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function fingerprint(value) {
  const source = JSON.stringify(value || {});
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

async function loadProducts(config) {
  const firebaseBase = text(config.firebaseUrl || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/+$/, '');
  const node = text(config.productsNode || 'produtos');
  const response = await fetch(`${firebaseBase}/${encodeURIComponent(node)}.json?_=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Firebase retornou ${response.status} ao preparar o Instagram.`);
  const raw = await response.json();
  return Object.entries(raw || {}).map(([firebaseKey, value]) => ({ ...(value || {}), firebaseKey, _key: firebaseKey }));
}

function statusText(kit) {
  return text(kit?.instagram_status || kit?.fila_status || 'ainda não enviado');
}

function latestQueueEntry(code) {
  return [...state.queue]
    .filter(entry => text(entry?.kit_codigo) === text(code))
    .sort((a, b) => String(b?.atualizado_em || b?.criado_em || '').localeCompare(String(a?.atualizado_em || a?.criado_em || '')))[0] || null;
}

function contentVersion(compact) {
  return fingerprint({
    codigo: compact.codigo,
    nome: compact.nome,
    descricao: compact.descricao,
    imagem: compact.imagem,
    preco_original: compact.preco_original,
    preco_promocional: compact.preco_promocional,
    economia: compact.economia,
    desconto_percentual: compact.desconto_percentual,
    produtos: compact.produtos.map(item => ({
      codigo: item.codigo,
      qtd: item.qtd,
      imagem_url: item.imagem_url,
      preco_antigo_unitario: item.preco_antigo_unitario,
      preco_novo_unitario_kit: item.preco_novo_unitario_kit,
      economia_unitaria_kit: item.economia_unitaria_kit,
    })),
  });
}

function render() {
  const button = $('#instagramQueueButton');
  const status = $('#instagramQueueStatus');
  const badge = $('#instagramQueueBadge');
  if (!button || !status || !badge) return;

  const config = getConfig();
  const webhookReady = Boolean(text(config.makeInstagramKitWebhookUrl));
  const kitReady = Boolean(state.kit?.id);
  const queueStatus = statusText(state.kit);

  button.disabled = state.busy || !kitReady || !webhookReady;
  button.textContent = state.busy
    ? 'Gerando carrossel…'
    : queueStatus !== 'ainda não enviado'
      ? 'Gerar novamente e atualizar a fila'
      : 'Gerar carrossel e colocar na fila';

  if (!kitReady) {
    status.textContent = 'Ao publicar o kit, o sistema aguardará a confirmação do GitHub e iniciará o carrossel automaticamente.';
    badge.textContent = 'Geração automática ativa';
    badge.className = 'badge neutral';
    return;
  }

  if (!webhookReady) {
    status.textContent = `Kit publicado: ${state.kit.nome}. Configure o webhook do Instagram para ativar o envio automático.`;
    badge.textContent = 'Webhook não configurado';
    badge.className = 'badge warning';
    return;
  }

  status.textContent = `Kit: ${state.kit.nome}. O botão abaixo fica disponível apenas para reprocessamento manual.`;
  badge.textContent = `Fila: ${queueStatus}`;
  badge.className = `badge ${['postado', 'publicado'].includes(queueStatus) ? 'success' : queueStatus === 'ainda não enviado' ? 'neutral' : 'warning'}`;
}

async function refreshCollections(snapshot = null) {
  const config = getConfig();
  if (!text(config.githubToken)) throw new Error('Configure o token do GitHub para localizar o kit publicado.');

  const [collections, products] = await Promise.all([
    loadCollections(config),
    state.products.length ? Promise.resolve(state.products) : loadProducts(config),
  ]);
  state.kits = collections.kits || [];
  state.queue = collections.queue || [];
  state.products = products;

  const rememberedId = text(localStorage.getItem(LAST_KIT_KEY));
  const exactRemembered = rememberedId
    ? state.kits.find(kit => text(kit.id) === rememberedId)
    : null;

  let candidates = state.kits.filter(kit => text(kit.origem) === ORIGIN);
  if (snapshot?.name) {
    const exactName = candidates.filter(kit => text(kit.nome) === text(snapshot.name));
    if (exactName.length) candidates = exactName;
  }
  if (snapshot?.startedAt) {
    const recent = candidates.filter(kit => timestamp(kit.atualizado_em || kit.criado_em) >= snapshot.startedAt - 120000);
    if (recent.length) candidates = recent;
  }
  candidates.sort(newestFirst);

  state.kit = candidates[0] || exactRemembered || state.kits.slice().sort(newestFirst)[0] || null;
  if (state.kit?.id) localStorage.setItem(LAST_KIT_KEY, text(state.kit.id));
  render();
  return state.kit;
}

async function waitForPublishedKit(snapshot) {
  let lastError = null;
  for (let index = 0; index < COMMIT_RETRY_DELAYS.length; index += 1) {
    try {
      const kit = await refreshCollections(snapshot);
      if (kit && (!snapshot?.name || text(kit.nome) === text(snapshot.name))) return kit;
    } catch (error) {
      lastError = error;
    }
    await sleep(COMMIT_RETRY_DELAYS[index]);
  }
  throw lastError || new Error('O kit ainda não apareceu no GitHub após a publicação. Use o botão manual como contingência.');
}

async function saveAutomationResult(config, updated) {
  const collections = await loadCollections(config);
  const list = (collections.kits || []).filter(kit => text(kit.id) !== text(updated.id));
  list.push(updated);
  const changedFields = [
    'instagram_status', 'instagram_automatico', 'instagram_chave_idempotencia', 'instagram_versao_conteudo',
    'instagram_enviado_em', 'instagram_post_id', 'instagram_carrossel_id', 'instagram_imagens',
    'instagram_dados_json', 'instagram_fila_json', 'instagram_erro', 'instagram_erro_em', 'atualizado_em',
  ];
  const saved = await saveCollectionList(config, 'kit', list, state.products, collections.queue || [], {
    preserveInvalidExisting: true,
    changedId: updated.id,
    changedFields,
  });
  state.kits = saved.list || list;
  state.queue = collections.queue || [];
  state.kit = state.kits.find(kit => text(kit.id) === text(updated.id)) || updated;
  localStorage.setItem(LAST_KIT_KEY, text(state.kit.id));
}

async function queueInstagram({ automatic = false, forceRegeneration = false } = {}) {
  if (state.busy) return;
  const config = getConfig();
  if (!text(config.makeInstagramKitWebhookUrl)) throw new Error('Configure o webhook do carrossel do Instagram.');
  if (!state.kit) await refreshCollections();
  if (!state.kit) throw new Error('Nenhum kit publicado foi encontrado.');

  if (!state.products.length) state.products = await loadProducts(config);
  const audit = auditCollection(state.kit, 'kit', state.products, state.queue);
  if (audit.errors.length) throw new Error(`Revise o kit antes de gerar o Instagram: ${audit.errors.join(' · ')}.`);

  const compact = compactKitForMake(state.kit, state.products);
  if (!compact.produtos.length) throw new Error('O kit não possui produtos válidos para o carrossel.');
  const version = contentVersion(compact);
  const existing = latestQueueEntry(compact.codigo);
  const sameVersion = text(state.kit.instagram_versao_conteudo) === version || text(existing?.versao_conteudo) === version;
  if (automatic && !forceRegeneration && sameVersion && existing) {
    showToast(`O carrossel do kit “${state.kit.nome}” já está registrado.`, 'success');
    return existing;
  }

  if (!automatic) {
    const existingStatus = statusText(state.kit);
    const question = existingStatus === 'ainda não enviado'
      ? `Gerar o carrossel do kit “${state.kit.nome}” e colocar na fila do Instagram?`
      : `Este kit já possui o status “${existingStatus}”. Deseja forçar uma nova geração?`;
    if (!window.confirm(question)) return;
  }

  state.busy = true;
  render();
  showToast(automatic
    ? 'Commit confirmado. Enviando automaticamente o kit ao Make…'
    : 'Make: gerando carrossel e fila do Instagram…');

  const requestId = automatic
    ? `auto-${compact.codigo}-${version}`
    : `manual-${Date.now()}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10)}`;
  const idempotencyKey = `kit:${compact.codigo}:${version}:${requestId}`;
  const sentAt = new Date().toISOString();

  try {
    const result = unwrapMakeResult(await callMake(config, 'instagram-kit', {
      acao: 'gerar_kit_instagram_fila',
      modo_publicacao: 'fila_github',
      origem: ORIGIN,
      disparo: automatic ? 'automatico_apos_commit' : 'manual_contingencia',
      automatico: automatic,
      commit_github_confirmado: true,
      criado_em: sentAt,
      solicitacao_id: requestId,
      chave_idempotencia: idempotencyKey,
      versao_conteudo: version,
      forcar_regeneracao: forceRegeneration,
      ignorar_idempotencia_anterior: forceRegeneration,
      formato: 'instagram_carrossel_4_5',
      proporcao: '1080x1350',
      total_paginas: 2 + compact.produtos.length,
      regra_paginas: 'capa + uma página por produto + CTA final',
      kit_codigo: compact.codigo,
      kit_id: compact.id,
      kit_nome: compact.nome,
      fila_path: text(config.kitQueuePath || 'carrosseis-kits/fila.json'),
      kits_path: text(config.kitsPath || 'site/kits.json'),
      kit: compact,
      produtos: compact.produtos,
      referencias_imagens: compact.referencias_imagens,
    }, { timeout: 180000 }));

    const updated = {
      ...state.kit,
      instagram_status: text(result.status || result.fila_status || 'enviado_aguardando_fila'),
      instagram_automatico: automatic,
      instagram_chave_idempotencia: idempotencyKey,
      instagram_versao_conteudo: version,
      instagram_enviado_em: sentAt,
      instagram_post_id: text(result.instagram_id || result.instagram_post_id || result.id),
      instagram_carrossel_id: text(result.id_carrossel || result.carrossel_id),
      instagram_imagens: result.imagens || result.urls_imagens || [],
      instagram_dados_json: text(result.dados_json),
      instagram_fila_json: text(result.fila_json || config.kitQueuePath || 'carrosseis-kits/fila.json'),
      instagram_erro: '',
      instagram_erro_em: '',
      atualizado_em: new Date().toISOString(),
    };
    await saveAutomationResult(config, updated);
    showToast(automatic
      ? 'Carrossel enviado automaticamente ao Make após a confirmação do commit.'
      : 'Carrossel criado e enviado para a fila do Instagram.', 'success');
    return result;
  } catch (error) {
    const message = text(error?.message || error);
    const updated = {
      ...state.kit,
      instagram_status: automatic ? 'erro_geracao_automatica' : 'erro_envio',
      instagram_automatico: automatic,
      instagram_erro: message,
      instagram_erro_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    };
    try { await saveAutomationResult(config, updated); } catch {}
    throw error;
  } finally {
    state.busy = false;
    render();
  }
}

function installSettingsIntegration() {
  const input = $('#cfgInstagramWebhook');
  const open = $('#settingsOpen');
  const save = $('#settingsSave');
  if (!input || !open || !save) return;

  const fill = () => { input.value = getConfig().makeInstagramKitWebhookUrl || ''; };
  open.addEventListener('click', fill);
  save.addEventListener('click', () => {
    saveInstagramWebhook(input.value.trim());
    window.setTimeout(render, 0);
  }, true);
  fill();
}

function installPublicationWatcher() {
  const publishButton = $('#publishButton');
  const toast = $('#toast');
  if (!publishButton || !toast) return;

  publishButton.addEventListener('click', () => {
    if (publishButton.disabled) return;
    state.pendingPublication = {
      name: text($('#kitTitleInput')?.value),
      startedAt: Date.now(),
    };
  }, true);

  const observer = new MutationObserver(() => {
    const message = text(toast.textContent);
    if (!message || message === state.lastToastMessage) return;
    state.lastToastMessage = message;
    if (!/publicado com sucesso/i.test(message) || !state.pendingPublication) return;

    const snapshot = state.pendingPublication;
    state.pendingPublication = null;
    window.setTimeout(() => {
      showToast('Kit publicado. Aguardando o commit ficar disponível no GitHub…');
      waitForPublishedKit(snapshot)
        .then(kit => {
          if (!kit) throw new Error('O kit publicado não foi localizado.');
          return queueInstagram({ automatic: true, forceRegeneration: false });
        })
        .catch(error => showToast(`Kit publicado, mas o carrossel automático falhou: ${error?.message || String(error)}`, 'error'));
    }, 350);
  });
  observer.observe(toast, { childList: true, characterData: true, subtree: true });
}

injectStyles();
installSettingsIntegration();
installPublicationWatcher();
$('#instagramQueueButton')?.addEventListener('click', () => {
  queueInstagram({ automatic: false, forceRegeneration: true }).catch(error => {
    state.busy = false;
    render();
    showToast(error?.message || String(error), 'error');
  });
});
render();
window.setTimeout(() => {
  if (text(localStorage.getItem(LAST_KIT_KEY))) {
    refreshCollections().catch(error => console.warn('Não foi possível recuperar o último kit publicado:', error));
  }
}, 1200);