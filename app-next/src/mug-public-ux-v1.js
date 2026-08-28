const BUILD='20260828-mug-public-ux-v1-professional';
let scanTimer=0;
let observer=null;

function injectStyles(){
  if(document.getElementById('mugPublicUxV1'))return;
  const style=document.createElement('style');
  style.id='mugPublicUxV1';
  style.textContent=`
:root{--mug-ux-green:#214f38;--mug-ux-green-2:#173d2b;--mug-ux-ink:#252a25;--mug-ux-muted:#6f766e;--mug-ux-line:#e2e7df;--mug-ux-soft:#f7f8f4;--mug-ux-warm:#fbfaf6}

/* Cards de caneca no grid */
[data-product-card].mug-card-polish{position:relative;isolation:isolate}
[data-product-card].mug-card-polish .product-card-media{position:relative;background:linear-gradient(180deg,#fbfaf7 0%,#f3f4ef 100%);border:1px solid #eceee9;border-radius:18px;overflow:hidden;padding:7px}
[data-product-card].mug-card-polish .product-card-media img{object-fit:contain!important;transform:scale(.98);transition:transform .22s ease}
[data-product-card].mug-card-polish:hover .product-card-media img{transform:scale(1.015)}
[data-product-card].mug-card-polish .mug-card-badge{position:absolute;left:10px;bottom:10px;z-index:3;pointer-events:none;display:inline-flex;align-items:center;gap:5px;padding:6px 9px;border-radius:999px;background:rgba(27,63,45,.92);color:#fff;font-size:9px;font-weight:850;letter-spacing:.02em;box-shadow:0 4px 14px rgba(20,48,34,.16);backdrop-filter:blur(6px)}
[data-product-card].mug-card-polish .mug-card-badge::before{content:'';width:6px;height:6px;border-radius:50%;background:#dcebdc;box-shadow:0 0 0 2px rgba(255,255,255,.16)}

/* Galeria do produto: principal dominante, secundárias compactas */
html.mug-product-route .product-detail-media.mug-gallery-polish>img{display:block!important;width:100%;height:auto;aspect-ratio:1/1;object-fit:contain!important;background:linear-gradient(180deg,#fbfaf8,#f5f6f2);border:1px solid #e8ebe5;border-radius:22px;padding:10px;box-sizing:border-box}
html.mug-product-route .product-detail-media.mug-gallery-polish .product-media-thumbs{display:flex!important;justify-content:flex-start;align-items:flex-start;gap:9px;margin:10px 0 0!important;padding:2px 1px 3px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
html.mug-product-route .product-detail-media.mug-gallery-polish .product-media-thumbs::-webkit-scrollbar{display:none}
html.mug-product-route .product-detail-media.mug-gallery-polish .product-media-thumb{flex:0 0 78px!important;width:78px!important;min-height:0!important;padding:4px!important;border:1px solid #dfe4dd!important;border-radius:13px!important;background:#fff!important;box-shadow:none!important;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}
html.mug-product-route .product-detail-media.mug-gallery-polish .product-media-thumb:hover{transform:translateY(-1px);border-color:#aab9ae!important}
html.mug-product-route .product-detail-media.mug-gallery-polish .product-media-thumb.active{border-color:var(--mug-ux-green)!important;box-shadow:0 0 0 2px rgba(33,79,56,.11)!important}
html.mug-product-route .product-detail-media.mug-gallery-polish .product-media-thumb img{width:100%;aspect-ratio:1/1;object-fit:contain!important;border-radius:9px;background:#f7f8f4}
html.mug-product-route .product-detail-media.mug-gallery-polish .product-media-thumb span{display:block;padding:4px 2px 1px!important;font-size:9px!important;line-height:1.15;text-align:center;color:#5d655d;font-weight:800}

/* Blocos arte e vídeo */
html.mug-product-route .product-extra-media{gap:16px!important}
html.mug-product-route .product-print-art,html.mug-product-route .product-real-video{border-color:#e2e7df!important;border-radius:20px!important;box-shadow:0 8px 26px rgba(37,49,40,.045)}
html.mug-product-route .product-extra-heading strong{color:var(--mug-ux-ink)}
html.mug-product-route .product-art-open{background:#f5f6f2!important;border:1px solid #ebeee8!important}

/* Personalizador */
.mug-public-personalizer.mug-ux-panel{position:relative;margin:26px 0 34px!important;border:1px solid #dce4dc!important;border-radius:24px!important;background:#fff!important;overflow:hidden!important;box-shadow:0 18px 46px rgba(30,49,38,.09)!important;scroll-margin-top:120px}
.mug-public-personalizer.mug-ux-panel::before{content:'';position:absolute;left:0;right:0;top:0;height:4px;background:linear-gradient(90deg,var(--mug-ux-green-2),#4b785e,#a4b89f)}
.mug-public-personalizer.mug-ux-panel .mug-public-head{padding:26px 24px 20px!important;background:linear-gradient(145deg,#f4f8f2 0%,#fff 58%,#fbfaf6 100%)!important;border-bottom:1px solid #e7ece5}
.mug-public-personalizer.mug-ux-panel .mug-public-head>span{padding:6px 10px!important;background:var(--mug-ux-green)!important;color:#fff!important;border-radius:999px!important;font-size:9px!important;letter-spacing:.075em!important;font-weight:900!important}
.mug-public-personalizer.mug-ux-panel .mug-public-head h2{margin:12px 0 7px!important;color:#202620!important;font-size:27px!important;letter-spacing:-.025em;line-height:1.08!important}
.mug-public-personalizer.mug-ux-panel .mug-public-head p{max-width:610px;color:#657065!important;font-size:13px!important;line-height:1.55!important}
.mug-public-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;background:#fbfcf9;border-bottom:1px solid #e7ece5}
.mug-public-step{display:flex;align-items:center;justify-content:center;gap:7px;min-height:48px;padding:8px 10px;border-right:1px solid #edf0eb;color:#566158;font-size:10px;font-weight:800;text-align:center}
.mug-public-step:last-child{border-right:0}
.mug-public-step b{display:grid;place-items:center;flex:0 0 22px;width:22px;height:22px;border-radius:50%;background:#e8efe8;color:var(--mug-ux-green);font-size:10px}
.mug-public-personalizer.mug-ux-panel .mug-public-form{padding:20px!important;gap:14px!important;background:linear-gradient(180deg,#fbfcfa 0%,#f8f9f6 100%)}
.mug-public-personalizer.mug-ux-panel .mug-public-form>.mug-public-field{padding:14px 14px 13px;border:1px solid #e4e9e2;border-radius:16px;background:#fff;box-shadow:0 3px 12px rgba(34,52,40,.025)}
.mug-public-personalizer.mug-ux-panel .mug-public-field>span{margin-bottom:1px;color:#2c342e!important;font-size:12px!important;font-weight:850!important}
.mug-public-personalizer.mug-ux-panel .mug-public-field small{color:#788078!important;font-size:10px!important;line-height:1.4!important}
.mug-public-personalizer.mug-ux-panel .mug-public-field input,.mug-public-personalizer.mug-ux-panel .mug-public-field textarea,.mug-public-personalizer.mug-ux-panel .mug-public-field select{min-height:48px!important;border:1px solid #d6ddd5!important;border-radius:12px!important;background:#fff!important;color:#242b25!important;box-shadow:0 1px 0 rgba(28,43,32,.015);transition:border-color .18s ease,box-shadow .18s ease,background .18s ease}
.mug-public-personalizer.mug-ux-panel .mug-public-field textarea{min-height:104px!important}
.mug-public-personalizer.mug-ux-panel .mug-public-field input:focus,.mug-public-personalizer.mug-ux-panel .mug-public-field textarea:focus,.mug-public-personalizer.mug-ux-panel .mug-public-field select:focus{border-color:#668473!important;box-shadow:0 0 0 3px rgba(56,103,77,.11)!important;outline:none!important}
.mug-public-personalizer.mug-ux-panel .mug-public-photo{position:relative;min-height:88px;display:grid;align-items:center;padding:16px!important;border:1.5px dashed #a9b8aa!important;border-radius:14px!important;background:linear-gradient(180deg,#f8fbf7,#f3f7f2)!important}
.mug-public-personalizer.mug-ux-panel .mug-public-photo::before{content:'Adicionar foto';display:block;margin-bottom:7px;color:var(--mug-ux-green);font-size:12px;font-weight:900}
.mug-public-personalizer.mug-ux-panel .mug-public-photo input[type="file"]{min-height:0!important;padding:0!important;border:0!important;background:transparent!important;font-size:12px!important}
.mug-public-personalizer.mug-ux-panel .mug-public-identification{padding:17px!important;border:1px solid #d4dfd4!important;border-radius:18px!important;background:linear-gradient(145deg,#f1f7f0,#f9fbf7)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.8)}
.mug-public-personalizer.mug-ux-panel .mug-public-identification>strong{color:#284332;font-size:14px;letter-spacing:-.01em}
.mug-public-personalizer.mug-ux-panel .mug-public-identification>p{color:#6b776c!important;font-size:11px!important;line-height:1.45}
.mug-public-personalizer.mug-ux-panel .mug-public-limit{min-height:38px;padding:9px 11px!important;border:1px solid #dbe5d8;background:#eaf2e8!important;color:#35503e;border-radius:11px!important}
.mug-public-personalizer.mug-ux-panel .mug-public-limit.blocked{border-color:#f0d6d2!important;background:#fff1ef!important;color:#8c302b!important}
.mug-public-personalizer.mug-ux-panel .mug-public-generate{min-height:54px!important;border-radius:14px!important;background:linear-gradient(180deg,#285a40,#1d4933)!important;color:#fff!important;box-shadow:0 9px 22px rgba(29,73,51,.18)!important;font-size:15px!important;letter-spacing:-.01em;transition:transform .18s ease,box-shadow .18s ease,filter .18s ease}
.mug-public-personalizer.mug-ux-panel .mug-public-generate:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 12px 26px rgba(29,73,51,.22)!important;filter:saturate(1.05)}
.mug-public-personalizer.mug-ux-panel .mug-public-generate:active:not(:disabled){transform:translateY(0)}
.mug-public-confidence{margin:-4px 4px 2px;color:#6f786f;font-size:10px;line-height:1.45;text-align:center}
.mug-public-confidence strong{color:#315b42}
.mug-public-personalizer.mug-ux-panel .mug-public-progress{border:1px solid #e0e6df!important;background:#f4f7f2!important}
.mug-public-personalizer.mug-ux-panel .mug-public-progress-track{height:9px!important;background:#dde5dc!important}
.mug-public-personalizer.mug-ux-panel .mug-public-progress-track>i{background:linear-gradient(90deg,#254f39,#6f9479)!important}
.mug-public-personalizer.mug-ux-panel .mug-public-error{border-color:#efd4d1!important;border-radius:13px!important;background:#fff4f3!important}
.mug-public-personalizer.mug-ux-panel .mug-public-result{border-color:#d9e4d8!important;border-radius:18px!important;background:#fbfdf9!important;box-shadow:0 8px 26px rgba(35,62,43,.05)}

@media(min-width:760px){
 html.mug-product-route .product-detail-media.mug-gallery-polish{display:grid!important;grid-template-columns:86px minmax(0,1fr);gap:12px;align-items:start;background:transparent!important}
 html.mug-product-route .product-detail-media.mug-gallery-polish>img{grid-column:2;grid-row:1}
 html.mug-product-route .product-detail-media.mug-gallery-polish .product-media-thumbs{grid-column:1;grid-row:1;flex-direction:column;margin:0!important;padding:0 2px}
 html.mug-product-route .product-detail-media.mug-gallery-polish .product-media-thumb{flex:0 0 auto!important;width:82px!important}
}

@media(max-width:700px){
 [data-product-card].mug-card-polish .product-card-media{border-radius:14px;padding:5px}
 [data-product-card].mug-card-polish .mug-card-badge{left:7px;bottom:7px;padding:5px 7px;font-size:8px}
 html.mug-product-route .product-detail-media.mug-gallery-polish>img{border-radius:17px;padding:7px}
 html.mug-product-route .product-detail-media.mug-gallery-polish .product-media-thumbs{gap:8px;margin-top:8px!important;padding-left:2px}
 html.mug-product-route .product-detail-media.mug-gallery-polish .product-media-thumb{flex-basis:70px!important;width:70px!important;border-radius:11px!important}
 .mug-public-personalizer.mug-ux-panel{margin:20px 0 28px!important;border-radius:19px!important;box-shadow:0 12px 34px rgba(30,49,38,.08)!important}
 .mug-public-personalizer.mug-ux-panel .mug-public-head{padding:21px 17px 17px!important}
 .mug-public-personalizer.mug-ux-panel .mug-public-head h2{font-size:24px!important}
 .mug-public-personalizer.mug-ux-panel .mug-public-head p{font-size:12px!important}
 .mug-public-steps{grid-template-columns:1fr 1fr 1fr}
 .mug-public-step{min-height:44px;padding:7px 4px;gap:4px;font-size:8.5px}
 .mug-public-step b{width:20px;height:20px;flex-basis:20px;font-size:9px}
 .mug-public-personalizer.mug-ux-panel .mug-public-form{padding:13px!important;gap:12px!important}
 .mug-public-personalizer.mug-ux-panel .mug-public-form>.mug-public-field{padding:12px;border-radius:14px}
 .mug-public-personalizer.mug-ux-panel .mug-public-identification{padding:14px!important;border-radius:15px!important}
 .mug-public-personalizer.mug-ux-panel .mug-public-generate{min-height:56px!important;font-size:15px!important}
 .mug-public-confidence{font-size:9.5px;margin-inline:7px}
}

@media(prefers-reduced-motion:reduce){[data-product-card].mug-card-polish .product-card-media img,.product-media-thumb,.mug-public-generate{transition:none!important}}
`;
  document.head.appendChild(style);
}

