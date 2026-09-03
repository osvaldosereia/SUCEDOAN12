(() => {
  'use strict';

  const BUILD = '20260903-admin-canecas-finalize-recovery-v2.1-github-media-queue';
  const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const REPO = 'osvaldosereia/SUCEDOAN12';
  const MEDIA_BRANCH = 'canecas-media';
  const MEDIA_QUEUE = 'canecas/integracoes/loja_integrada/midia_fila';
  const WAIT_MS = 90000;
  const POLL_MS = 1800;
  const CATEGORIES = Object.freeze({
    padronizadas: 'Canecas Padronizadas',
    personalizaveis: 'Canecas Personalizáveis',
    empresas: 'Canecas para Empresas',
  });

  if (window.__CF_ADMIN_MUG_FINAL_RECOVERY__ === BUILD) return;

  const text = v => String(v ?? '').trim();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const isHttp = v => /^https?:\/\//i.test(text(v));
  const slug = v => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 110) || 'caneca-personalizada';

  function queueKey(value) {
    const bytes = new TextEncoder().encode(text(value));
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function parseFinalize(init) {
    if (String(init?.method || 'GET').toUpperCase() !== 'POST' || typeof init?.body !== 'string') return null;
    if (!init.body.includes('finalize_mug_product')) return null;
    try {
      const outer = JSON.parse(init.body);
      const payload = typeof outer?.payload === 'string' ? JSON.parse(outer.payload) : outer?.payload;
      return payload?.action === 'finalize_mug_product' && payload?.request_id ? payload : null;
    } catch { return null; }
  }

  function cleanLegacyMedia(template) {
    for (const key of [
      'mockup_3','vitrine_recorte_esquerda','vitrine_recorte_centro','vitrine_recorte_direita','vitrine_recortes',
      'vitrine_recortes_status','vitrine_recortes_erro','vitrine_recortes_processador','vitrine_recortes_iniciado_em',
      'vitrine_recortes_solicitado_em','vitrine_recortes_atualizado_em','crop_left_base64','crop_center_base64',
      'crop_right_base64','crop_version','recorte_esquerdo','recorte_centro','recorte_direito','recorte_1','recorte_2','recorte_3',
      'crop_left_url','crop_center_url','crop_right_url'
    ]) delete template[key];
    return template;
  }

  function enrich(payload) {
    const type = text(document.querySelector('#mugStoreCategory')?.value);
    const name = CATEGORIES[type] || '';
    let template = {};
    try { template = JSON.parse(payload.firebase_template_json || '{}') || {}; } catch {}
    template = cleanLegacyMedia(template);
    if (name) {
      const personalizavel = type === 'personalizaveis';
      template = {
        ...template,
        loja_integrada_categoria_tipo: type,
        loja_integrada_categoria_nome: name,
        canecafacil_categoria_tipo: type,
        canecafacil_categoria_nome: name,
        personalizavel,
        loja_integrada_personalizavel: personalizavel,
        canecafacil_personalizavel: personalizavel,
        loja_integrada: {
          ...(template.loja_integrada || {}), categoria_tipo: type, categoria_nome: name,
          marca_nome: 'Caneca Fácil', tipo_producao: 'revenda', origem_mercadoria: '0', personalizavel,
        },
      };
    }
    template.vitrine_loja_integrada_status = 'pendente_github';
    template.vitrine_loja_integrada_erro = '';
    return {
      ...payload,
      seo_slug: text(payload.seo_slug) || slug(payload.product_name || template.nome || payload.request_id),
      firebase_template_json: JSON.stringify(template),
    };
  }

  function urlsOf(product = {}) {
    return {
      art: text(product.arte_horizontal || product.arte_personalizacao || product.arte_impressao?.url),
      m1: text(product.mockup_1 || product.url_imagem || product.imagens_site?.[0] || product.imagens?.[0]),
      m2: text(product.mockup_2 || product.imagens_site?.[1] || product.imagens?.[1]),
    };
  }

  function setStatus(seconds) {
    const status = document.querySelector('#mugAutomationStatus');
    const title = document.querySelector('#mugProgressTitle');
    if (title) title.textContent = 'Finalizando e recuperando';
    if (status) status.textContent = `Aguardando Firebase/GitHub concluir a caneca… ${seconds}s`;
  }

  function cuiabaDate(offset = 0) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(Date.now() + offset * 86400000));
    const p = type => parts.find(item => item.type === type)?.value || '';
    return `${p('year')}-${p('month')}-${p('day')}`;
  }

  async function json(fetchFn, url, init = {}) {
    const r = await fetchFn(url, { cache: 'no-store', ...init });
    if (!r.ok) return null;
    return r.json().catch(() => null);
  }

  async function readProduct(fetchFn, id) {
    return json(fetchFn, `${FIREBASE}/produtos/${encodeURIComponent(id)}.json?_=${Date.now()}`, { headers: { Accept: 'application/json' } });
  }

  async function enqueueMedia(fetchFn, productKey) {
    const key = text(productKey);
    if (!key) return false;
    const at = new Date().toISOString();
    const qKey = queueKey(key);
    const queueResponse = await fetchFn(`${FIREBASE}/${MEDIA_QUEUE}/${encodeURIComponent(qKey)}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        product_key: key,
        status: 'pendente',
        force: false,
        solicitado_em: at,
        atualizado_em: at,
        solicitado_por: 'admin_finalize_github_direct',
        tentativas: 0,
        erro: '',
        via: 'github_actions',
      }),
    });
    if (!queueResponse.ok) throw new Error(`Firebase ${queueResponse.status} ao enfileirar mídia da nova caneca.`);
    await fetchFn(`${FIREBASE}/produtos/${encodeURIComponent(key)}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        vitrine_loja_integrada_status: 'pendente_github',
        vitrine_loja_integrada_erro: '',
        vitrine_loja_integrada_solicitado_em: at,
        vitrine_loja_integrada_via: 'github_actions',
      }),
    }).catch(() => null);
    console.info('[Admin Canecas] nova caneca enviada diretamente à fila de mídia GitHub:', key);
    return true;
  }

  async function listDir(fetchFn, path) {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const url = `https://api.github.com/repos/${REPO}/contents/${encoded}?ref=${MEDIA_BRANCH}&_=${Date.now()}`;
    const result = await json(fetchFn, url, { headers: { Accept: 'application/vnd.github+json' } });
    return Array.isArray(result) ? result : [];
  }

  async function findMedia(fetchFn, payload) {
    let template = {};
    try { template = JSON.parse(payload.firebase_template_json || '{}') || {}; } catch {}
    const prefixes = [...new Set([text(payload.seo_slug), slug(payload.product_name || template.nome || payload.request_id), text(payload.request_id)].filter(Boolean))];
    for (const date of [cuiabaDate(0), cuiabaDate(-1)]) {
      const [arts, mocks] = await Promise.all([
        listDir(fetchFn, `canecas/imagens/artes-geradas/${date}`),
        listDir(fetchFn, `canecas/imagens/mockups/${date}`),
      ]);
      for (const prefix of prefixes) {
        const artPrefix = `${prefix}-arte-horizontal-`;
        const candidates = arts.filter(f => text(f.name).startsWith(artPrefix) && text(f.name).endsWith('.webp'))
          .sort((a, b) => text(b.name).localeCompare(text(a.name)));
        for (const art of candidates) {
          const uid = text(art.name).slice(artPrefix.length, -5);
          const m1 = mocks.find(f => text(f.name) === `${prefix}-mockup-1-${uid}.webp`);
          const m2 = mocks.find(f => text(f.name) === `${prefix}-mockup-2-${uid}.webp`);
          const urls = { art: text(art.download_url), m1: text(m1?.download_url), m2: text(m2?.download_url) };
          if ([urls.art, urls.m1, urls.m2].every(isHttp)) return urls;
        }
      }
    }
    return null;
  }

  async function saveProduct(fetchFn, payload, urls) {
    let raw = text(payload.firebase_template_json);
    if (!raw) throw new Error('Template Firebase ausente.');
    raw = raw.replaceAll('__MUG_ART__', urls.art).replaceAll('__MUG_MOCKUP_1__', urls.m1)
      .replaceAll('__MUG_MOCKUP_2__', urls.m2).replaceAll('__MUG_MOCKUP_3__', '');
    const product = cleanLegacyMedia(JSON.parse(raw));
    product.vitrine_loja_integrada_status = 'pendente_github';
    product.vitrine_loja_integrada_erro = '';
    product.geracao_status = 'concluido';
    product.geracao_etapa = 'firebase_recuperado_admin';
    product.updated_at = new Date().toISOString();
    product.last_update = Date.now();
    const r = await fetchFn(`${FIREBASE}/produtos/${encodeURIComponent(payload.request_id)}.json`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(product),
    });
    if (!r.ok) throw new Error(`Firebase ${r.status} ao recuperar produto.`);
  }

  function recoveredResponse(payload, urls, source) {
    return new Response(JSON.stringify({
      ok: true, action: 'finalize_mug_product', request_id: payload.request_id,
      firebase_key: payload.request_id, product_saved: true,
      arte_horizontal_url: urls.art, mockup_1_url: urls.m1, mockup_2_url: urls.m2,
      storefront_media_status: 'pendente_github', storefront_media_via: 'github_actions', recovered_by: source,
    }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-CanecaFacil-Final-Recovered': '1' } });
  }

  async function recover(fetchFn, payload) {
    const started = Date.now();
    let lastGitHub = 0;
    while (Date.now() - started < WAIT_MS) {
      setStatus(Math.max(1, Math.round((Date.now() - started) / 1000)));
      try {
        const product = await readProduct(fetchFn, payload.request_id);
        const urls = urlsOf(product || {});
        if ([urls.art, urls.m1, urls.m2].every(isHttp)) {
          await enqueueMedia(fetchFn, payload.request_id);
          return recoveredResponse(payload, urls, 'firebase');
        }
      } catch (error) { console.warn('[Admin Canecas] produto pronto, mas mídia ainda não pôde ser enfileirada:', error); }
      if (Date.now() - lastGitHub > 7000) {
        lastGitHub = Date.now();
        try {
          const urls = await findMedia(fetchFn, payload);
          if (urls) {
            await saveProduct(fetchFn, payload, urls);
            await enqueueMedia(fetchFn, payload.request_id);
            return recoveredResponse(payload, urls, 'github-media');
          }
        } catch (error) { console.warn('[Admin Canecas] arquivos finais ainda não disponíveis:', error); }
      }
      await sleep(POLL_MS);
    }
    throw new Error('A arte e os mockups foram gerados, mas o produto não foi concluído em 90 segundos.');
  }

  function install() {
    if (window.__CF_ADMIN_MUG_FINAL_RECOVERY__ === BUILD) return;
    const innerFetch = window.fetch.bind(window);
    window.fetch = async function cfAdminMugFinalizeRecovery(input, init = {}) {
      const original = parseFinalize(init);
      if (!original) return innerFetch(input, init);
      const payload = enrich(original);
      try {
        const response = await innerFetch(input, init);
        if (!response.ok) return response;
        const raw = text(await response.clone().text().catch(() => ''));
        if (/^accepted\.?$/i.test(raw)) return recover(innerFetch, payload);
        return response;
      } catch (error) {
        console.warn('[Admin Canecas] finalização do Make interrompida; recuperando pelo GitHub/Firebase.', error);
        return recover(innerFetch, payload);
      }
    };
    window.__CF_ADMIN_MUG_FINAL_RECOVERY__ = BUILD;
    document.documentElement.dataset.cfAdminMugFinalRecovery = BUILD;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(install, 150), { once: true });
  else setTimeout(install, 150);
})();