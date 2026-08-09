import { auditCollection } from './core/collections.js';
import { escapeHtml, text } from './core/utils.js';
import { loadCollections, saveCollectionList } from './services/collections.js';
import { callMake, compactKitForMake, unwrapMakeResult } from './services/make.js?admin_build=20260805-kit-auto-carousel-v2';
import {
  kitInstagramOperationalState,
  latestKitQueueEntry,
  shouldAutoGenerateKitCarousel,
} from './services/kit-instagram-flow.js?admin_build=20260808-kit-instagram-unified-v1';

const AUTO_RETRY_DELAYS = [700, 1200, 2000, 3200, 5000, 7500, 10000, 12000];
const QUEUE_RETRY_DELAYS = [1200, 2000, 3200, 5000, 7500, 10000, 14000, 18000, 24000, 30000];
let patched = false;
let savePatched = false;
let presentationPatched = false;
const automaticJobs = new Set();

function moduleInstance() {
  return window.__adminV2CollectionsModule || null;
}

function sleep(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function latestQueueEntry(module, code) {
  return latestKitQueueEntry(module?.store?.state?.queue || [], code);
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

function visualVersion(kit, products) {
  const compact = compactKitForMake(kit, products);
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
      nome: item.nome,
      imagem_url: item.imagem_url,
      preco_antigo_unitario: item.preco_antigo_unitario,
      preco_novo_unitario_kit: item.preco_novo_unitario_kit,
      economia_unitaria_kit: item.economia_unitaria_kit,
    })),
  });
}

function queueImages(entry, draft) {
  const candidates = [
    ...(Array.isArray(entry?.imagens) ? entry.imagens : []),
    ...(Array.isArray(entry?.urls_imagens) ? entry.urls_imagens : []),
    ...(Array.isArray(entry?.files) ? entry.files : []),
    ...(Array.isArray(draft?.instagram_imagens) ? draft.instagram_imagens : []),
    ...(Array.isArray(draft?.imagens) ? draft.imagens : []),
    ...(Array.isArray(draft?.urls_imagens) ? draft.urls_imagens : []),
  ].map(item => typeof item === 'string' ? item : item?.url || item?.src || item?.imagem || item?.image_url).filter(Boolean);
  return [...new Set(candidates)].slice(0, 8);
}

function installStyles() {
  if (document.getElementById('instagramQueueReviewStyles')) return;
  const style = document.createElement('style');
  style.id = 'instagramQueueReviewStyles';
  style.textContent = `
    .instagram-queue-review{grid-column:1/-1;padding:11px;border:1px solid #c7d9ec;border-radius:11px;background:#f3f8fd}.instagram-queue-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.instagram-queue-head h4{margin:0;font-size:12px}.instagram-queue-head p{margin:4px 0 0;color:var(--muted);font-size:8px;line-height:1.45}.instagram-queue-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:9px}.instagram-queue-grid>div{padding:8px;border:1px solid var(--line);border-radius:8px;background:#fff}.instagram-queue-grid strong,.instagram-queue-grid span{display:block}.instagram-queue-grid strong{font-size:10px}.instagram-queue-grid span{margin-top:3px;color:var(--muted);font-size:8px}.instagram-queue-images{display:flex;gap:5px;overflow:auto;margin-top:8px}.instagram-queue-images img{width:58px;height:72px;object-fit:contain;flex:0 0 58px;border:1px solid var(--line);border-radius:8px;background:#fff}.instagram-queue-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:9px}.instagram-queue-warning,.instagram-queue-error{margin-top:8px;padding:7px 8px;border-radius:8px;font-size:8px;line-height:1.45}.instagram-queue-warning{background:var(--warning-soft);color:var(--warning)}.instagram-queue-error{background:#fff0f0;color:#a12626}@media(max-width:760px){.instagram-queue-grid{grid-template-columns:1fr 1fr}.instagram-queue-head{flex-direction:column}}
  `;
  document.head.appendChild(style);
}

function patchPresentation() {
  const module = moduleInstance();
  if (!module || presentationPatched) return false;
  presentationPatched = true;
  const originalCard = module.card.bind(module);
  module.card = audit => {
    let html = originalCard(audit);
    if (module.type !== 'kit') return html;
    const operational = kitInstagramOperationalState(audit.queueEntry, audit.source);
    html = html.replace(
      /<span class="badge [^"]+">Instagram:[\s\S]*?<\/span>/,
      `<span class="badge ${operational.kind}">Instagram: ${escapeHtml(operational.label)}</span>`,
    );
    return html;
  };
  return true;
}

