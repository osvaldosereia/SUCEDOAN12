import fs from 'node:fs/promises';

const SOURCE = 'index.html';
const OUTPUT = 'index-pagespeed-test.html';
const TEST_VERSION = '2026-07-17-pagespeed-test-v5';

let html = await fs.readFile(SOURCE, 'utf8');
const original = html;

function replaceRequired(pattern, replacement, label) {
  const before = html;
  html = html.replace(pattern, replacement);
  if (html === before) throw new Error(`Transformação não encontrada: ${label}`);
}

html = html.replace(
  /<meta name="da-build-version" content="[^"]+">/,
  `<meta name="da-build-version" content="${TEST_VERSION}">`
);
html = html.replace(
  /<meta name="robots" content="[^"]+">/,
  '<meta name="robots" content="noindex, nofollow">'
);
html = html.replace(
  /<title>(.*?)<\/title>/,
  '<title>$1 · Teste PageSpeed</title>'
);

html = html.replace(/\s*<meta http-equiv="Cache-Control"[^>]*>/gi, '');
html = html.replace(/\s*<meta http-equiv="Pragma"[^>]*>/gi, '');
html = html.replace(/\s*<meta http-equiv="Expires"[^>]*>/gi, '');

replaceRequired(
  /\s*<script>\s*\(function\(\)\{\s*'use strict';\s*const BUILD = '2026-07-16-mobile-sales-v4';[\s\S]*?\}\)\(\);\s*<\/script>/,
  `\n  <script>\n  (function(){\n    'use strict';\n    const BUILD = '${TEST_VERSION}';\n    window.__DA_BUILD_VERSION__ = BUILD;\n    window.__DA_PAGESPEED_TEST__ = true;\n    document.documentElement.classList.add('da-pagespeed-booting');\n    window.__DA_BOOT_REVEAL_TIMER__ = window.setTimeout(function(){\n      document.documentElement.classList.remove('da-pagespeed-booting');\n    }, 8000);\n  })();\n  </script>`,
  'bootstrap antigo de cache/redirecionamento'
);

html = html.replaceAll('2026-07-16-mobile-sales-v4', TEST_VERSION);

html = html.replace(
  /cache: options && options\.cache \? options\.cache : 'no-store'/g,
  "cache: options && options.cache ? options.cache : 'default'"
);
html = html.replaceAll("{ cache: 'no-cache' }", "{ cache: 'default' }");
html = html.replaceAll("cache: 'no-store'", "cache: 'default'");
html = html.replace(
  /headers:\s*\{\s*Accept: 'application\/json',\s*'Cache-Control': 'no-cache, no-store, max-age=0',\s*Pragma: 'no-cache'\s*\}/g,
  "headers: { Accept: 'application/json' }"
);

replaceRequired(
  /\s*const redirectedToLatest = await ensureLatestDeployment\(\);\s*if \(redirectedToLatest\) return;\s*try \{ sessionStorage\.removeItem\('da_version_reload_attempts_v1'\); \} catch\(e\) \{\}/,
  `\n      try { sessionStorage.removeItem('da_version_reload_attempts_v1'); } catch(e) {}`,
  'consulta bloqueante de versão'
);

replaceRequired(
  /\s*startDeploymentVersionWatch\(\);/,
  `\n      // Monitor da versão oficial desativado na página paralela.`,
  'monitor periódico de versão'
);

html = html.replace(
  /\s*await purgeBrowserRuntimeCaches\(\);\s*if \(!shouldReload\) return true;/,
  `\n        if (!shouldReload) return true;`
);

