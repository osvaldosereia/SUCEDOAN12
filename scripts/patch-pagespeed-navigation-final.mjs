import fs from 'node:fs/promises';

const FILE = 'index-pagespeed-test.html';
let html = await fs.readFile(FILE, 'utf8');

const script = `<script>
(function(){
  const STORAGE_PREFIX='da-pagespeed-scroll-v1:';
  const app=document.getElementById('app');
  let restoreOnNextRoute=false;
  function routeKey(){ return location.pathname + location.search + (location.hash || '#/'); }
  function readScroll(){ return app ? app.scrollTop : window.scrollY; }
  function writeScroll(value){ if(app) app.scrollTop=value; else window.scrollTo(0,value); }
  function saveCurrentPosition(){ try{ sessionStorage.setItem(STORAGE_PREFIX + routeKey(), String(Math.max(0,readScroll()||0))); }catch(e){} }
  function restoreCurrentPosition(){
    let target=0;
    try{ target=Number(sessionStorage.getItem(STORAGE_PREFIX + routeKey())||0); }catch(e){}
    if(!Number.isFinite(target)||target<1) return;
    [0,80,180,350,650,1100].forEach(function(delay){ window.setTimeout(function(){ writeScroll(target); },delay); });
  }
  document.addEventListener('click',function(event){
    const link=event.target.closest('a[href]');
    if(!link) return;
    const href=link.getAttribute('href')||'';
    if(href.startsWith('#/')) saveCurrentPosition();
  },true);
  window.addEventListener('popstate',function(){
    restoreOnNextRoute=true;
    window.setTimeout(function(){ if(restoreOnNextRoute){ restoreOnNextRoute=false; restoreCurrentPosition(); } },0);
  });
  window.addEventListener('hashchange',function(){ if(!restoreOnNextRoute) return; restoreOnNextRoute=false; restoreCurrentPosition(); });
  window.addEventListener('pagehide',saveCurrentPosition);
})();
</script>`;

if (!html.includes("const STORAGE_PREFIX='da-pagespeed-scroll-v1:'")) html = html.replace('</body>', `${script}\n</body>`);
await fs.writeFile(FILE, html, 'utf8');
console.log('Restauração de rolagem adicionada à página de teste.');
