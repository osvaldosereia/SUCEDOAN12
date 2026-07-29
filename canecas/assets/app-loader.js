(() => {
  'use strict';
  const scriptUrl = document.currentScript.src;
  const version = '20260729-7';

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL(`production.css?v=${version}`, scriptUrl).href;
  document.head.appendChild(css);

  function applyDatabaseHotfix(source){
    source = source.replace(
      "indexedDB.open('canecasStudioA4',2)",
      "indexedDB.open('canecasStudioProducaoV1',1)"
    );

    source = source.replace(
      "async function dbPut(item){return new Promise((resolve,reject)=>{const tx=state.db.transaction('leftAds','readwrite');const r=tx.objectStore('leftAds').put(item);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}",
      "async function dbPut(item){if(!state.db)return false;return new Promise(resolve=>{try{const tx=state.db.transaction('leftAds','readwrite');const r=tx.objectStore('leftAds').put(item);r.onsuccess=()=>resolve(true);r.onerror=()=>resolve(false);tx.onabort=()=>resolve(false)}catch(e){resolve(false)}})}"
    );

    source = source.replace(
      "async function dbDelete(id){return new Promise((resolve,reject)=>{const tx=state.db.transaction('leftAds','readwrite');const r=tx.objectStore('leftAds').delete(id);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}",
      "async function dbDelete(id){if(!state.db)return false;return new Promise(resolve=>{try{const tx=state.db.transaction('leftAds','readwrite');const r=tx.objectStore('leftAds').delete(id);r.onsuccess=()=>resolve(true);r.onerror=()=>resolve(false);tx.onabort=()=>resolve(false)}catch(e){resolve(false)}})}"
    );

    source = source.replace(
      "`Tema: ${c.theme}. Público-alvo: ${c.audience}. Clima: ${c.mood}.`,",
      "`Tema: ${c.theme}. Clima: ${c.mood}.`,"
    );

    return source;
  }

  async function start(){
    const files = ['app.bundle.1.b64','app.bundle.2.b64'];
    const encoded = (await Promise.all(files.map(async name => {
      const response = await fetch(new URL(`${name}?v=${version}`, scriptUrl), {cache:'no-store'});
      if(!response.ok) throw new Error(`Falha ao carregar ${name}: HTTP ${response.status}`);
      return (await response.text()).trim();
    }))).join('');

    const compressed = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    if(typeof DecompressionStream !== 'function') throw new Error('Atualize o navegador para abrir esta aplicação.');
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
    let source = await new Response(stream).text();
    source = applyDatabaseHotfix(source);

    const url = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
    try{ await import(url); } finally { URL.revokeObjectURL(url); }
  }

  start().catch(error => {
    console.error(error);
    document.body.innerHTML = `<main style="font-family:system-ui;padding:24px"><h1>Falha ao carregar a aplicação</h1><p>${error.message}</p></main>`;
  });
})();
