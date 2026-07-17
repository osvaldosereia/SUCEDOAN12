import fs from 'node:fs/promises';

const FILE = 'index-pagespeed-test.html';
let html = await fs.readFile(FILE, 'utf8');

const css = `.da-mobile-see-all{display:none}@media(max-width:767px){.da-mobile-see-all{display:flex!important;width:100%;min-height:46px;margin:14px 0 4px;padding:12px 16px;align-items:center;justify-content:center;border:1px solid currentColor;border-radius:12px;font-weight:800;text-align:center;text-decoration:none;background:#fff;box-sizing:border-box}.da-home-section>.da-mobile-see-all:last-child{margin-bottom:0}}`;

if (!html.includes('.da-mobile-see-all{display:none}')) {
  html = html.replace('</style>', `${css}\n</style>`);
}

const script = `<script>
(function(){
  function addMobileSeeAllButtons(){
    const root=document.querySelector('.da-home-profit');
    if(!root) return;
    const selectors=[
      '.da-home-section-head a[href]',
      '.section-head a[href]',
      '.shelf-head a[href]',
      'a.section-link[href]'
    ];
    root.querySelectorAll(selectors.join(',')).forEach(function(action){
      const section=action.closest('section,.da-home-section');
      if(!section || section.querySelector(':scope > .da-mobile-see-all')) return;
      const href=action.getAttribute('href');
      if(!href || href==='#' || /^javascript:/i.test(href)) return;
      const button=document.createElement('a');
      button.className='da-mobile-see-all';
      button.href=href;
      button.textContent='Ver Todos os Produtos';
      button.setAttribute('aria-label','Ver todos os produtos desta seção');
      section.appendChild(button);
    });
  }
  const observer=new MutationObserver(addMobileSeeAllButtons);
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',addMobileSeeAllButtons,{once:true});
  window.setTimeout(addMobileSeeAllButtons,0);
  window.setTimeout(addMobileSeeAllButtons,1800);
  window.setTimeout(addMobileSeeAllButtons,3600);
})();
</script>`;

if (!html.includes("button.className='da-mobile-see-all'")) {
  html = html.replace('</body>', `${script}\n</body>`);
}

await fs.writeFile(FILE, html, 'utf8');
console.log('Botões mobile "Ver Todos os Produtos" adicionados à página de teste.');
