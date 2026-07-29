(() => {
  'use strict';
  const scriptUrl = document.currentScript.src;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('production.css?v=20260729-3', scriptUrl).href;
  document.head.appendChild(css);

  async function start(){
    const files = ['app.bundle.1.b64','app.bundle.2.b64'];
    const encoded = (await Promise.all(files.map(async name => {
      const response = await fetch(new URL(`${name}?v=20260729-3`, scriptUrl), {cache:'no-store'});
      if(!response.ok) throw new Error(`Falha ao carregar ${name}: HTTP ${response.status}`);
      return (await response.text()).trim();
    }))).join('');
    const compressed = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    if(typeof DecompressionStream !== 'function') throw new Error('Atualize o navegador para abrir esta aplicação.');
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
    const source = await new Response(stream).text();
    const url = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
    try{ await import(url); } finally { URL.revokeObjectURL(url); }
  }

  start().catch(error => {
    console.error(error);
    document.body.innerHTML = `<main style="font-family:system-ui;padding:24px"><h1>Falha ao carregar a aplicação</h1><p>${error.message}</p></main>`;
  });
})();
