import { auditCollection } from './core/collections.js';
import { escapeHtml, money, number, productName, text } from './core/utils.js';

const BUILD = '20260728-kit-editor-flow-v2';
let queued = false;
let syncingPrice = false;
let scrollState = null;

const getModule = () => window.__adminV2CollectionsModule || null;
const getField = (form, name) => form.querySelector(`[data-collection-field="${CSS.escape(name)}"]`);
const getLabel = (form, name) => getField(form, name)?.closest('label') || null;
const round = value => Math.round(number(value) * 100) / 100;
const emit = (node, type = 'input') => node?.dispatchEvent(new Event(type, { bubbles: true }));

function context() {
  const module = getModule();
  const editor = document.getElementById('collectionEditor');
  const form = document.getElementById('collectionForm');
  if (!module || module.type !== 'kit' || !module.draft || !editor?.classList.contains('open') || !form) return null;
  return { module, editor, form };
}

function audit(module) {
  return auditCollection(module.draft, 'kit', module.store?.state?.products || [], module.store?.state?.queue || []);
}

function installCss() {
  if (document.getElementById('kitEditorFlowV2Css')) return;
  const style = document.createElement('style');
  style.id = 'kitEditorFlowV2Css';
  style.textContent = `#collectionEditor.kit-flow{width:min(1040px,100vw)}#collectionEditor.kit-flow .collection-editor-body{gap:14px;scroll-behavior:auto;overflow-anchor:none}#collectionEditor.kit-flow #collectionForm>.ux-collection-form-head{display:none!important}#collectionForm>.form-grid.kit-flow-root{display:grid;grid-template-columns:1fr;gap:13px}.kit-step{overflow:hidden;border:1px solid var(--line);border-radius:13px;background:#fff}.kit-step-head{display:flex;gap:9px;align-items:flex-start;padding:12px 13px;border-bottom:1px solid var(--line);background:#fafbf9}.kit-step-no{display:grid;place-items:center;width:25px;height:25px;flex:0 0 25px;border-radius:50%;background:var(--primary);color:#fff;font-size:10px;font-weight:900}.kit-step-head strong,.kit-step-head small{display:block}.kit-step-head strong{font-size:13px}.kit-step-head small{margin-top:3px;color:var(--muted);font-size:9px;line-height:1.4}.kit-step-body{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:13px}.kit-step-body>.span-2,.kit-step-body>.ux-collection-cover,.kit-step-body>textarea,.kit-automation{grid-column:1/-1}.kit-step-body .ux-collection-cover{margin:0}.kit-step-body label{font-size:9px!important}.kit-step-body input,.kit-step-body textarea{font-size:11px!important}.kit-tech{grid-column:1/-1;border:1px dashed var(--line-strong);border-radius:9px;background:#fafbf9}.kit-tech summary{cursor:pointer;padding:9px 10px;color:var(--muted);font-size:9px;font-weight:900}.kit-tech>div{padding:0 10px 10px}.kit-discount{position:relative}.kit-discount:after{content:'%';position:absolute;right:11px;bottom:11px;color:var(--muted);font-weight:900}.kit-discount input{padding-right:28px!important}.kit-price-summary{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.kit-price-summary div{padding:9px;border:1px solid var(--line);border-radius:9px;background:#fafbf9}.kit-price-summary strong,.kit-price-summary span{display:block}.kit-price-summary strong{font-size:12px}.kit-price-summary span{margin-top:3px;color:var(--muted);font-size:8px}.kit-duration-choices{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:8px}.kit-duration-choice{display:grid;grid-template-columns:auto 1fr;gap:8px;padding:10px;border:1px solid var(--line);border-radius:10px;background:#fff;cursor:pointer}.kit-duration-choice.selected{border-color:#b99842;background:#fffaf0}.kit-duration-choice input{width:18px!important;height:18px!important}.kit-duration-choice strong,.kit-duration-choice small{display:block}.kit-duration-choice strong{font-size:11px}.kit-duration-choice small{margin-top:3px;color:var(--muted);font-size:8px;line-height:1.4}.kit-duration-note{grid-column:1/-1;padding:9px;border:1px solid #c8d8c8;border-radius:9px;background:#f4faf4;color:#345f3d;font-size:9px;line-height:1.45}.kit-duration-note.warn{border-color:#ead59f;background:#fffaf0;color:#86600f}.kit-stock-source{display:none!important}.kit-automation{display:grid!important;grid-template-columns:1fr!important;gap:9px!important;padding:0!important;border:0!important;background:transparent!important}.kit-automation>div:nth-child(2){display:grid!important;grid-template-columns:repeat(3,1fr);gap:7px!important}.kit-automation button{min-height:44px;white-space:normal}.kit-automation>.badge{justify-self:start}#collectionEditor.kit-flow .collection-composition{padding:0;overflow:hidden;background:#fff}#collectionEditor.kit-flow .collection-composition>.collection-section-head{margin:0;padding:12px 13px;border-bottom:1px solid var(--line);background:#fafbf9}#collectionEditor.kit-flow .collection-product-search{position:sticky;top:0;z-index:8;margin:0;padding:11px 13px;border:0;border-bottom:1px solid var(--line);border-radius:0;background:rgba(255,255,255,.98);box-shadow:0 4px 14px rgba(24,32,25,.05)}#collectionEditor.kit-flow #collectionItems{padding:5px 13px 13px}@media(max-width:760px){.kit-step-body,.kit-duration-choices{grid-template-columns:1fr}.kit-price-summary{grid-template-columns:1fr 1fr}.kit-automation>div:nth-child(2){grid-template-columns:1fr}.kit-step-body>.span-2,.kit-step-body>.ux-collection-cover,.kit-automation{grid-column:auto}}`;
  document.head.appendChild(style);
}

