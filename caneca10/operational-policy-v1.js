(() => {
  'use strict';

  const BUILD = '20260829-caneca10-operational-policy-v1';
  const FIREBASE_URL = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const POLICY = Object.freeze({
    marca: 'Caneca Fácil',
    estoque: 100,
    estoque_gerenciado: true,
    estoque_situacao_em_estoque: 1,
    estoque_situacao_sem_estoque: 0,
    peso_embalado_kg: 0.3,
    altura_embalada_cm: 11,
    largura_embalada_cm: 11,
    comprimento_embalado_cm: 11
  });

  function patchBody() {
    return {
      ...POLICY,
      'loja_integrada/marca_nome': 'Caneca Fácil',
      'loja_integrada/tipo_producao': 'revenda',
      'loja_integrada/origem_mercadoria': '0',
      'loja_integrada/estoque_gerenciado': true,
      'loja_integrada/estoque_quantidade': 100,
      'loja_integrada/situacao_em_estoque': 1,
      'loja_integrada/situacao_sem_estoque': 0,
      politica_caneca_facil_versao: BUILD,
      last_update: Date.now(),
      updated_at: new Date().toISOString()
    };
  }

  async function patchProduct(key) {
    const id = String(key || '').trim();
    if (!id) return;
    const response = await fetch(`${FIREBASE_URL}/produtos/${encodeURIComponent(id)}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(patchBody())
    });
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
  }

  async function onCreated(event) {
    try { await patchProduct(event.detail?.key); }
    catch (error) { console.error('[Caneca10] Falha ao aplicar política operacional:', error); }
  }

  window.addEventListener('caneca10:mug-created', onCreated);
  document.documentElement.dataset.caneca10Policy = BUILD;
})();