function renderDiagnostics() {
  const module = moduleInstance();
  const form = document.getElementById('collectionForm');
  if (!module?.draft || module.type !== 'kit' || !form) return;
  const previous = form.querySelector('.instagram-queue-review');
  const entry = latestQueueEntry(module, module.draft.codigo);
  const baseOperational = kitInstagramOperationalState(entry, module.draft);
  const operational = module.makeBusy
    ? { key: 'gerando', label: 'Gerando', kind: 'info', raw: baseOperational.raw }
    : baseOperational;
  const images = queueImages(entry, module.draft);
  const queuedAt = text(entry?.atualizado_em || entry?.criado_em || module.draft.instagram_enviado_em || '—');
  const carouselId = text(entry?.id_carrossel || entry?.carrossel_id || module.draft.instagram_carrossel_id || '—');
  const queuePath = text(entry?.fila_json || module.draft.instagram_fila_json || 'carrosseis-kits/fila.json');
  const signature = JSON.stringify({
    status: operational.key, queuedAt, carouselId, queuePath, images, code: module.draft.codigo,
    busy: Boolean(module.makeBusy), error: text(module.draft.instagram_erro),
  });

  const toolsBadge = form.querySelector('.collection-make-tools .badge');
  if (toolsBadge) {
    toolsBadge.className = `badge ${operational.kind}`;
    toolsBadge.textContent = `Instagram: ${operational.label}`;
  }
  const manualButton = form.querySelector('[data-collection-make="instagram"]');
  if (manualButton) {
    if (!module.originalId) {
      manualButton.disabled = true;
      manualButton.textContent = 'Automático ao salvar';
      manualButton.title = 'Todo kit novo gera o carrossel automaticamente depois da publicação no GitHub.';
    } else {
      manualButton.disabled = Boolean(module.makeBusy);
      manualButton.textContent = entry ? 'Reprocessar carrossel' : 'Gerar carrossel manualmente';
      manualButton.title = entry
        ? 'Use somente se quiser gerar uma nova versão do carrossel.'
        : 'Contingência para kit salvo que ainda não possui carrossel.';
    }
  }

  if (previous?.dataset.signature === signature) return;
  previous?.remove();
  const notice = entry
    ? `<div class="instagram-queue-warning">Este kit já possui carrossel. Alterações posteriores no kit não criam outra postagem automaticamente. Use “Reprocessar carrossel” somente quando quiser gerar uma nova versão.</div>`
    : `<div class="instagram-queue-warning">Kit novo: ao salvar e publicar, o carrossel será gerado automaticamente. Depois disso, edições no kit não geram nova postagem sozinhas.</div>`;
  const error = operational.key === 'erro' && text(module.draft.instagram_erro)
    ? `<div class="instagram-queue-error">${escapeHtml(module.draft.instagram_erro)}</div>`
    : '';

  form.insertAdjacentHTML('beforeend', `<section class="instagram-queue-review" data-signature="${escapeHtml(signature)}"><div class="instagram-queue-head"><div><h4>Instagram do kit</h4><p>A fila do GitHub é a fonte oficial. O Admin mostra apenas o estado operacional necessário: Gerando, Aguardando postagem, Postado ou Erro.</p></div><span class="badge ${operational.kind}">${escapeHtml(operational.label)}</span></div><div class="instagram-queue-grid"><div><strong>${escapeHtml(module.draft.codigo || '—')}</strong><span>Código do kit</span></div><div><strong>${escapeHtml(carouselId)}</strong><span>ID do carrossel</span></div><div><strong>${escapeHtml(queuedAt)}</strong><span>Última atualização</span></div><div><strong>${escapeHtml(queuePath)}</strong><span>Fonte oficial do status</span></div></div>${images.length ? `<div class="instagram-queue-images">${images.map(url => `<img src="${escapeHtml(url)}" onerror="this.remove()" alt="Página do carrossel">`).join('')}</div>` : ''}${notice}${error}<div class="instagram-queue-actions"><button class="button secondary compact" type="button" data-instagram-queue-refresh>Atualizar status</button></div></section>`);
}

