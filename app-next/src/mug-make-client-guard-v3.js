const BUILD = '20260826-site-mug-make-client-guard-v3';
const TARGET = 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
const text = value => String(value ?? '').trim();
const cleanSnippet = raw => text(raw).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,180);
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
function install(){
  if (window.__daPublicMugMakeGuard === BUILD) return;
  window.__daPublicMugMakeGuard = BUILD;
  const previousFetch = window.fetch.bind(window);
  window.fetch = async function publicMugMakeFetch(input, init){
    const url = typeof input === 'string' ? input : text(input?.url);
    if (url !== TARGET) return previousFetch(input, init);
    const response = await previousFetch(input, normalizeRequest(init || {}));
    const raw = await response.clone().text();
    if (raw) { try { JSON.parse(raw); return response; } catch {} }
    const status = response.status || 502;
    const hint = cleanSnippet(raw);
    return new Response(JSON.stringify({
      ok:false,
      error: hint ? `Automação Make falhou (HTTP ${status}): ${hint}` : `Automação Make falhou antes de devolver JSON (HTTP ${status}).`,
      upstream_status:status,
      client_contract:BUILD
    }), { status:response.ok ? 502 : status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'} });
  };
}
install();
export { install, BUILD, TARGET };
