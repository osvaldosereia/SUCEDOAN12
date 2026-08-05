import { auditCollection } from '../producao-v2/js/core/collections.js';
import { productKey, text } from '../producao-v2/js/core/utils.js';
import { loadCollections, saveCollectionList } from '../producao-v2/js/services/collections.js';
import { callMake, compactKitForMake, unwrapMakeResult } from '../producao-v2/js/services/make.js?build=20260805-kit-instagram-v1';

const STORAGE_KEY = 'da_admin_v2_config';
const LAST_KIT_KEY = 'da_kit_mobile_last_published_id';
const ORIGIN = 'kit_mobile_dona_antonia';

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
  }, 4200);
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
    status.textContent = 'Publique o kit primeiro. Depois este botão prepara as artes e envia o carrossel para a fila do Instagram.';
    badge.textContent = 'Aguardando publicação';
    badge.className = 'badge neutral';
    return;
  }

  if (!webhookReady) {
    status.textContent = `Último kit publicado: ${state.kit.nome}. Configure o webhook do Instagram nas configurações para continuar.`;
    badge.textContent = 'Webhook não configurado';
    badge.className = 'badge warning';
    return;
  }

  status.textContent = `Kit pronto: ${state.kit.nome}. A automação criará a capa, uma página por produto e a chamada final.`;
  badge.textContent = `Fila: ${queueStatus}`;
  badge.className = `badge ${['postado', 'publicado'].includes(queueStatus) ? 'success' : queueStatus === 'ainda não enviado' ? 'neutral' : 'warning'}`;
}

async function refreshCollections(snapshot = null) {
  const config = getConfig();
  if (!text(config.githubToken)) throw new Error('Configure o token do GitHub para localizar o kit publicado.');

  const [collections, products] = await Promise.all([
    loadCollections(config),
    loadProducts(config),
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

async function queueInstagram() {
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
  const existingStatus = statusText(state.kit);
  const question = existingStatus === 'ainda não enviado'
    ? `Gerar o carrossel do kit “${state.kit.nome}” e colocar na fila do Instagram?`
    : `Este kit já possui o status “${existingStatus}”. Deseja gerar novamente e atualizar a fila?`;
  if (!window.confirm(question)) return;

  state.busy = true;
  render();
  showToast('Make: gerando carrossel e fila do Instagram…');

  try {
    const result = unwrapMakeResult(await callMake(config, 'instagram-kit', {
      acao: 'gerar_kit_instagram_fila',
      modo_publicacao: 'fila_github',
      origem: ORIGIN,
      criado_em: new Date().toISOString(),
      formato: 'instagram_carrossel_4_5',
      total_paginas: 2 + compact.produtos.length,
      regra_paginas: 'capa + uma página por produto + CTA final',
      kit: compact,
      produtos: compact.produtos,
    }));

    const updated = {
      ...state.kit,
      instagram_status: text(result.status || result.fila_status || 'novo'),
      instagram_enviado_em: new Date().toISOString(),
      instagram_post_id: text(result.instagram_id || result.instagram_post_id || result.id),
      instagram_carrossel_id: text(result.id_carrossel || result.carrossel_id),
      instagram_imagens: result.imagens || result.urls_imagens || [],
      instagram_dados_json: text(result.dados_json),
      instagram_fila_json: text(result.fila_json),
      atualizado_em: new Date().toISOString(),
    };

    const list = state.kits.filter(kit => text(kit.id) !== text(updated.id));
    list.push(updated);
    const changedFields = [
      'instagram_status', 'instagram_enviado_em', 'instagram_post_id', 'instagram_carrossel_id',
      'instagram_imagens', 'instagram_dados_json', 'instagram_fila_json', 'atualizado_em',
    ];
    const saved = await saveCollectionList(config, 'kit', list, state.products, state.queue, {
      preserveInvalidExisting: true,
      changedId: updated.id,
      changedFields,
    });

    state.kits = saved.list || list;
    state.kit = state.kits.find(kit => text(kit.id) === text(updated.id)) || updated;
    localStorage.setItem(LAST_KIT_KEY, text(state.kit.id));
    showToast('Carrossel criado e enviado para a fila do Instagram.', 'success');
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
      refreshCollections(snapshot)
        .then(kit => {
          if (kit) showToast(`Kit “${kit.nome}” pronto para gerar o carrossel do Instagram.`, 'success');
        })
        .catch(error => showToast(error?.message || String(error), 'error'));
    }, 450);
  });
  observer.observe(toast, { childList: true, characterData: true, subtree: true });
}

injectStyles();
installSettingsIntegration();
installPublicationWatcher();
$('#instagramQueueButton')?.addEventListener('click', () => {
  queueInstagram().catch(error => {
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
