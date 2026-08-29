import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';

const BUILD = document.querySelector('meta[name="admin-save-build"]')?.content
  || new URLSearchParams(window.location.search).get('admin_build')
  || '20260825-mug-v9-cadastro';
const POLICY_BUILD = '20260829-producao-mug-operational-policy-v1';

let galleryPromise = null;
let timer = null;

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

async function applyOperationalPolicy(key) {
  const id = String(key || '').trim();
  if (!id) return;
  const config = loadConfig();
  const firebaseUrl = String(config.firebaseUrl || '').replace(/\/+$/, '');
  const productsNode = String(config.productsNode || DEFAULT_CONFIG.productsNode || 'produtos').replace(/^\/+|\/+$/g, '').replace(/\.json$/i, '');
  if (!firebaseUrl) return;

  const patch = {
    marca: 'Caneca Fácil',
    estoque: 100,
    estoque_gerenciado: true,
    estoque_situacao_em_estoque: 1,
    estoque_situacao_sem_estoque: 0,
    peso_embalado_kg: 0.3,
    altura_embalada_cm: 11,
    largura_embalada_cm: 11,
    comprimento_embalado_cm: 11,
    politica_caneca_facil_versao: POLICY_BUILD,
    updated_at: new Date().toISOString(),
    last_update: Date.now(),
    loja_integrada: {
      marca_nome: 'Caneca Fácil',
      tipo_producao: 'revenda',
      origem_mercadoria: '0',
      estoque_gerenciado: true,
      estoque_quantidade: 100,
      situacao_em_estoque: 1,
      situacao_sem_estoque: 0
    }
  };

  const response = await fetch(`${firebaseUrl}/${productsNode}/${encodeURIComponent(id)}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(patch)
  });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
}

function galleryModule() {
  if (!galleryPromise) {
    galleryPromise = import(`./mug-studio-gallery.js?admin_build=${encodeURIComponent(BUILD)}`);
  }
  return galleryPromise;
}

function schedule(delay = 120) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (window.adminV2CurrentRoute?.() !== 'mug-studio') return;
    try {
      const gallery = await galleryModule();
      await gallery.refresh(true);
    } catch (error) {
      console.error('Falha ao finalizar o Criador de Canecas V8:', error);
    }
  }, delay);
}

window.addEventListener('admin-v2-route-ready', event => {
  if (event.detail?.route === 'mug-studio') schedule(120);
});
window.addEventListener('admin-v2-route', event => {
  if (event.detail?.route === 'mug-studio') schedule(120);
});
window.addEventListener('admin-v2-products-invalidated', event => {
  const key = event.detail?.key;
  const source = String(event.detail?.source || '');
  const isMugStudioEvent = /mug|caneca/i.test(source) || window.adminV2CurrentRoute?.() === 'mug-studio';
  if (key && isMugStudioEvent) {
    applyOperationalPolicy(key).catch(error => console.error('Falha ao aplicar política Caneca Fácil:', error));
  }
  schedule(850);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => schedule(160), { once: true });
} else {
  schedule(160);
}

export { schedule, applyOperationalPolicy };