function makeStep(no, title, help) {
  const node = document.createElement('section');
  node.className = 'kit-step';
  node.innerHTML = `<div class="kit-step-head"><span class="kit-step-no">${no}</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(help)}</small></div></div><div class="kit-step-body"></div>`;
  return node;
}

function move(node, host) {
  if (node && host && node.parentElement !== host) host.appendChild(node);
}

function updatePrice(ctx, keepDiscount = true) {
  if (syncingPrice) return;
  const { module, form } = ctx;
  const price = getField(form, 'preco');
  const discount = form.querySelector('[data-kit-discount]');
  const summary = form.querySelector('[data-kit-price-summary]');
  if (!price || !discount || !summary) return;
  let data = audit(module);
  const total = number(data.regularTotal);
  if (keepDiscount && module.__kitPriceMode === 'discount' && total > 0) {
    const percent = Math.min(99.99, Math.max(0, number(discount.value)));
    const next = round(total * (1 - percent / 100));
    if (round(price.value) !== next) {
      syncingPrice = true;
      price.value = next.toFixed(2);
      module.draft.preco = next;
      emit(price);
      syncingPrice = false;
      data = audit(module);
    }
  } else {
    const percent = total > 0 ? round(Math.max(0, (1 - number(price.value) / total) * 100)) : 0;
    discount.value = percent.toFixed(2);
    module.draft.desconto_percentual = percent;
  }
  const economy = Math.max(0, total - number(module.draft.preco));
  const percent = total > 0 ? round(economy / total * 100) : 0;
  const html = [[money(total), 'Compra avulsa'], [`${percent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`, 'Desconto'], [money(module.draft.preco), 'Preço do kit'], [money(economy), 'Economia']]
    .map(([value, label]) => `<div><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`).join('');
  if (summary.innerHTML !== html) summary.innerHTML = html;
}

function limitInfo(data) {
  let limit = Infinity;
  let name = '';
  (data.items || []).forEach(item => {
    const product = item.resolved?.product;
    const qty = Math.max(1, Math.floor(number(item.qtd) || 1));
    const possible = product ? Math.floor(Math.max(0, number(product.estoque)) / qty) : 0;
    if (possible < limit) {
      limit = possible;
      name = product ? productName(product) : text(item.codigo) || 'produto não encontrado';
    }
  });
  return { limit: Number.isFinite(limit) ? limit : 0, name };
}

