import { FIREBASE_BASE, safeKey } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs, invalidateMugs } from './mug-store-v2.js?v=20260829-1';

export const MUG_POLICY_BUILD = '20260829-admin-canecas-mug-policy-v1';
export const MUG_POLICY = Object.freeze({
  stockManaged: true,
  initialStock: 100,
  availabilityBusinessDays: 1,
  outOfStockDays: 0,
  weightKg: 0.3,
  heightCm: 11,
  widthCm: 11,
  depthCm: 11,
  productionType: 'revenda',
  originCode: '0',
  brandName: 'Caneca Fácil',
  marketClassification: 'Casa, Móveis e Decoração » Cozinha » Louça e Artigos para Servir » Louça » Canecas'
});

const $ = (s, r = document) => r.querySelector(s);
let migrating = false;
let migrated = false;

function setValue(id, value) {
  const el = $(`#${id}`);
  if (!el) return;
  el.value = String(value);
}

function lockField(id, title = 'Padrão fixo da operação Caneca Fácil') {
  const el = $(`#${id}`);
  if (!el) return;
  if (el.tagName === 'SELECT') el.disabled = true;
  else el.readOnly = true;
  el.title = title;
  el.dataset.canecaPolicy = 'fixed';
}

function applyDrawerPolicy() {
  if (!$('#cfStockManaged')) return;
  setValue('cfStockManaged', '1');
  setValue('cfStock', MUG_POLICY.initialStock);
  setValue('cfAvailability', MUG_POLICY.availabilityBusinessDays);
  setValue('cfOutMode', '0');
  setValue('cfOutDays', '1');
  setValue('cfWeight', MUG_POLICY.weightKg);
  setValue('cfHeight', MUG_POLICY.heightCm);
  setValue('cfWidth', MUG_POLICY.widthCm);
  setValue('cfLength', MUG_POLICY.depthCm);
  setValue('cfBrandName', MUG_POLICY.brandName);
  setValue('cfMarketClass', MUG_POLICY.marketClassification);

  ['cfStockManaged','cfStock','cfAvailability','cfOutMode','cfOutDays','cfWeight','cfHeight','cfWidth','cfLength','cfBrandName'].forEach(lockField);

  const section = $('#cfStockManaged')?.closest('.form-section');
  if (section && !$('#cfFixedPolicyNote', section)) {
    const note = document.createElement('div');
    note.id = 'cfFixedPolicyNote';
    note.className = 'notice';
    note.style.marginTop = '9px';
    note.innerHTML = '<b>Padrão Caneca Fácil:</b> estoque operacional 100 · preparação 1 dia útil · continua vendendo ao zerar · 0,3 kg · 11 × 11 × 11 cm. Estes campos são fixos para evitar cadastro divergente.';
    section.appendChild(note);
  }

  const liSection = $('#cfLiBrand')?.closest('.form-section');
  if (liSection && !$('#cfBrandPolicyNote', liSection)) {
    const note = document.createElement('div');
    note.id = 'cfBrandPolicyNote';
    note.className = 'notice';
    note.style.marginTop = '9px';
    note.innerHTML = '<b>Marca na Loja Integrada:</b> Caneca Fácil. Se a URI da marca estiver vazia, use “Marca/categorias LI” antes de sincronizar.';
    liSection.appendChild(note);
  }
}

function productKey(p = {}) {
  return String(p.firebaseKey || p.id || p.__key || '').trim();
}

function different(a, b) {
  if (typeof b === 'number') return Number(a) !== b;
  if (typeof b === 'boolean') return a !== b;
  return String(a ?? '') !== String(b ?? '');
}

function putUpdate(updates, key, path, current, value) {
  if (different(current, value)) updates[`${safeKey(key)}/${path}`] = value;
}

