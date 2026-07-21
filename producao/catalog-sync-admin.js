(function(){
  'use strict';

  if(window.__DA_CATALOG_SYNC_ADMIN__) return;
  window.__DA_CATALOG_SYNC_ADMIN__ = true;

  const bridge = window.__DA_NFE_BRIDGE__;
  if(!bridge || !bridge.state) return;

  const originalFetch = window.fetch.bind(window);
  let syncTimer = 0;
  let syncing = false;
  let syncPending = false;

  function productFirebaseWrite(input, init){
    const requestMethod = input && typeof input === 'object' && input.method ? input.method : '';
    const method = String((init && init.method) || requestMethod || 'GET').toUpperCase();
    if(!['POST','PUT','PATCH','DELETE'].includes(method)) return false;

    const requestUrl = typeof input === 'string' ? input : String((input && input.url) || '');
    const settings = bridge.state.settings || {};
    const firebaseBase = String(settings.firebaseUrl || '').trim().replace(/\/+$/, '');
    const productsNode = String(settings.produtosNode || 'produtos').trim().replace(/^\/+|\/+$/g, '');
    if(!firebaseBase || !productsNode) return false;

    const productsBase = `${firebaseBase}/${productsNode}`;
    return requestUrl.startsWith(productsBase) && /\.json(?:\?|$)/i.test(requestUrl);
  }

  function scheduleCatalogSync(){
    syncPending = true;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(requestCatalogSync, 1200);
  }

  async function requestCatalogSync(){
    if(syncing){
      syncPending = true;
      return;
    }

    syncPending = false;
    syncing = true;

    try{
      const settings = bridge.state.settings || {};
      const token = String(settings.githubToken || '').trim();
      const owner = String(settings.githubOwner || 'osvaldosereia').trim();
      const repo = String(settings.githubRepo || 'SUCEDOAN12').trim();

      if(!token){
        throw new Error('token do GitHub não configurado; a rotina agendada continuará como contingência');
      }

      const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/dispatches`;
      const response = await originalFetch(url, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event_type: 'sincronizar_produtos_home',
          client_payload: {
            origem: 'admin-producao',
            solicitado_em: new Date().toISOString()
          }
        })
      });

      if(!response.ok){
        const detail = await response.text().catch(() => '');
        throw new Error(`GitHub ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
      }

      bridge.setStatus && bridge.setStatus('Produto salvo. Atualização dos catálogos do site solicitada.', 'ok');
    }catch(error){
      console.warn('Produto salvo no Firebase, mas a sincronização imediata dos catálogos não foi solicitada:', error);
      bridge.setStatus && bridge.setStatus(`Produto salvo no Firebase; catálogos aguardando a sincronização automática. ${error.message || error}`, 'warn');
    }finally{
      syncing = false;
      if(syncPending) scheduleCatalogSync();
    }
  }

  window.fetch = async function(input, init){
    const shouldSync = productFirebaseWrite(input, init);
    const response = await originalFetch(input, init);
    if(shouldSync && response.ok) scheduleCatalogSync();
    return response;
  };

  window.addEventListener('online', function(){
    if(syncPending) scheduleCatalogSync();
  });
})();
