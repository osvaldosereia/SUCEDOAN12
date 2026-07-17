import fs from 'node:fs/promises';

const SOURCE='index.html';
const OUTPUT='index-pagespeed-test.html';
const VERSION='2026-07-17-fast-home-test-v7';
let html=await fs.readFile(SOURCE,'utf8');

function required(pattern,replacement,label){
  const before=html;
  html=html.replace(pattern,replacement);
  if(html===before) throw new Error(`Não foi possível aplicar: ${label}`);
}

html=html.replace(/<meta name="da-build-version" content="[^"]+">/,`<meta name="da-build-version" content="${VERSION}">`);
html=html.replace(/<meta name="robots" content="[^"]+">/,'<meta name="robots" content="noindex, nofollow">');
html=html.replace(/<title>(.*?)<\/title>/,'<title>$1 · Teste Home Rápida</title>');
html=html.replaceAll('2026-07-17-home-pagespeed-oficial-v1',VERSION);
html=html.replace(/window\.__DA_PAGESPEED_TEST__\s*=\s*false;/g,'window.__DA_PAGESPEED_TEST__ = true;');

required(/const offers=getTopOffers\(12\);/,'const offers=getTopOffers(20);','20 ofertas');
required(/bannerSlotHtml\('home\.hero',\{carousel:true,kind:'hero',limit:6,/g,"bannerSlotHtml('home.hero',{carousel:false,kind:'hero',limit:4,",'4 banners no desktop');

html=html.replace(/\s*\$\{bannerSlotHtml\('home\.compra-mes\.topo',[\s\S]*?\}\)\}/g,'');
html=html.replace(/\s*\$\{bannerSlotHtml\('home\.higiene\.topo',[\s\S]*?\}\)\}/g,'');

required(
  /function daRenderHomeSecondary\(slot\)\{[\s\S]*?daSetupHomeTail\(\);\s*\}/,
  `function daRenderHomeSecondary(slot){
        if(!slot || !slot.isConnected || slot.dataset.loaded==='true') return;
        slot.dataset.loaded='true';
        slot.removeAttribute('aria-busy');
        slot.innerHTML=\`\${daHomeHereTemHtml()}\${brandStripHtml()}\${categoryButtonsHtml()}\`;
        syncVisibleCards();
        updateFavoritesUI();
      }`,
  'variedade compacta'
);

html=html.replace(/\s*<div data-home-tail-slot[\s\S]*?<\/div>\`;/g,'`');

const css=`
<style id="da-fast-home-css">
.da-home-profit [data-banner-position="home.hero"] .banner-track{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:10px!important;overflow:visible!important;transform:none!important;scroll-behavior:auto!important}
.da-home-profit [data-banner-position="home.hero"] .banner-card{min-width:0!important;width:auto!important;animation:none!important;transition:none!important}
.da-home-profit [data-banner-position="home.hero"] .banner-dots,.da-home-profit [data-banner-position="home.hero"] .banner-arrow{display:none!important}
.da-home-profit .da-home-section{content-visibility:auto;contain-intrinsic-size:420px}
.da-home-profit img[loading="lazy"]{content-visibility:auto}
@media(max-width:767px){.da-home-profit [data-banner-position="home.hero"] .banner-track{grid-template-columns:repeat(2,minmax(0,1fr))!important}.da-home-profit [data-banner-position="home.hero"] .banner-card:nth-child(n+3){display:none!important}.da-home-profit .da-home-section{contain-intrinsic-size:360px}}
@media(max-width:420px){.da-home-profit *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}.da-home-profit .banner-card{box-shadow:none!important}}
</style>`;
html=html.replace('</head>',`${css}\n</head>`);

const runtime=`
<script id="da-fast-home-runtime">
(function(){
  'use strict';
  function shuffle(items){
    for(let i=items.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}
    return items;
  }
  function optimizeHero(){
    const slot=document.querySelector('[data-banner-position="home.hero"]');
    if(!slot||slot.dataset.fastReady==='1') return;
    const track=slot.querySelector('.banner-track')||slot;
    const cards=shuffle(Array.from(track.querySelectorAll('.banner-card')));
    if(!cards.length) return;
    cards.forEach(card=>track.appendChild(card));
    const max=matchMedia('(max-width:767px)').matches?2:4;
    cards.slice(max).forEach(card=>card.remove());
    cards.slice(0,max).forEach((card,index)=>{
      const img=card.querySelector('img');
      if(!img) return;
      img.width=400; img.height=500; img.decoding='async';
      if(index===0){img.loading='eager';img.fetchPriority='high';}
      else{img.loading='lazy';img.fetchPriority='low';}
    });
    slot.querySelectorAll('[data-autoplay],.banner-dots,.banner-arrow').forEach(el=>el.remove());
    slot.dataset.fastReady='1';
  }
  function optimizeProductImages(){
    const root=document.querySelector('.da-home-profit');
    if(!root) return;
    const imgs=Array.from(root.querySelectorAll('img'));
    imgs.forEach((img,index)=>{
      img.decoding='async';
      if(!img.width) img.width=300;
      if(!img.height) img.height=300;
      if(index>7){img.loading='lazy';img.fetchPriority='low';}
    });
  }
  function run(){optimizeHero();optimizeProductImages();}
  document.addEventListener('DOMContentLoaded',run,{once:true});
  requestAnimationFrame(run);
  setTimeout(run,500);
  setTimeout(run,1600);
})();
</script>`;
html=html.replace('</body>',`${runtime}\n<!-- DA_FAST_HOME_TEST_V7 -->\n</body>`);

await fs.writeFile(OUTPUT,html,'utf8');
console.log(`Gerado ${OUTPUT} (${Buffer.byteLength(html)} bytes)`);