async function reloadCollections(module) {
  const config = module.reloadConfig();
  const data = await loadCollections(config);
  module.store.state.baskets = data.baskets || [];
  module.store.state.kits = data.kits || [];
  module.store.state.queue = data.queue || [];
  return data;
}

async function waitForPersistedKit(module, snapshot) {
  let lastError = null;
  const expectedVersion = visualVersion(snapshot, module.store.state.products);
  for (let index = 0; index < AUTO_RETRY_DELAYS.length; index += 1) {
    try {
      const data = await reloadCollections(module);
      const kit = (data.kits || []).find(item => text(item.id) === text(snapshot.id))
        || (data.kits || []).find(item => text(item.codigo) === text(snapshot.codigo));
      if (kit && visualVersion(kit, module.store.state.products) === expectedVersion) return { kit, data };
    } catch (error) {
      lastError = error;
    }
    await sleep(AUTO_RETRY_DELAYS[index]);
  }
  throw lastError || new Error('A versão recém-salva do kit ainda não ficou disponível no GitHub. Atualize os dados e use o reprocessamento manual como contingência.');
}

async function waitForQueue(module, code, contentVersion, sentAt, previousCarouselId = '') {
  for (let index = 0; index < QUEUE_RETRY_DELAYS.length; index += 1) {
    try {
      await reloadCollections(module);
      const entry = latestQueueEntry(module, code);
      const entryTime = Date.parse(text(entry?.atualizado_em || entry?.criado_em));
      const sentTime = Date.parse(text(sentAt));
      const entryId = text(entry?.id_carrossel || entry?.carrossel_id);
      const newCarousel = Boolean(entryId && entryId !== text(previousCarouselId));
      const recent = entry && Number.isFinite(entryTime) && Number.isFinite(sentTime) && entryTime >= sentTime - 5000;
      const sameVersion = text(entry?.versao_conteudo) === text(contentVersion);
      const versionCompatible = sameVersion || !text(entry?.versao_conteudo);
      if (entry && (newCarousel || (recent && versionCompatible))) return entry;
    } catch {}
    await sleep(QUEUE_RETRY_DELAYS[index]);
  }
  return null;
}

async function persistKitAutomationState(module, kitId, patch) {
  const config = module.reloadConfig();
  const data = await loadCollections(config);
  const list = (data.kits || []).map(kit => text(kit.id) === text(kitId) ? { ...kit, ...patch } : kit);
  const changedFields = Object.keys(patch);
  const saved = await saveCollectionList(config, 'kit', list, module.store.state.products, data.queue || [], {
    preserveInvalidExisting: true,
    changedId: kitId,
    changedFields,
  });
  module.store.state.kits = saved.list || list;
  module.store.state.queue = data.queue || [];
  return module.store.state.kits.find(kit => text(kit.id) === text(kitId)) || null;
}

