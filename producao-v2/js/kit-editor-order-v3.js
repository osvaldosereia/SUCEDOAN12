const BUILD = '20260728-kit-editor-order-v3';
let scheduled = false;

function currentContext() {
  const module = window.__adminV2CollectionsModule;
  const editor = document.getElementById('collectionEditor');
  const root = document.querySelector('#collectionForm > .form-grid.kit-flow-root');
  if (!module || module.type !== 'kit' || !module.draft || !editor?.classList.contains('open') || !root) return null;
  return { module, editor, root };
}

function installStyles() {
  if (document.getElementById('kitEditorOrderV3Css')) return;
  const style = document.createElement('style');
  style.id = 'kitEditorOrderV3Css';
  style.textContent = `
    #collectionEditor.kit-flow .kit-composition-step,
    #collectionEditor.kit-flow .kit-review-step{margin:0;padding:0;border:1px solid var(--line);border-radius:13px;background:#fff;overflow:hidden}
    #collectionEditor.kit-flow .kit-composition-step>.kit-step-head,
    #collectionEditor.kit-flow .kit-review-step>.kit-step-head{display:flex;gap:9px;align-items:flex-start;margin:0;padding:12px 13px;border:0;border-bottom:1px solid var(--line);border-radius:0;background:#fafbf9}
    #collectionEditor.kit-flow .kit-composition-step>.kit-step-head div,
    #collectionEditor.kit-flow .kit-review-step>.kit-step-head div{min-width:0}
    #collectionEditor.kit-flow .kit-composition-step>.kit-step-head h3,
    #collectionEditor.kit-flow .kit-review-step>.kit-step-head strong{display:block;margin:0;font-size:13px}
    #collectionEditor.kit-flow .kit-composition-step>.kit-step-head p,
    #collectionEditor.kit-flow .kit-review-step>.kit-step-head span{display:block;margin:3px 0 0;color:var(--muted);font-size:9px;line-height:1.4}
    #collectionEditor.kit-flow .kit-review-step>.collection-audit-metrics{margin:13px 13px 0}
    #collectionEditor.kit-flow .kit-review-step>.collection-audit-issues,
    #collectionEditor.kit-flow .kit-review-step>.collection-audit-ready{margin:9px 13px 13px}
  `;
  document.head.appendChild(style);
}

function stepByTitle(root, title) {
  return [...root.querySelectorAll(':scope > .kit-step')].find(step =>
    step.querySelector(':scope > .kit-step-head strong')?.textContent?.trim() === title
  ) || null;
}

function renumber(step, number) {
  const badge = step?.querySelector(':scope > .kit-step-head .kit-step-no');
  if (badge && badge.textContent !== String(number)) badge.textContent = String(number);
}

function prepareComposition(editor) {
  const composition = editor.querySelector('.collection-composition');
  if (!composition) return null;
  composition.classList.add('kit-step', 'kit-composition-step');
  const head = composition.querySelector(':scope > .collection-section-head');
  if (head) {
    head.classList.add('kit-step-head');
    if (head.dataset.kitOrderBuild !== BUILD) {
      head.dataset.kitOrderBuild = BUILD;
      head.innerHTML = '<span class="kit-step-no">2</span><div><h3>Composição do kit</h3><p>Adicione os produtos em sequência, ajuste quantidades e substitutos sem perder a posição da tela.</p></div>';
    }
  }
  return composition;
}

function prepareReview(editor) {
  const review = editor.querySelector('#collectionAudit');
  if (!review) return null;
  review.classList.add('kit-step', 'kit-review-step');
  let head = review.querySelector(':scope > .ux-editor-section-head');
  if (!head) {
    head = document.createElement('div');
    review.prepend(head);
  }
  head.className = 'ux-editor-section-head kit-step-head';
  if (head.dataset.kitOrderBuild !== BUILD) {
    head.dataset.kitOrderBuild = BUILD;
    head.innerHTML = '<span class="kit-step-no">6</span><div><strong>Revisão final</strong><span>Confira preço, desconto, disponibilidade, período, erros e avisos antes de publicar.</span></div>';
  }
  return review;
}

function applyOrder() {
  installStyles();
  const context = currentContext();
  if (!context) return;
  const { editor, root } = context;
  const info = stepByTitle(root, 'Informações do kit');
  const price = stepByTitle(root, 'Preço e desconto');
  const duration = stepByTitle(root, 'Duração da oferta');
  const automation = stepByTitle(root, 'Automação e divulgação');
  const composition = prepareComposition(editor);
  const review = prepareReview(editor);

  renumber(info, 1);
  renumber(price, 3);
  renumber(duration, 4);
  renumber(automation, 5);

  [info, composition, price, duration, automation, review].filter(Boolean).forEach(node => root.appendChild(node));
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    applyOrder();
  });
}

window.addEventListener('admin-v2-route', schedule);
window.addEventListener('admin-v2-route-ready', schedule);
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
else schedule();
