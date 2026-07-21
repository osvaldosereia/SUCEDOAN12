(function(){
  'use strict';

  if(window.__DA_CATALOG_SYNC_ADMIN__) return;
  window.__DA_CATALOG_SYNC_ADMIN__ = true;

  const bridge = window.__DA_NFE_BRIDGE__;
  if(!bridge || !bridge.state) return;

  const originalFetch = window.fetch.bind(window);
  const imageWatchers = new Map();
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

  function productImage(product){
    return String(product && (product.url_imagem || product.imagem_url || product.imagem) || '').trim();
  }

  function watchManualImageUpload(key, beforeImage, beforeGeneratedAt){
    key = String(key || '').trim();
    if(!key || typeof bridge.productByKey !== 'function' || typeof bridge.syncProductsToFirebase !== 'function') return;

    const previous = imageWatchers.get(key);
    if(previous) window.clearInterval(previous);

    let checks = 0;
    const watcher = window.setInterval(async function(){
      checks += 1;
      const product = bridge.productByKey(key);
      if(!product || checks > 120){
        window.clearInterval(watcher);
        imageWatchers.delete(key);
        return;
      }

      const imageChanged = productImage(product) !== beforeImage || String(product.imagem_gerada_em || '') !== beforeGeneratedAt;
      if(!imageChanged) return;

      const dirty = bridge.state.dirtyProductKeys && bridge.state.dirtyProductKeys.has(key);
      if(!dirty){
        window.clearInterval(watcher);
        imageWatchers.delete(key);
        return;
      }

      window.clearInterval(watcher);
      imageWatchers.delete(key);

      if(product.__nfe_draft) return;

      try{
        bridge.setStatus && bridge.setStatus('Imagem enviada. Salvando o produto no Firebase...', 'warn');
        const result = await bridge.syncProductsToFirebase([key]);
        if(result && result.conflicts && result.conflicts.length){
          throw new Error(`conflito ao salvar: ${result.conflicts.join(', ')}`);
        }
        bridge.renderProducts && bridge.renderProducts();
        bridge.renderSummary && bridge.renderSummary();
        bridge.setStatus && bridge.setStatus('Imagem e produto salvos no Firebase. Atualização do site solicitada.', 'ok');
      }catch(error){
        console.error('Falha ao salvar automaticamente o produto depois do upload da imagem:', error);
        bridge.setStatus && bridge.setStatus(`Imagem enviada ao GitHub, mas o produto ainda precisa ser salvo: ${error.message || error}`, 'err');
      }
    }, 250);

    imageWatchers.set(key, watcher);
  }

  window.fetch = async function(input, init){
    const shouldSync = productFirebaseWrite(input, init);
    const response = await originalFetch(input, init);
    if(shouldSync && response.ok) scheduleCatalogSync();
    return response;
  };

  document.addEventListener('click', function(event){
    const button = event.target && event.target.closest && event.target.closest('[data-action]');
    if(!button) return;
    const action = button.dataset.action;
    if(action !== 'upload-selected-photo-github' && action !== 'workbench-upload-photo') return;

    const key = String(button.dataset.key || bridge.state.editingProductKey || '').trim();
    const product = bridge.productByKey && bridge.productByKey(key);
    if(!product) return;
    watchManualImageUpload(key, productImage(product), String(product.imagem_gerada_em || ''));
  }, true);

  window.addEventListener('online', function(){
    if(syncPending) scheduleCatalogSync();
  });
})();