function polishCards(root=document){
  root.querySelectorAll?.('img[data-mug-thumb]').forEach(img=>{
    const card=img.closest('[data-product-card]');
    if(!card||card.classList.contains('mug-card-polish'))return;
    card.classList.add('mug-card-polish');
    const media=card.querySelector('.product-card-media');
    if(media&&!media.querySelector('.mug-card-badge')){
      const badge=document.createElement('span');
      badge.className='mug-card-badge';
      badge.textContent='Personalizável';
      badge.setAttribute('aria-hidden','true');
      media.appendChild(badge);
    }
  });
}

function polishGallery(root=document){
  root.querySelectorAll?.('.product-detail-media').forEach(media=>{
    if(media.dataset.mugMediaReady==='1'||document.documentElement.classList.contains('mug-product-route')){
      media.classList.add('mug-gallery-polish');
    }
  });
}

function polishPersonalizer(root=document){
  const panel=root.querySelector?.('#mug-public-personalizer')||(root.id==='mug-public-personalizer'?root:null);
  if(!panel||panel.dataset.mugUx==='1')return;
  panel.dataset.mugUx='1';
  panel.classList.add('mug-ux-panel');
  const head=panel.querySelector('.mug-public-head');
  if(head&&!panel.querySelector('.mug-public-steps')){
    const steps=document.createElement('div');
    steps.className='mug-public-steps';
    steps.setAttribute('aria-label','Etapas da personalização');
    steps.innerHTML='<div class="mug-public-step"><b>1</b><span>Foto e dados</span></div><div class="mug-public-step"><b>2</b><span>Gerar sua arte</span></div><div class="mug-public-step"><b>3</b><span>Conferir resultado</span></div>';
    head.insertAdjacentElement('afterend',steps);
  }
  const generate=panel.querySelector('#mugPublicGenerate');
  if(generate&&!panel.querySelector('.mug-public-confidence')){
    const note=document.createElement('p');
    note.className='mug-public-confidence';
    note.innerHTML='<strong>Você confere antes de comprar.</strong> Sua criação fica salva automaticamente em Minhas canecas.';
    generate.insertAdjacentElement('afterend',note);
  }
}

function scan(root=document){
  clearTimeout(scanTimer);
  scanTimer=setTimeout(()=>{
    polishCards(root);
    polishGallery(root);
    polishPersonalizer(root);
  },20);
}

function init(){
  injectStyles();
  scan(document);
  const target=document.getElementById('app')||document.body;
  observer=new MutationObserver(records=>{
    let shouldScan=false;
    for(const record of records){
      if(record.type==='attributes'){shouldScan=true;break}
      if(record.addedNodes?.length){shouldScan=true;break}
    }
    if(shouldScan)scan(document);
  });
  observer.observe(target,{subtree:true,childList:true,attributes:true,attributeFilter:['data-mug-thumb','data-mug-media-ready']});
  ['hashchange','da:route-rendered','da:catalog-ready','da:catalog-refreshed','da:mug-personalized-added'].forEach(name=>window.addEventListener(name,()=>scan(document)));
  document.documentElement.dataset.mugPublicUx=BUILD;
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

export{BUILD,scan,polishCards,polishGallery,polishPersonalizer};