function updateDuration(ctx) {
  const { module, form } = ctx;
  const stockMode = module.draft.ativo_ate_estoque_zero === true;
  const end = getField(form, 'data_fim');
  const start = getField(form, 'data_inicio');
  form.querySelectorAll('[data-kit-duration]').forEach(input => {
    input.checked = input.value === (stockMode ? 'stock' : 'date');
    input.closest('.kit-duration-choice')?.classList.toggle('selected', input.checked);
  });
  if (end) end.disabled = stockMode;
  const note = form.querySelector('[data-kit-duration-note]');
  if (!note) return;
  const data = audit(module);
  const limiting = limitInfo(data);
  let message = '';
  let warn = false;
  if (stockMode) {
    warn = data.available <= 0;
    message = data.available > 0
      ? `${data.available} kit(s) disponíveis agora${limiting.name ? ` · item limitante: ${limiting.name}` : ''}. O kit sai do ar quando algum item principal não atender à quantidade e volta após reposição.`
      : `Kit fora do ar por estoque${limiting.name ? ` · item limitante: ${limiting.name}` : ''}.`;
  } else {
    const begin = text(start?.value);
    const finish = text(end?.value);
    warn = !begin || !finish;
    message = begin && finish
      ? `Oferta por data: ${begin.split('-').reverse().join('/')} até ${finish.split('-').reverse().join('/')}.`
      : 'Informe a data inicial e a data final para publicar por período.';
  }
  if (note.textContent !== message) note.textContent = message;
  note.classList.toggle('warn', warn);
}

function organize(ctx) {
  const { module, editor, form } = ctx;
  const root = form.querySelector(':scope > .form-grid');
  if (!root) return;
  editor.classList.add('kit-flow');
  if (!root.classList.contains('kit-flow-root')) {
    root.classList.add('kit-flow-root');
    root.dataset.kitFlowBuild = BUILD;
    const info = makeStep(1, 'Informações do kit', 'Nome, código, imagem, descrição e status em um único bloco editável.');
    const price = makeStep(2, 'Preço e desconto', 'Digite o percentual ou o preço final; os dois ficam sincronizados.');
    const duration = makeStep(3, 'Duração da oferta', 'Escolha data definida ou venda até faltar estoque em algum item principal.');
    const automation = makeStep(4, 'Automação e divulgação', 'Gere texto, capa e Instagram depois de revisar a oferta.');
    const infoBody = info.querySelector('.kit-step-body');
    const priceBody = price.querySelector('.kit-step-body');
    const durationBody = duration.querySelector('.kit-step-body');
    const automationBody = automation.querySelector('.kit-step-body');
    ['nome', 'codigo', 'imagem', 'descricao', 'ativo'].forEach(name => move(getLabel(form, name), infoBody));
    move(root.querySelector('.ux-collection-cover'), infoBody);
    const technical = document.createElement('details');
    technical.className = 'kit-tech';
    technical.innerHTML = '<summary>Identificação técnica</summary><div></div>';
    move(getLabel(form, 'id'), technical.querySelector('div'));
    infoBody.appendChild(technical);
    const data = audit(module);
    const initialDiscount = data.regularTotal > 0 ? round((data.regularTotal - number(module.draft.preco)) / data.regularTotal * 100) : number(module.draft.desconto_percentual);
    const discount = document.createElement('label');
    discount.className = 'kit-discount';
    discount.innerHTML = `Percentual de desconto<input type="number" min="0" max="99.99" step="0.01" data-kit-discount value="${escapeHtml(Math.max(0, initialDiscount).toFixed(2))}">`;
    priceBody.appendChild(discount);
    move(getLabel(form, 'preco'), priceBody);
    move(getLabel(form, 'limite_kits'), priceBody);
    const priceSummary = document.createElement('div');
    priceSummary.className = 'kit-price-summary';
    priceSummary.dataset.kitPriceSummary = '1';
    priceBody.appendChild(priceSummary);
    const choices = document.createElement('div');
    choices.className = 'kit-duration-choices';
    choices.innerHTML = '<label class="kit-duration-choice"><input type="radio" name="kit-duration" value="date" data-kit-duration><span><strong>Por data</strong><small>O kit encerra na data final.</small></span></label><label class="kit-duration-choice"><input type="radio" name="kit-duration" value="stock" data-kit-duration><span><strong>Até algum item acabar</strong><small>A data final é ignorada e o estoque controla a oferta.</small></span></label>';
    durationBody.appendChild(choices);
    move(getLabel(form, 'data_inicio'), durationBody);
    move(getLabel(form, 'data_fim'), durationBody);
    const stockSource = getLabel(form, 'ativo_ate_estoque_zero');
    if (stockSource) {
      stockSource.classList.add('kit-stock-source');
      durationBody.appendChild(stockSource);
    }
    const durationNote = document.createElement('div');
    durationNote.className = 'kit-duration-note';
    durationNote.dataset.kitDurationNote = '1';
    durationBody.appendChild(durationNote);
    const make = root.querySelector('.collection-make-tools');
    if (make) {
      make.classList.add('kit-automation');
      const title = make.querySelector('strong');
      const help = make.querySelector('small');
      if (title) title.textContent = 'Automações do kit';
      if (help) help.textContent = 'Execute uma etapa por vez. Tudo continua editável antes de salvar.';
      const labels = { description: 'Gerar nome e descrição', cover: 'Gerar capa da oferta', instagram: 'Gerar carrossel e fila' };
      make.querySelectorAll('[data-collection-make]').forEach(button => { button.textContent = labels[button.dataset.collectionMake] || button.textContent; });
      automationBody.appendChild(make);
    }
    root.append(info, price, duration, automation);
    module.__kitPriceMode = 'price';
  }
  updatePrice(ctx);
  updateDuration(ctx);
  const compTitle = document.querySelector('#collectionEditor .collection-composition h3');
  const compHelp = document.querySelector('#collectionEditor .collection-composition p');
  if (compTitle && compTitle.textContent !== 'Composição do kit') compTitle.textContent = 'Composição do kit';
  if (compHelp && !compHelp.textContent.startsWith('Adicione os produtos')) compHelp.textContent = 'Adicione os produtos em sequência. A posição da tela e o foco da busca são preservados.';
  const reviewTitle = document.querySelector('#collectionAudit .ux-editor-section-head strong');
  const reviewHelp = document.querySelector('#collectionAudit .ux-editor-section-head span');
  if (reviewTitle && reviewTitle.textContent !== '5. Revisão final') reviewTitle.textContent = '5. Revisão final';
  if (reviewHelp && !reviewHelp.textContent.startsWith('Confira preço')) reviewHelp.textContent = 'Confira preço, desconto, disponibilidade, erros e avisos antes de publicar.';
}

