(() => {
  'use strict';
  const BUILD = '20260826-ceneca10-make-client-guard-v6-accepted-poll';
  const TARGET = 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
  const FALLBACK_FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const FINAL_TIMEOUT_MS = 150000;
  const POLL_MS = 1800;
  const text = value => String(value ?? '').trim();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const cleanSnippet = raw => text(raw).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,180);
  const isUrl = value => /^https?:\/\//i.test(text(value)) && !text(value).startsWith('__MUG_');
  function payloadFrom(init={}){
    if (typeof init?.body !== 'string') return null;
    try {
      const outer = JSON.parse(init.body || '{}');
      const payload = typeof outer.payload === 'string' ? JSON.parse(outer.payload) : outer.payload;
      return payload && typeof payload === 'object' ? payload : null;
    } catch { return null; }
  }
  function normalizeRequest(init={}){
    if (typeof init?.body !== 'string') return init;
    try {
      const outer = JSON.parse(init.body || '{}');
      let payload = typeof outer.payload === 'string' ? JSON.parse(outer.payload) : outer.payload;
      if (!payload || typeof payload !== 'object') return init;
      if (payload.action === 'personalize_mug_model' && !text(payload.image_base64)) {
        let images = payload.images_json;
        if (typeof images === 'string') { try { images = JSON.parse(images); } catch { images = []; } }
        if (Array.isArray(images) && text(images[0]?.image_base64)) payload.image_base64 = images[0].image_base64;
      }
      payload.client_contract = BUILD;
      return { ...init, body: JSON.stringify({ ...outer, payload: JSON.stringify(payload) }) };
    } catch { return init; }
  }
  function urlsFromProduct(product={}){
    return {
      art:text(product.arte_horizontal || product.arte_personalizacao || product.arte_impressao?.url || product.art_url || product.arte_url),
      m1:text(product.mockup_1 || product.url_imagem || product.imagem || product.imagens?.[0]),
      m2:text(product.mockup_2 || product.imagens?.[1]),
      m3:text(product.mockup_3 || product.imagens?.[2])
    };
  }
  async function waitFinalProduct(payload, fetcher){
    const id = text(payload?.request_id);
    if (!id) return null;
    const base = text(payload.firebase_url || FALLBACK_FIREBASE).replace(/\/+$/,'');
    const node = text(payload.products_node || 'produtos').replace(/^\/+|\/+$/g,'').replace(/\.json$/i,'') || 'produtos';
    const deadline = Date.now() + FINAL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const response = await fetcher(`${base}/${node}/${encodeURIComponent(id)}.json?_=${Date.now()}`, { cache:'no-store', headers:{ Accept:'application/json' } });
        if (response.ok) {
          const urls = urlsFromProduct(await response.json().catch(() => ({})) || {});
          if ([urls.art,urls.m1,urls.m2,urls.m3].every(isUrl)) {
            return { ok:true, action:'finalize_mug_product', request_id:id, product_saved:true, firebase_key:id, arte_horizontal_url:urls.art, mockup_1_url:urls.m1, mockup_2_url:urls.m2, mockup_3_url:urls.m3, async_recovered:true, client_contract:BUILD };
          }
        }
      } catch (error) { console.warn('[Caneca10 V6] aguardando Firebase:', error); }
      await sleep(POLL_MS);
    }
    return null;
  }
  function jsonResponse(body,status=200){ return new Response(JSON.stringify(body), { status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'} }); }
  if (window.__daCeneca10MakeGuard === BUILD) return;
  window.__daCeneca10MakeGuard = BUILD;
  const previousFetch = window.fetch.bind(window);
  window.fetch = async function ceneca10MakeFetch(input, init){
    const url = typeof input === 'string' ? input : text(input?.url);
    if (url !== TARGET) return previousFetch(input, init);
    const normalized = normalizeRequest(init || {});
    const payload = payloadFrom(normalized);
    const response = await previousFetch(input, normalized);
    const raw = await response.clone().text();
    if (raw) { try { JSON.parse(raw); return response; } catch {} }
    if (response.ok && /^accepted\.?$/i.test(text(raw)) && payload?.action === 'finalize_mug_product') {
      console.info('[Caneca10 V6] Make respondeu Accepted; aguardando os 4 arquivos no Firebase.', payload.request_id);
      const recovered = await waitFinalProduct(payload, previousFetch);
      if (recovered) return jsonResponse(recovered,200);
      return jsonResponse({ok:false,error:'A caneca continua sendo finalizada. Atualize o histórico em alguns instantes.',accepted:true,request_id:payload.request_id,client_contract:BUILD},504);
    }
    const status = response.status || 502;
    const hint = cleanSnippet(raw);
    return jsonResponse({ ok:false, error:hint ? `Automação Make falhou (HTTP ${status}): ${hint}` : `Automação Make falhou antes de devolver JSON (HTTP ${status}).`, upstream_status:status, client_contract:BUILD }, response.ok ? 502 : status);
  };
})();
