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

  function text(value){
    return String(value == null ? '' : value).trim();
  }

  function numberValue(value){
    if(typeof value === 'number' && Number.isFinite(value)) return value;
    let source = String(value == null ? '' : value).trim().replace(/[^\d,.-]/g, '');
    if(!source) return 0;
    const comma = source.lastIndexOf(',');
    const dot = source.lastIndexOf('.');
    if(comma > -1 && dot > -1){
      source = comma > dot ? source.replace(/\./g, '').replace(',', '.') : source.replace(/,/g, '');
    }else if(comma > -1){
      source = source.replace(/\./g, '').replace(',', '.');
    }
    const parsed = Number(source);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function money(value){
    return Math.round(Math.max(0, numberValue(value)) * 100) / 100;
  }

  function activeProduct(product){
    const situation = text(product && (product.situacao != null ? product.situacao : product.status != null ? product.status : 'A')).toUpperCase();
    return !['I','INATIVO','INACTIVE','0','FALSE','EXCLUIDO','EXCLUÍDO'].includes(situation) && product?.ativo !== false && product?.visivel !== false;
  }

  function compactProduct(key, product){
    product = product && typeof product === 'object' ? product : {};
    const item = {
      firebaseKey: key,
      id: text(product.id || key),
      codigo: text(product.codigo || product.sku || product.id || key),
      nome: text(product.nome || product.name || product.titulo),
      categoria: text(product.categoria || product.category),
      subcategoria: text(product.subcategoria),
      subsubcategoria: text(product.subsubcategoria),
      marca: text(product.marca),
      embalagem: text(product.embalagem),
      preco: money(product.preco != null ? product.preco : product.price != null ? product.price : product.valor),
      preco_oferta: money(product.preco_oferta != null ? product.preco_oferta : product.precoOferta),
      estoque: Math.max(0, Math.floor(numberValue(product.estoque))),
      situacao: activeProduct(product) ? 'A' : 'I',
      url_imagem: text(product.url_imagem || product.imagem_url || product.imagem || product.image || product.img || product.foto || product.foto_url || product.imagem_path),
      descricao_curta: text(product.descricao_curta || product.descricao).slice(0, 180),
      validade: text(product.validade || product.data_validade),
      validade_oferta: text(product.validade_oferta || product.validadeOferta),
      gtin: text(product.gtin || product.ean)
    };
    return Object.fromEntries(Object.entries(item).filter(function(entry){
      const value = entry[1];
      return value !== '' && value !== null && value !== undefined;
    }));
  }

  function compactCatalog(products){
    if(!products || typeof products !== 'object' || Array.isArray(products)) throw new Error('Firebase retornou o catálogo em formato inválido');
    return Object.fromEntries(Object.entries(products)
      .filter(function(entry){ return entry[1] && typeof entry[1] === 'object' && !Array.isArray(entry[1]); })
      .map(function(entry){ return [entry[0], compactProduct(entry[0], entry[1])]; }));
  }

  function utf8ToBase64(value){
    const bytes = new TextEncoder().encode(String(value));
    let binary = '';
    const chunk = 0x8000;
    for(let index = 0; index < bytes.length; index += chunk){
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
  }

  function base64ToUtf8(value){
    const binary = atob(String(value || '').replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, function(character){ return character.charCodeAt(0); });
    return new TextDecoder('utf-8').decode(bytes);
  }

  function githubApiPath(path){
    return String(path || '').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
  }

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

  async function loadOfficialFirebaseProducts(){
    const settings = bridge.state.settings || {};
    const firebaseBase = String(settings.firebaseUrl || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').trim().replace(/\/+$/, '');
    const productsNode = String(settings.produtosNode || 'produtos').trim().replace(/^\/+|\/+$/g, '');
    const response = await originalFetch(`${firebaseBase}/${productsNode}.json?_catalog=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if(!response.ok) throw new Error(`Firebase ${response.status}`);
    return response.json();
  }

  async function readGithubContent(owner, repo, branch, path, token){
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${githubApiPath(path)}?ref=${encodeURIComponent(branch)}&_=${Date.now()}`;
    const response = await originalFetch(url, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
    });
    if(response.status === 404) return null;
    if(!response.ok) throw new Error(`GitHub GET ${path}: ${response.status}`);
    return response.json();
  }

  async function existingGithubText(file, token){
    if(file && file.content){
      try{ return base64ToUtf8(file.content); }catch(error){}
    }
    if(file && file.download_url){
      try{
        const response = await originalFetch(`${file.download_url}${file.download_url.includes('?') ? '&' : '?'}_=${Date.now()}`, { cache: 'no-store' });
        if(response.ok) return response.text();
      }catch(error){}
    }
    return '';
  }

  async function publishHomeCatalog(token, owner, repo, branch){
    const settings = bridge.state.settings || {};
    const path = String(settings.githubProdutosHomePath || 'site/produtos-home.json').trim() || 'site/produtos-home.json';
    const firebaseProducts = await loadOfficialFirebaseProducts();
    const catalog = compactCatalog(firebaseProducts);
    const contentText = `${JSON.stringify(catalog, null, 2)}\n`;
    const contentBase64 = utf8ToBase64(contentText);
    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${githubApiPath(path)}`;
    let lastError = '';

    for(let attempt = 1; attempt <= 5; attempt += 1){
      const current = await readGithubContent(owner, repo, branch, path, token);
      const currentText = await existingGithubText(current, token);
      if(currentText && currentText.replace(/\r\n/g, '\n').trimEnd() === contentText.replace(/\r\n/g, '\n').trimEnd()){
        return { changed: false, count: Object.keys(catalog).length, path: path };
      }

      const body = {
        message: 'Sincroniza produtos-home diretamente do Firebase após salvamento no admin',
        branch: branch,
        content: contentBase64
      };
      if(current && current.sha) body.sha = current.sha;

      const response = await originalFetch(apiUrl, {
        method: 'PUT',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if(response.ok){
        return { changed: true, count: Object.keys(catalog).length, path: path };
      }

      lastError = await response.text().catch(function(){ return ''; });
      if(![409, 422].includes(response.status)){
        throw new Error(`GitHub PUT ${path}: ${response.status}${lastError ? ` ${lastError.slice(0, 180)}` : ''}`);
      }
      await new Promise(function(resolve){ window.setTimeout(resolve, attempt * 300); });
    }

    throw new Error(`Conflito persistente ao publicar ${path}${lastError ? `: ${lastError.slice(0, 180)}` : ''}`);
  }

  async function dispatchFullCatalogSync(token, owner, repo){
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
      const detail = await response.text().catch(function(){ return ''; });
      throw new Error(`GitHub dispatch ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
    }
    return true;
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
      const branch = String(settings.githubBranch || 'main').trim() || 'main';

      if(!token){
        throw new Error('token do GitHub não configurado; a rotina agendada continuará como contingência');
      }

      let homeResult = null;
      let homeError = null;
      let dispatchError = null;

      try{
        homeResult = await publishHomeCatalog(token, owner, repo, branch);
      }catch(error){
        homeError = error;
        console.error('Falha ao publicar produtos-home diretamente:', error);
      }

      try{
        await dispatchFullCatalogSync(token, owner, repo);
      }catch(error){
        dispatchError = error;
        console.warn('Falha ao solicitar a sincronização completa pelo workflow:', error);
      }

      if(homeResult){
        const action = homeResult.changed ? 'publicado' : 'já estava atualizado';
        const extra = dispatchError ? ' O catálogo completo seguirá pela rotina agendada.' : ' Catálogo completo solicitado.';
        bridge.setStatus && bridge.setStatus(`Produto salvo. ${homeResult.path} ${action} com ${homeResult.count} produtos.${extra}`, dispatchError ? 'warn' : 'ok');
      }else if(!dispatchError){
        bridge.setStatus && bridge.setStatus(`Produto salvo. Sincronização dos catálogos solicitada.${homeError ? ` Publicação direta não concluída: ${homeError.message || homeError}` : ''}`, 'warn');
      }else{
        throw new Error([homeError && (homeError.message || homeError), dispatchError && (dispatchError.message || dispatchError)].filter(Boolean).join(' | '));
      }
    }catch(error){
      console.warn('Produto salvo no Firebase, mas os catálogos derivados ainda não foram atualizados:', error);
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
        bridge.setStatus && bridge.setStatus('Imagem e produto salvos no Firebase. Atualizando o catálogo do site...', 'ok');
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