function restoreScroll(ctx) {
  if (!scrollState) return;
  const body = ctx.editor.querySelector('.collection-editor-body');
  if (body) body.scrollTop = scrollState.top;
  document.getElementById('collectionProductSearch')?.focus({ preventScroll: true });
  scrollState = null;
}

function refresh() {
  installCss();
  const ctx = context();
  if (!ctx) {
    if (getModule()?.type !== 'kit') document.getElementById('collectionEditor')?.classList.remove('kit-flow');
    return;
  }
  organize(ctx);
  restoreScroll(ctx);
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    refresh();
  });
}

document.addEventListener('click', event => {
  if (!event.target.closest?.('[data-collection-add-product]')) return;
  const ctx = context();
  if (!ctx) return;
  scrollState = { top: ctx.editor.querySelector('.collection-editor-body')?.scrollTop || 0 };
  requestAnimationFrame(() => requestAnimationFrame(schedule));
}, true);

document.addEventListener('input', event => {
  const ctx = context();
  if (!ctx) return;
  if (event.target.matches('[data-kit-discount]')) {
    ctx.module.__kitPriceMode = 'discount';
    ctx.module.draft.desconto_percentual = Math.min(99.99, Math.max(0, number(event.target.value)));
    updatePrice(ctx);
    ctx.module.renderAudit?.();
    updateDuration(ctx);
  } else if (event.target.matches('[data-collection-field="preco"]')) {
    if (!syncingPrice) ctx.module.__kitPriceMode = 'price';
    queueMicrotask(() => updatePrice(ctx, false));
  } else if (event.target.matches('[data-collection-item-qty]')) {
    requestAnimationFrame(() => {
      const current = context();
      if (current) {
        updatePrice(current);
        updateDuration(current);
      }
    });
  }
}, true);

document.addEventListener('change', event => {
  if (!event.target.matches('[data-kit-duration]')) return;
  const ctx = context();
  if (!ctx) return;
  const stockMode = event.target.value === 'stock';
  const stock = getField(ctx.form, 'ativo_ate_estoque_zero');
  const end = getField(ctx.form, 'data_fim');
  if (stock) {
    stock.checked = stockMode;
    ctx.module.draft.ativo_ate_estoque_zero = stockMode;
    emit(stock, 'change');
  }
  if (stockMode && end?.value) {
    end.value = '';
    ctx.module.draft.data_fim = '';
    emit(end);
  }
  ctx.module.renderAudit?.();
  updateDuration(ctx);
}, true);

window.addEventListener('admin-v2-route-ready', schedule);
window.addEventListener('admin-v2-route', schedule);
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
else schedule();