html = html.replace(
  /<img loading="lazy" decoding="async" src="\$\{escapeHtml\(p\.img\)\}"/g,
  '<img loading="lazy" decoding="async" width="300" height="300" src="${escapeHtml(p.img)}"'
);
html = html.replace(
  /<img loading="lazy" decoding="async" src="\$\{escapeHtml\(cesta\.imagem\)\}"/g,
  '<img loading="lazy" decoding="async" width="300" height="300" src="${escapeHtml(cesta.imagem)}"'
);
html = html.replace(
  /<img loading="lazy" decoding="async" src="\$\{escapeHtml\(kit\.imagem\)\}"/g,
  '<img loading="lazy" decoding="async" width="300" height="300" src="${escapeHtml(kit.imagem)}"'
);
html = html.replace(
  /<img class="\$\{className \|\| ''\}" loading="lazy" decoding="async"/g,
  '<img class="${className || \'\'}" loading="lazy" decoding="async" width="300" height="300"'
);

replaceRequired(
  /renderHome=function\(\)\{[\s\S]*?setActiveNav\('home'\);\s*\};/,
  `renderHome=function(){
        const offers=getTopOffers(12);
        const kits=getActiveKits();
        app.innerHTML=\`<div class="container home-clean da-home-modular da-home-funnel da-home-profit">
          <h1 class="sr-only">Dona Antônia - Supermercado e Cestas</h1>
          \${homeQuickLinksHtml()}
          \${bannerSlotHtml('home.hero',{carousel:true,kind:'hero',limit:6,hideHead:true,label:'Destaques da Dona Antônia'})}
          <div data-home-personalization-slot="buy-again"></div>
          \${daHomeOfferShelfHtml(offers)}
          \${daHomePurchaseJourneyHtml()}
          \${bannerSlotHtml('home.compra-mes.topo',{kind:'section',limit:4,hideHead:true,label:'Destaques para a compra do mês'})}
          \${daHomeBasketShelfHtml(state.cestas)}
          \${daHomeKitShelfHtml(kits)}
          <div data-home-secondary-slot aria-busy="true">\${daProgressiveLoadingHtml('Carregando sugestões para completar sua compra…')}</div>
          <div class="da-home-bottom-safe" aria-hidden="true"></div>
        </div>\`;
        setupBannerCarousels();
        daSetupHomeSecondary();
        updateOfferCountdowns();
        updateMeta('Dona Antônia - Supermercado e Cestas','Supermercado online, cestas básicas, ofertas e entrega em Cuiabá e Várzea Grande.','/');
        setActiveNav('home');
      };`,
  'nova ordem comercial da home'
);

replaceRequired(
  /function daRenderHomeSecondary\(slot\)\{[\s\S]*?daSetupHomeTail\(\);\s*\}/,
  `function daRenderHomeSecondary(slot){
        if(!slot || !slot.isConnected || slot.dataset.loaded==='true') return;
        slot.dataset.loaded='true';
        slot.removeAttribute('aria-busy');
        const limpeza=productsByRoutine('limpeza',80);
        const higiene=productsByRoutine('higiene',120);
        const reminders=daHomeReminderProducts().slice(0,6);
        slot.innerHTML=\`
          \${daHomeCompactShelfHtml('Não esqueça destes itens','Produtos que costumam faltar justamente na hora de fechar a compra.',reminders,'#/rotina/compra-mes','reminder','Continuar comprando')}
          \${daHomeCollectionSectionHtml('limpeza','Limpeza da casa','Escolha rapidamente o tipo de limpeza que precisa.',limpeza,'#/rotina/limpeza','clean')}
          \${bannerSlotHtml('home.higiene.topo',{kind:'section',limit:4,hideHead:true,label:'Destaques de cuidados pessoais'})}
          \${daHomeCollectionSectionHtml('higiene','Higiene da família','Cuidados essenciais organizados por necessidade.',higiene,'#/rotina/higiene','care')}
          <div data-home-tail-slot aria-busy="true">\${daProgressiveLoadingHtml('Carregando mais formas de comprar…')}</div>\`;
        setupBannerCarousels();
        updateOfferCountdowns();
        syncVisibleCards();
        updateFavoritesUI();
        daSetupHomeTail();
      }`,
  'seções secundárias compactas'
);

