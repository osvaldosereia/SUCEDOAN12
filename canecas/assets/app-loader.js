(() => {
  'use strict';
  const parts = ['app-part-1.jsfrag','app-part-2.jsfrag','app-part-3.jsfrag'];
  Promise.all(parts.map(name => fetch(new URL(name, document.currentScript.src), {cache:'no-store'}).then(r => {
    if (!r.ok) throw new Error(`Falha ao carregar ${name}: HTTP ${r.status}`);
    return r.text();
  })))
    .then(chunks => {
      const source = chunks.join('');
      const url = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
      return import(url).finally(() => URL.revokeObjectURL(url));
    })
    .catch(error => {
      console.error(error);
      document.body.innerHTML = `<main style="font-family:system-ui;padding:24px"><h1>Falha ao carregar a aplicação</h1><p>${error.message}</p></main>`;
    });
})();
