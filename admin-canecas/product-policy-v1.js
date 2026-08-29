const BUILD = '20260829-caneca-facil-product-policy-v1.1';

const POLICY = Object.freeze({
  brand: 'Caneca Fácil',
  stockManaged: true,
  stock: 100,
  availabilityDays: 1,
  outOfStockDays: 0,
  weightKg: 0.3,
  heightCm: 11,
  widthCm: 11,
  lengthCm: 11,
  productionType: 'revenda',
  originCode: '0'
});

const $ = (s, r = document) => r.querySelector(s);

function setValue(id, value, { readOnly = true } = {}) {
  const el = $(`#${id}`);
  if (!el) return;
  el.value = String(value);
  if (readOnly && el.tagName === 'INPUT') el.readOnly = true;
  if (readOnly && el.tagName === 'SELECT') el.disabled = true;
}

function neutralizeSharedTimestampConflict() {
  const root = $('#drawerContent');
  if (!root || !root.dataset.productKey) return;
  // last_update é compartilhado por Admin, Make, Caneca10, Produção e Loja Integrada.
  // Portanto não pode ser usado como trava de concorrência de edição humana.
  root.dataset.loadedStamp = '0';
  root.dataset.conflictGuard = 'shared-last-update-ignored';
}

function applyDrawerPolicy() {
  const root = $('#drawerContent');
  if (!root || !root.dataset.productKey) return;

  neutralizeSharedTimestampConflict();

  setValue('cfBrandName', POLICY.brand);
  setValue('cfStockManaged', '1');
  setValue('cfStock', POLICY.stock);
  setValue('cfAvailability', POLICY.availabilityDays);
  setValue('cfOutMode', String(POLICY.outOfStockDays));
  setValue('cfWeight', POLICY.weightKg);
  setValue('cfHeight', POLICY.heightCm);
  setValue('cfWidth', POLICY.widthCm);
  setValue('cfLength', POLICY.lengthCm);

  const outDays = $('#cfOutDays');
  if (outDays) {
    outDays.value = '1';
    outDays.readOnly = true;
  }

  let note = $('#cfOperationalPolicyNote');
  const stockSection = $('#cfStock')?.closest('.form-section');
  if (stockSection && !note) {
    note = document.createElement('div');
    note.id = 'cfOperationalPolicyNote';
    note.className = 'notice';
    note.style.marginTop = '8px';
    note.innerHTML = '<b>Padrão Caneca Fácil:</b> 100 unidades, preparação em 1 dia útil, continuar vendendo ao zerar sem prazo adicional, 0,3 kg e 11 × 11 × 11 cm. Produção: revenda · origem: nacional.';
    stockSection.appendChild(note);
  }
}

window.addEventListener('admin-canecas:drawer', event => {
  if (event.detail?.kind !== 'mug') return;
  queueMicrotask(applyDrawerPolicy);
});

document.addEventListener('click', event => {
  if (!event.target.closest?.('#cfSaveOnly,#cfSaveSync,#cfSyncNow')) return;
  neutralizeSharedTimestampConflict();
  applyDrawerPolicy();
}, true);

document.documentElement.dataset.cfProductPolicy = BUILD;
window.__CANECA_FACIL_PRODUCT_POLICY__ = POLICY;

export { POLICY, applyDrawerPolicy, neutralizeSharedTimestampConflict };