replaceRequired(
  /function daRenderHomeTail\(slot\)\{[\s\S]*?updateFavoritesUI\(\);\s*\}/,
  `function daRenderHomeTail(slot){
        if(!slot || !slot.isConnected || slot.dataset.loaded==='true') return;
        slot.dataset.loaded='true';
        slot.removeAttribute('aria-busy');
        const bargains=daHomeBargainProducts().slice(0,8);
        const cafe=productsByRoutine('cafe',100);
        slot.innerHTML=\`
          \${daHomeCollectionSectionHtml('cafe','Café da manhã','Café, biscoitos e acompanhamentos para começar o dia.',cafe,'#/rotina/cafe','coffee')}
          \${daHomeCompactShelfHtml('Complete seu carrinho por até R$ 3','Itens baratos e úteis para aproveitar melhor o pedido.',bargains,'#/categorias','bargain','Explorar categorias')}
          \${daHomeHereTemHtml()}
          \${brandStripHtml()}
          \${categoryButtonsHtml()}\`;
        updateOfferCountdowns();
        syncVisibleCards();
        updateFavoritesUI();
      }`,
  'cauda comercial reduzida'
);

html = html.replace(
  '</style>',
  `.da-pagespeed-booting #app{visibility:hidden!important}.da-pagespeed-booting .bottom-nav{visibility:hidden!important}.da-home-profit .da-home-section{margin-top:22px}.da-home-profit .da-home-journey-grid{gap:10px}.da-home-profit .da-home-section-head p{max-width:62ch}.da-home-profit [data-banner-position="home.hero"] .banner-card,.da-home-profit .banner-card{aspect-ratio:4/5!important}.da-home-profit .banner-card img{width:100%!important;height:100%!important;object-fit:cover!important}.da-home-bottom-safe{display:block;width:100%;height:96px;flex:0 0 96px}.da-home-profit [data-home-section="featured"],.da-home-profit .products-featured,.da-home-profit .featured-products{display:none!important}@media(max-width:767px){#app{padding-bottom:calc(132px + env(safe-area-inset-bottom))!important}.da-home-profit{padding-bottom:calc(40px + env(safe-area-inset-bottom))!important}.da-home-bottom-safe{height:132px;flex-basis:132px}.da-home-profit .da-home-section{margin-top:18px}.da-home-profit .da-home-journey-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.da-home-profit [data-banner-position="home.hero"]{margin-top:10px}}@media (prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}.header{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}}\n</style>`
);

html = html.replace(
  '</body>',
  `<script>
  (function(){
    function normalizeTitle(value){
      return String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim().toLowerCase();
    }
    function removeFeaturedProductSections(){
      const root=document.querySelector('.da-home-profit');
      if(!root) return;
      root.querySelectorAll('section,.da-home-section').forEach(function(section){
        const heading=section.querySelector('h2,h3,.section-title,.da-home-section-head strong');
        if(heading && normalizeTitle(heading.textContent)==='produtos em destaque') section.remove();
      });
    }
    const observer=new MutationObserver(removeFeaturedProductSections);
    observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('DOMContentLoaded',removeFeaturedProductSections,{once:true});
    window.setTimeout(removeFeaturedProductSections,0);
    window.setTimeout(removeFeaturedProductSections,2000);
  })();
  </script>
<!-- DA_PAGESPEED_TEST: versão v5 sem Produtos em destaque e com área segura acima da barra inferior. -->
</body>`
);

replaceRequired(
  /(state\.isReady\s*=\s*true;[\s\S]*?handleRoute\(\);\s*updateCartUI\(\);)/,
  `$1\n          if (window.__DA_BOOT_REVEAL_TIMER__) clearTimeout(window.__DA_BOOT_REVEAL_TIMER__);\n          requestAnimationFrame(() => {\n            document.documentElement.classList.remove('da-pagespeed-booting');\n          });`,
  'revelação única após primeira renderização completa'
);

if (html === original) throw new Error('Nenhuma transformação foi aplicada.');
await fs.writeFile(OUTPUT, html, 'utf8');
console.log(`Gerado ${OUTPUT}: ${Buffer.byteLength(html)} bytes`);
