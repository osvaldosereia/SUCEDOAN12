import { auditCollection } from './core/collections.js';
import { escapeHtml, text } from './core/utils.js';
import { callMake, compactKitForMake, unwrapMakeResult } from './services/make.js';

const ACTIVE_QUEUE_STATUSES = new Set(['novo', 'pendente', 'processando', 'aguardando', 'pronto', 'agendado']);
let patched = false;

function moduleInstance() {
  return window.__adminV2CollectionsModule || null;
}

function normalizeStatus(value) {
  return text(value).toLocaleLowerCase('pt-BR');
}

function latestQueueEntry(module, code) {
  return [...(module?.store?.state?.queue || [])]
    .filter(entry => text(entry?.kit_codigo) === text(code))
    .sort((a, b) => String(b?.atualizado_em || b?.criado_em || '').localeCompare(String(a?.atualizado_em || a?.criado_em || '')))[0] || null;
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

function queueImages(entry, draft) {
  const candidates = [
    ...(Array.isArray(entry?.imagens) ? entry.imagens : []),
    ...(Array.isArray(entry?.urls_imagens) ? entry.urls_imagens : []),
    ...(Array.isArray(draft?.instagram_imagens) ? draft.instagram_imagens : []),
  ].map(item => typeof item === 'string' ? item : item?.url || item?.src || item?.imagem).filter(Boolean);
  return [...new Set(candidates)].slice(0, 8);
}

function installStyles() {
  if (document.getElementById('instagramQueueReviewStyles')) return;
  const style = document.createElement('style');
  style.id = 'instagramQueueReviewStyles';
  style.textContent = `
    .instagram-queue-review{grid-column:1/-1;padding:11px;border:1px solid #c7d9ec;border-radius:11px;background:#f3f8fd}.instagram-queue-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.instagram-queue-head h4{margin:0;font-size:12px}.instagram-queue-head p{margin:4px 0 0;color:var(--muted);font-size:8px;line-height:1.45}.instagram-queue-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:9px}.instagram-queue-grid>div{padding:8px;border:1px solid var(--line);border-radius:8px;background:#fff}.instagram-queue-grid strong,.instagram-queue-grid span{display:block}.instagram-queue-grid strong{font-size:10px}.instagram-queue-grid span{margin-top:3px;color:var(--muted);font-size:8px}.instagram-queue-images{display:flex;gap:5px;overflow:auto;margin-top:8px}.instagram-queue-images img{width:58px;height:72px;object-fit:contain;flex:0 0 58px;border:1px solid var(--line);border-radius:8px;background:#fff}.instagram-queue-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:9px}.instagram-queue-warning{margin-top:8px;padding:7px 8px;border-radius:8px;background:var(--warning-soft);color:var(--warning);font-size:8px;line-height:1.45}@media(max-width:760px){.instagram-queue-grid{grid-template-columns:1fr 1fr}.instagram-queue-head{flex-direction:column}}
  `;
  document.head.appendChild(style);
}

function renderDiagnostics() {
  const module = moduleInstance();
  const form = document.getElementById('collectionForm');
  if (!module?.draft || module.type !== 'kit' || !form) return;
  const previous = form.querySelector('.instagram-queue-review');
  const entry = latestQueueEntry(module, module.draft.codigo);
  const status = text(entry?.fila_status || entry?.status || module.draft.instagram_status || 'não enviado');
  const images = queueImages(entry, module.draft);
  const queuedAt = text(entry?.atualizado_em || entry?.criado_em || module.draft.instagram_enviado_em || '—');
  const carouselId = text(entry?.id_carrossel || entry?.carrossel_id || module.draft.instagram_carrossel_id || '—');
  const queuePath = text(entry?.fila_json || module.draft.instagram_fila_json || 'carrosseis-kits/fila.json');
  const duplicateWarning = entry && ACTIVE_QUEUE_STATUSES.has(normalizeStatus(status));
  const signature = JSON.stringify({ status, queuedAt, carouselId, queuePath, images, code: module.draft.codigo });
  if (previous?.dataset.signature === signature) return;
  previous?.remove();
  form.insertAdjacentHTML('beforeend', `<section class="instagram-queue-review" data-signature="${escapeHtml(signature)}"><div class="instagram-queue-head"><div><h4>Fila do Instagram</h4><p>O Make recebe o kit completo e deve registrar uma entrada única por versão do conteúdo.</p></div><span class="badge ${duplicateWarning ? 'warning' : status === 'postado' ? 'success' : status === 'não enviado' ? 'neutral' : 'info'}">${escapeHtml(status)}</span></div><div class="instagram-queue-grid"><div><strong>${escapeHtml(module.draft.codigo || '—')}</strong><span>Código do kit</span></div><div><strong>${escapeHtml(carouselId)}</strong><span>ID do carrossel</span></div><div><strong>${escapeHtml(queuedAt)}</strong><span>Última atualização</span></div><div><strong>${escapeHtml(queuePath)}</strong><span>Registro da fila</span></div></div>${images.length ? `<div class="instagram-queue-images">${images.map(url => `<img src="${escapeHtml(url)}" onerror="this.remove()" alt="Página do carrossel">`).join('')}</div>` : ''}${duplicateWarning ? '<div class="instagram-queue-warning">Já existe uma entrada ativa para este kit. Uma nova geração exigirá confirmação e usará uma chave de idempotência diferente somente quando a composição mudar.</div>' : ''}<div class="instagram-queue-actions"><button class="button secondary compact" type="button" data-instagram-queue-refresh>Atualizar status</button></div></section>`);
}

async function refreshedQueue(module) {
  await module.onReload?.();
  return latestQueueEntry(module, module.draft?.codigo);
}

function patchAutomation() {
  const module = moduleInstance();
  if (!module || patched) return false;
  patched = true;
  const original = module.runKitAutomation.bind(module);
  module.runKitAutomation = async action => {
    if (action !== 'instagram') return original(action);
    if (!module.draft || module.type !== 'kit' || module.makeBusy) return;
    const config = module.reloadConfig();
    const kit = compactKitForMake(module.draft, module.store.state.products);
    if (!module.originalId) throw new Error('Salve o kit antes de enviá-lo para a fila do Instagram. Isso evita fila sem cadastro correspondente.');
    if (!text(kit.codigo)) throw new Error('O kit precisa ter código antes de gerar a fila.');
    const audit = auditCollection(module.draft, 'kit', module.store.state.products, module.store.state.queue);
    if (audit.errors.length) throw new Error(`Revise o kit antes de gerar a fila: ${audit.errors.join(' · ')}.`);
    const existing = latestQueueEntry(module, kit.codigo);
    const existingStatus = normalizeStatus(existing?.fila_status || existing?.status);
    if (existing && ACTIVE_QUEUE_STATUSES.has(existingStatus)) {
      const proceed = confirm(`Já existe uma entrada “${existingStatus}” para o kit “${module.draft.nome}”. Gerar novamente somente se a composição ou a arte mudou. Continuar?`);
      if (!proceed) return;
    } else if (!confirm(`Gerar o carrossel do kit “${module.draft.nome}” e enviar para a fila do Instagram?`)) return;

    const contentVersion = fingerprint({
      codigo: kit.codigo, nome: kit.nome, descricao: kit.descricao, preco: kit.preco,
      data_inicio: kit.data_inicio, data_fim: kit.data_fim,
      produtos: kit.produtos.map(item => ({ codigo: item.codigo, qtd: item.qtd, imagem_url: item.imagem_url })),
    });
    const idempotencyKey = `kit:${kit.codigo}:${contentVersion}`;
    module.makeBusy = true;
    module.draft.instagram_status = 'enviando';
    module.elements.collectionForm.innerHTML = module.formHtml();
    renderDiagnostics();
    module.onToast('Make: enviando kit para geração do carrossel…');
    try {
      const response = unwrapMakeResult(await callMake(config, 'instagram-kit', {
        acao: 'gerar_kit_instagram_fila',
        modo_publicacao: 'fila_github',
        origem: 'admin_v2_dona_antonia',
        criado_em: new Date().toISOString(),
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
      }));
      module.draft.instagram_chave_idempotencia = idempotencyKey;
      module.draft.instagram_versao_conteudo = contentVersion;
      module.draft.instagram_enviado_em = new Date().toISOString();
      module.draft.instagram_post_id = text(response.instagram_id || response.instagram_post_id || response.id);
      module.draft.instagram_carrossel_id = text(response.id_carrossel || response.carrossel_id);
      module.draft.instagram_imagens = response.imagens || response.urls_imagens || [];
      module.draft.instagram_dados_json = text(response.dados_json);
      module.draft.instagram_fila_json = text(response.fila_json || config.kitQueuePath || 'carrosseis-kits/fila.json');
      module.draft.instagram_status = text(response.fila_status || response.status || (response.ok || response.success ? 'enviado_aguardando_fila' : 'resposta_incompleta'));

      let queueEntry = null;
      try { queueEntry = await refreshedQueue(module); } catch {}
      if (queueEntry) {
        module.draft.instagram_status = text(queueEntry.fila_status || queueEntry.status || module.draft.instagram_status);
        module.draft.instagram_carrossel_id = text(queueEntry.id_carrossel || queueEntry.carrossel_id || module.draft.instagram_carrossel_id);
        module.draft.instagram_fila_json = text(queueEntry.fila_json || module.draft.instagram_fila_json);
        module.onToast('Fila confirmada no GitHub. Salve o kit para registrar os identificadores.', 'success');
      } else {
        module.onToast('O Make recebeu o kit, mas a entrada ainda não apareceu na fila. Use “Atualizar status” antes de gerar novamente.', 'error');
      }
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
    refreshedQueue(module).then(entry => {
      if (entry) {
        module.draft.instagram_status = text(entry.fila_status || entry.status || 'registrado');
        module.draft.instagram_carrossel_id = text(entry.id_carrossel || entry.carrossel_id || module.draft.instagram_carrossel_id);
        module.draft.instagram_fila_json = text(entry.fila_json || module.draft.instagram_fila_json);
      }
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
    patchAutomation();
    renderDiagnostics();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
else run();
new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