async function migrateFirebasePolicy() {
  if (migrating || migrated) return;
  migrating = true;
  try {
    const mugs = await loadMugs();
    const updates = {};
    for (const p of mugs) {
      const key = productKey(p);
      if (!key) continue;
      const li = p.loja_integrada && typeof p.loja_integrada === 'object' ? p.loja_integrada : {};
      const currentStock = Number(p.estoque);
      const stock = Number.isFinite(currentStock) && currentStock > 0 ? Math.floor(currentStock) : MUG_POLICY.initialStock;

      putUpdate(updates, key, 'estoque_gerenciado', p.estoque_gerenciado, true);
      if (!(Number.isFinite(currentStock) && currentStock > 0)) putUpdate(updates, key, 'estoque', p.estoque, MUG_POLICY.initialStock);
      putUpdate(updates, key, 'estoque_situacao_em_estoque', p.estoque_situacao_em_estoque, MUG_POLICY.availabilityBusinessDays);
      putUpdate(updates, key, 'estoque_situacao_sem_estoque', p.estoque_situacao_sem_estoque, MUG_POLICY.outOfStockDays);
      putUpdate(updates, key, 'peso_embalado_kg', p.peso_embalado_kg, MUG_POLICY.weightKg);
      putUpdate(updates, key, 'altura_embalada_cm', p.altura_embalada_cm, MUG_POLICY.heightCm);
      putUpdate(updates, key, 'largura_embalada_cm', p.largura_embalada_cm, MUG_POLICY.widthCm);
      putUpdate(updates, key, 'comprimento_embalado_cm', p.comprimento_embalado_cm, MUG_POLICY.depthCm);

      putUpdate(updates, key, 'loja_integrada/estoque_gerenciado', li.estoque_gerenciado, true);
      putUpdate(updates, key, 'loja_integrada/estoque_quantidade', li.estoque_quantidade, stock);
      putUpdate(updates, key, 'loja_integrada/situacao_em_estoque', li.situacao_em_estoque, MUG_POLICY.availabilityBusinessDays);
      putUpdate(updates, key, 'loja_integrada/situacao_sem_estoque', li.situacao_sem_estoque, MUG_POLICY.outOfStockDays);
      putUpdate(updates, key, 'loja_integrada/tipo_producao', li.tipo_producao, MUG_POLICY.productionType);
      putUpdate(updates, key, 'loja_integrada/origem_mercadoria', li.origem_mercadoria, MUG_POLICY.originCode);
      putUpdate(updates, key, 'loja_integrada/marca_nome', li.marca_nome, MUG_POLICY.brandName);
      putUpdate(updates, key, 'loja_integrada/classificacao_mercado', li.classificacao_mercado, MUG_POLICY.marketClassification);
      putUpdate(updates, key, 'politica_caneca_facil_versao', p.politica_caneca_facil_versao, MUG_POLICY_BUILD);
    }

    if (Object.keys(updates).length) {
      const response = await fetch(`${FIREBASE_BASE}/produtos.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!response.ok) throw new Error(`Firebase ${response.status}`);
      invalidateMugs('política Caneca Fácil aplicada');
      console.info(`[Admin Canecas] política fixa aplicada em ${mugs.length} caneca(s), ${Object.keys(updates).length} campo(s) normalizado(s).`);
      setTimeout(() => $('#cfMugReload')?.click(), 80);
    }
    migrated = true;
  } catch (error) {
    console.error('[Admin Canecas] falha ao aplicar política fixa:', error);
  } finally {
    migrating = false;
  }
}

function validateBrandBeforeSync(event) {
  const button = event.target.closest?.('button');
  if (!button || !['cfSaveSync', 'cfSyncNow'].includes(button.id)) return;
  applyDrawerPolicy();
  const brandUri = String($('#cfLiBrand')?.value || '').trim();
  if (brandUri) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  alert('A marca Caneca Fácil já deve existir na Loja Integrada, mas a URI ainda não foi carregada. Feche o produto, clique em “Marca/categorias LI” e depois sincronize novamente.');
}

window.addEventListener('admin-canecas:drawer', event => {
  if (event.detail?.kind === 'mug') applyDrawerPolicy();
});
window.addEventListener('admin-canecas:route', event => {
  if (event.detail?.route === 'mugs') migrateFirebasePolicy();
});
document.addEventListener('click', validateBrandBeforeSync, true);

document.documentElement.dataset.adminCanecasMugPolicy = MUG_POLICY_BUILD;