async function sendCarousel(module, sourceKit, { automatic = false, forceRegeneration = false } = {}) {
  const config = module.reloadConfig();
  if (!text(config.makeInstagramKitWebhookUrl)) {
    throw new Error('Configure o webhook Instagram de kits nas configurações do Admin.');
  }
  const audit = auditCollection(sourceKit, 'kit', module.store.state.products, module.store.state.queue);
  if (audit.errors.length) throw new Error(`Revise o kit antes de gerar o carrossel: ${audit.errors.join(' · ')}.`);
  const kit = compactKitForMake(sourceKit, module.store.state.products);
  if (!text(kit.codigo)) throw new Error('O kit precisa ter código antes de gerar o carrossel.');
  if (!kit.produtos.length) throw new Error('O kit não possui produtos válidos para o carrossel.');

  const contentVersion = visualVersion(sourceKit, module.store.state.products);
  const existing = latestQueueEntry(module, kit.codigo);
  if (automatic && !forceRegeneration && existing) {
    module.onToast(`O kit “${kit.nome}” já possui carrossel. A edição foi salva sem criar outra postagem.`, 'success');
    return existing;
  }

  const previousCarouselId = text(existing?.id_carrossel || existing?.carrossel_id);
  const requestId = automatic
    ? `auto-${kit.codigo}-${contentVersion}`
    : `manual-${Date.now()}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10)}`;
  const idempotencyKey = `kit:${kit.codigo}:${contentVersion}:${requestId}`;
  const sentAt = new Date().toISOString();

  const response = unwrapMakeResult(await callMake(config, 'instagram-kit', {
    acao: 'gerar_kit_instagram_fila',
    modo_publicacao: 'fila_github',
    origem: 'admin_v2_dona_antonia',
    disparo: automatic ? 'automatico_apos_commit' : 'manual_contingencia',
    automatico: automatic,
    commit_github_confirmado: true,
    criado_em: sentAt,
    solicitacao_id: requestId,
    forcar_regeneracao: forceRegeneration,
    ignorar_idempotencia_anterior: forceRegeneration,
    chave_idempotencia: idempotencyKey,
    versao_conteudo: contentVersion,
    formato: 'instagram_carrossel_4_5',
    proporcao: '1080x1350',
    total_paginas: 2 + kit.produtos.length,
    regra_paginas: 'capa + uma página por produto + CTA final',
    kit_codigo: kit.codigo,
    kit_id: kit.id,
    kit_nome: kit.nome,
    fila_path: text(config.kitQueuePath || 'carrosseis-kits/fila.json'),
    kits_path: text(config.kitsPath || 'site/kits.json'),
    github: {
      owner: text(config.githubOwner), repo: text(config.githubRepo), branch: text(config.githubBranch),
      fila_path: text(config.kitQueuePath || 'carrosseis-kits/fila.json'),
    },
    kit,
    produtos: kit.produtos,
    referencias_imagens: kit.referencias_imagens,
  }, { timeout: 180000 }));

  const queueEntry = await waitForQueue(module, kit.codigo, contentVersion, sentAt, previousCarouselId);
  if (!queueEntry) {
    let host = 'webhook configurado';
    try { host = new URL(text(config.makeInstagramKitWebhookUrl)).hostname || host; } catch {}
    throw new Error(`O endereço ${host} respondeu, mas nenhuma geração nova foi confirmada em carrosseis-kits/fila.json. Confira se o cenário de imagens está ativo no Make.`);
  }

  const patch = {
    instagram_status: text(queueEntry.fila_status || queueEntry.status || 'registrado'),
    instagram_automatico: automatic,
    instagram_chave_idempotencia: idempotencyKey,
    instagram_versao_conteudo: contentVersion,
    instagram_enviado_em: sentAt,
    instagram_post_id: text(response.instagram_id || response.instagram_post_id || response.id),
    instagram_carrossel_id: text(queueEntry.id_carrossel || queueEntry.carrossel_id || response.id_carrossel || response.carrossel_id),
    instagram_imagens: queueImages(queueEntry, response),
    instagram_dados_json: text(queueEntry.dados_json || response.dados_json),
    instagram_fila_json: text(queueEntry.fila_json || response.fila_json || config.kitQueuePath || 'carrosseis-kits/fila.json'),
    instagram_erro: '',
    instagram_erro_em: '',
    atualizado_em: new Date().toISOString(),
  };
  await persistKitAutomationState(module, sourceKit.id, patch);
  module.onToast(`Carrossel do kit “${kit.nome}” confirmado na fila do GitHub.`, 'success');
  return queueEntry;
}

async function autoGenerateAfterSave(module, snapshot) {
  const jobKey = text(snapshot.id || snapshot.codigo);
  if (!jobKey || automaticJobs.has(jobKey)) return;
  automaticJobs.add(jobKey);
  module.onToast(`Kit “${snapshot.nome}” publicado. Gerando o carrossel automaticamente…`);
  try {
    const { kit } = await waitForPersistedKit(module, snapshot);
    await sendCarousel(module, kit, { automatic: true, forceRegeneration: false });
    await module.onReload?.();
  } catch (error) {
    const message = text(error?.message || error);
    try {
      await persistKitAutomationState(module, snapshot.id, {
        instagram_status: 'erro_geracao_automatica',
        instagram_erro: message,
        instagram_erro_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      });
    } catch {}
    module.onToast(`Kit publicado, mas o carrossel automático falhou: ${message}`, 'error');
  } finally {
    automaticJobs.delete(jobKey);
  }
}

