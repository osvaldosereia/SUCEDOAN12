(() => {
  'use strict';
  const DELETED_KEY = 'canecasCatalogoArtesApagadasV1';
  let scanTimer = null;
  function $(selector, parent=document){ return parent.querySelector(selector); }
  function $$(selector, parent=document){ return [...parent.querySelectorAll(selector)]; }
  function notify(message, type='ok'){
    const area = $('#toastArea');
    if(area){ const el=document.createElement('div'); el.className=`toast ${type}`; el.textContent=message; area.appendChild(el); setTimeout(()=>el.remove(),4300); }
    else console.log(message);
  }
  function normalizeUrl(value=''){
    try{ const url=new URL(value,location.href); url.search=''; url.hash=''; return decodeURIComponent(url.href).toLowerCase(); }
    catch{ return String(value).split(/[?#]/)[0].toLowerCase(); }
  }
  function getDeletedSet(){ try{return new Set(JSON.parse(localStorage.getItem(DELETED_KEY)||'[]'));}catch{return new Set();} }
  function saveDeletedSet(set){ localStorage.setItem(DELETED_KEY,JSON.stringify([...set].slice(-2000))); }
  function injectDeleteStyle(){
    if(document.querySelector('#catalogDeleteStyle')) return;
    const style=document.createElement('style'); style.id='catalogDeleteStyle';
    style.textContent='.archive-delete{background:#fff0ef!important;color:var(--danger)!important;border:1px solid #f2c8c5!important}.archive-actions.has-delete{grid-template-columns:1fr 1fr auto}@media(max-width:680px){.archive-actions.has-delete{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }
  function allStrings(value, result=[], seen=new Set()){
    if(value == null) return result;
    if(typeof value === 'string'){ result.push(value); return result; }
    if(typeof value !== 'object' || seen.has(value)) return result;
    seen.add(value);
    if(Array.isArray(value)) value.forEach(item => allStrings(item, result, seen));
    else Object.values(value).forEach(item => allStrings(item, result, seen));
    return result;
  }

  function recordMatches(record, src, title){
    const strings = allStrings(record);
    const normalizedSrc = normalizeUrl(src);
    const filename = normalizedSrc.split('/').pop();
    const normalizedTitle = String(title || '').trim().toLocaleLowerCase('pt-BR');
    return strings.some(value => {
      const text = String(value);
      const normalized = normalizeUrl(text);
      if(normalizedSrc && (normalized === normalizedSrc || (filename && normalized.endsWith('/' + filename)))) return true;
      if(normalizedTitle && normalizedTitle.length > 5 && text.trim().toLocaleLowerCase('pt-BR') === normalizedTitle) return true;
      return false;
    });
  }

  async function cleanIndexedDB(src, title){
    const found = [];
    if(!window.indexedDB) return found;
    let dbInfos = [];
    try{
      dbInfos = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
    }catch{}
    const names = [...new Set(dbInfos.map(item => item.name).filter(Boolean))];
    for(const name of names){
      await new Promise(resolve => {
        const request = indexedDB.open(name);
        request.onerror = () => resolve();
        request.onsuccess = () => {
          const db = request.result;
          const stores = [...db.objectStoreNames];
          if(!stores.length){ db.close(); resolve(); return; }
          let pending = stores.length;
          const done = () => { if(--pending <= 0){ db.close(); resolve(); } };
          stores.forEach(storeName => {
            try{
              const transaction = db.transaction(storeName, 'readwrite');
              const store = transaction.objectStore(storeName);
              const cursorRequest = store.openCursor();
              cursorRequest.onerror = done;
              cursorRequest.onsuccess = event => {
                const cursor = event.target.result;
                if(!cursor) return;
                if(recordMatches(cursor.value, src, title)){
                  const strings = allStrings(cursor.value);
                  strings.filter(value => /canecas\/imagens\/artes-geradas\//i.test(value)).forEach(value => found.push(value));
                  cursor.delete();
                }
                cursor.continue();
              };
              transaction.oncomplete = done;
              transaction.onerror = done;
              transaction.onabort = done;
            }catch{ done(); }
          });
        };
      });
    }
    return [...new Set(found)];
  }

  function cleanLocalStorage(src, title){
    for(let i=0;i<localStorage.length;i++){
      const key = localStorage.key(i);
      if(!key || key === DELETED_KEY) continue;
      const raw = localStorage.getItem(key);
      if(!raw || (!raw.startsWith('[') && !raw.startsWith('{'))) continue;
      try{
        const data = JSON.parse(raw);
        let changed = false;
        const cleanse = value => {
          if(Array.isArray(value)){
            const filtered = value.filter(item => {
              if(recordMatches(item, src, title)){ changed = true; return false; }
              return true;
            }).map(cleanse);
            return filtered;
          }
          if(value && typeof value === 'object'){
            for(const property of Object.keys(value)) value[property] = cleanse(value[property]);
          }
          return value;
        };
        const cleaned = cleanse(data);
        if(changed) localStorage.setItem(key, JSON.stringify(cleaned));
      }catch{}
    }
  }

  function pathFromRawUrl(src){
    try{
      const url = new URL(src);
      if(url.hostname !== 'raw.githubusercontent.com') return null;
      const parts = url.pathname.split('/').filter(Boolean);
      if(parts.length < 4) return null;
      return {owner:parts[0], repo:parts[1], branch:parts[2], path:parts.slice(3).join('/')};
    }catch{ return null; }
  }

  function pathFromText(value){
    const match = String(value || '').match(/(?:^|\/)(canecas\/imagens\/artes-geradas\/[^?#"']+\.(?:png|jpe?g|webp))/i);
    return match ? match[1] : null;
  }

  async function deleteGithubFiles(src, extraValues=[]){
    const token = sessionStorage.getItem('canecasGithubToken') || '';
    if(!token) return 0;
    let settings = {};
    try{ settings = JSON.parse(localStorage.getItem('canecasStudioSettings') || '{}'); }catch{}
    const raw = pathFromRawUrl(src);
    const owner = raw?.owner || settings.owner || 'osvaldosereia';
    const repo = raw?.repo || settings.repo || 'SUCEDOAN12';
    const branch = raw?.branch || settings.branch || 'main';
    const paths = new Set();
    if(raw?.path) paths.add(raw.path);
    extraValues.forEach(value => {
      const path = pathFromText(value);
      if(path) paths.add(path);
    });
    let deleted = 0;
    for(const path of paths){
      try{
        const encodedPath = path.split('/').map(encodeURIComponent).join('/');
        const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`;
        const headers = {
          'Authorization': `Bearer ${token}`,
          'Accept':'application/vnd.github+json',
          'Content-Type':'application/json',
          'X-GitHub-Api-Version':'2022-11-28'
        };
        const getResponse = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, {headers});
        if(!getResponse.ok) continue;
        const file = await getResponse.json();
        const deleteResponse = await fetch(api, {
          method:'DELETE',
          headers,
          body:JSON.stringify({
            message:`canecas: apagar arte do catálogo ${path.split('/').pop()}`,
            sha:file.sha,
            branch
          })
        });
        if(deleteResponse.ok) deleted++;
      }catch{}
    }
    return deleted;
  }

  async function deleteArchiveCard(card){
    const image = $('img', card);
    const src = image?.currentSrc || image?.src || '';
    const title = $('.archive-item-title', card)?.textContent?.trim() || image?.alt || 'esta arte';
    if(!confirm(`Apagar “${title}” do catálogo de artes?\n\nA arte deixará de aparecer no banco de imagens.`)) return;
    const deleted = getDeletedSet();
    deleted.add(normalizeUrl(src) || `${title}|${Date.now()}`);
    saveDeletedSet(deleted);
    card.remove();
    cleanLocalStorage(src, title);
    const relatedValues = await cleanIndexedDB(src, title);
    const githubDeleted = await deleteGithubFiles(src, relatedValues);
    notify(githubDeleted ? 'Arte apagada do catálogo e do GitHub.' : 'Arte apagada do catálogo.', 'ok');
  }

  function scanArchive(){
    scanTimer = null;
    const deleted = getDeletedSet();
    $$('.archive-item').forEach(card => {
      const image = $('img', card);
      const src = image?.currentSrc || image?.src || '';
      if(src && deleted.has(normalizeUrl(src))){ card.remove(); return; }
      if(card.dataset.deleteEnhanced) return;
      card.dataset.deleteEnhanced = '1';
      let actions = $('.archive-actions', card);
      if(!actions){
        actions = document.createElement('div');
        actions.className = 'archive-actions';
        card.appendChild(actions);
      }
      actions.classList.add('has-delete');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn small danger archive-delete';
      button.textContent = '🗑 Apagar';
      button.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        deleteArchiveCard(card).catch(error => notify(`Não foi possível apagar: ${error.message}`, 'error'));
      };
      actions.appendChild(button);
    });
  }

  function scheduleArchiveScan(){
    if(scanTimer) return;
    scanTimer = setTimeout(scanArchive, 120);
  }

  function initDeleteEnhancement(){
    injectDeleteStyle();
    scheduleArchiveScan();
    const observer=new MutationObserver(scheduleArchiveScan);
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
  initDeleteEnhancement();
})();