function patchSaveAutomation() {
  const module = moduleInstance();
  if (!module || savePatched) return false;
  savePatched = true;
  const originalSave = module.saveDraft.bind(module);
  module.saveDraft = async () => {
    if (!module.draft || module.type !== 'kit') return originalSave();
    const snapshot = clone(module.draft);
    const previous = module.currentList().find(kit => text(kit.id) === text(module.originalId || snapshot.id)) || null;
    const existingQueue = latestQueueEntry(module, snapshot.codigo);
    const shouldGenerate = shouldAutoGenerateKitCarousel({
      hadPrevious: Boolean(previous),
      existingQueue,
    });
    await originalSave();
    const savedSuccessfully = module.draft === null;
    if (savedSuccessfully && shouldGenerate) {
      window.setTimeout(() => autoGenerateAfterSave(module, snapshot), 250);
    }
  };
  return true;
}

function patchAutomation() {
  const module = moduleInstance();
  if (!module || patched) return false;
  patched = true;
  const original = module.runKitAutomation.bind(module);
  module.runKitAutomation = async action => {
    if (action !== 'instagram') return original(action);
    if (!module.draft || module.type !== 'kit' || module.makeBusy) return;
    if (!module.originalId) throw new Error('Salve o kit primeiro. O carrossel do kit novo será gerado automaticamente.');
    const existing = latestQueueEntry(module, module.draft.codigo);
    const operational = kitInstagramOperationalState(existing, module.draft);
    const question = existing
      ? `Este kit está com Instagram “${operational.label}”. Deseja reprocessar e gerar uma nova versão do carrossel?`
      : `Este kit salvo ainda não possui carrossel. Deseja gerar agora?`;
    if (!confirm(question)) return;

    module.makeBusy = true;
    module.draft.instagram_status = 'enviando_manual';
    module.elements.collectionForm.innerHTML = module.formHtml();
    renderDiagnostics();
    module.onToast('Make: reprocessando o carrossel do kit…');
    try {
      await sendCarousel(module, module.draft, { automatic: false, forceRegeneration: true });
      const refreshed = (module.store.state.kits || []).find(kit => text(kit.id) === text(module.draft.id));
      if (refreshed) module.draft = { ...module.draft, ...refreshed };
    } catch (error) {
      const message = text(error?.message || error);
      module.draft.instagram_status = 'erro_envio';
      module.draft.instagram_erro = message;
      module.draft.instagram_erro_em = new Date().toISOString();
      try {
        const persisted = await persistKitAutomationState(module, module.draft.id, {
          instagram_status: 'erro_envio',
          instagram_erro: message,
          instagram_erro_em: module.draft.instagram_erro_em,
          atualizado_em: new Date().toISOString(),
        });
        if (persisted) module.draft = { ...module.draft, ...persisted };
      } catch {}
      module.onToast(`Falha ao reprocessar o carrossel: ${message}`, 'error');
      throw error;
    } finally {
      module.makeBusy = false;
      if (module.draft) {
        module.elements.collectionEditorTitle.textContent = module.draft.nome || 'Kit promocional';
        module.elements.collectionForm.innerHTML = module.formHtml();
        module.renderItems();
        module.renderAudit();
        renderDiagnostics();
      }
    }
  };
  return true;
}

function bindRefresh() {
  if (document.documentElement.dataset.instagramQueueRefreshBound === '1') return;
  document.documentElement.dataset.instagramQueueRefreshBound = '1';
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-instagram-queue-refresh]');
    if (!button) return;
    const module = moduleInstance();
    if (!module?.draft) return;
    button.disabled = true;
    button.textContent = 'Atualizando…';
    reloadCollections(module).then(() => {
      const entry = latestQueueEntry(module, module.draft.codigo);
      if (entry) {
        module.draft.instagram_carrossel_id = text(entry.id_carrossel || entry.carrossel_id || module.draft.instagram_carrossel_id);
        module.draft.instagram_fila_json = text(entry.fila_json || module.draft.instagram_fila_json);
      }
      module.render();
      renderDiagnostics();
    }).catch(error => module.onToast(error?.message || String(error), 'error'));
  });
}

let scheduled = false;
function run() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    installStyles();
    bindRefresh();
    patchPresentation();
    patchAutomation();
    patchSaveAutomation();
    renderDiagnostics();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
else run();
new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
