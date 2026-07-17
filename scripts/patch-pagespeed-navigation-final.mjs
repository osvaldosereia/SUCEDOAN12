import fs from 'node:fs/promises';

const FILE = 'index-pagespeed-test.html';
let html = await fs.readFile(FILE, 'utf8');

const css = `.da-mobile-see-all{display:none}@media(max-width:767px){.da-mobile-see-all{display:flex!important;width:100%;min-height:46px;margin:14px 0 4px;padding:12px 16px;align-items:center;justify-content:center;border:1px solid currentColor;border-radius:12px;font-weight:800;text-align:center;text-decoration:none;background:#fff;box-sizing:border-box}.da-home-section>.da-mobile-see-all:last-child{margin-bottom:0}}`;

if (!html.includes('.da-mobile-see-all{display:none}')) {
  html = html.replace('</style>', `${css}\n</style>`);
}

const script = `<script>
(function(){
  'use strict';

  function normalizeTitle(value){
    return String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim().toLowerCase();
  }

  function sectionTitle(section){
    const heading=section && section.querySelector('h2,h3,.section-title,.da-home-section-head strong');
    return normalizeTitle(heading ? heading.textContent : '');
  }

  function addMobileSeeAllButtons(){
    const root=document.querySelector('.da-home-profit');
    if(!root) return;

    root.querySelectorAll('section,.da-home-section').forEach(function(section){
      if(sectionTitle(section)==='kits promocionais'){
        section.querySelectorAll(':scope > .da-mobile-see-all').forEach(function(button){ button.remove(); });
      }
    });

    const selectors=[
      '.da-home-section-head a[href]',
      '.section-head a[href]',
      '.shelf-head a[href]',
      'a.section-link[href]'
    ];

    root.querySelectorAll(selectors.join(',')).forEach(function(action){
      const section=action.closest('section,.da-home-section');
      if(!section || sectionTitle(section)==='kits promocionais' || section.querySelector(':scope > .da-mobile-see-all')) return;
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

  const SCROLL_PREFIX='da_pagespeed_scroll_v1:';
  let restoring=false;
  let saveTimer=0;

  function routeKeyFromUrl(url){
    try{
      const parsed=new URL(url,location.href);
      return parsed.pathname + parsed.search + (parsed.hash || '#/');
    }catch(e){
      return location.pathname + location.search + (location.hash || '#/');
    }
  }

  function currentRouteKey(){
    return routeKeyFromUrl(location.href);
  }

  function getScrollState(){
    const app=document.getElementById('app');
    return {
      windowY:Math.max(0,Math.round(window.scrollY || document.documentElement.scrollTop || 0)),
      appY:app ? Math.max(0,Math.round(app.scrollTop || 0)) : 0
    };
  }

  function saveScroll(key){
    if(restoring) return;
    try{ sessionStorage.setItem(SCROLL_PREFIX + key,JSON.stringify(getScrollState())); }catch(e){}
  }

  function scheduleSave(){
    window.clearTimeout(saveTimer);
    saveTimer=window.setTimeout(function(){ saveScroll(currentRouteKey()); },80);
  }

  function readScroll(key){
    try{
      const value=JSON.parse(sessionStorage.getItem(SCROLL_PREFIX + key) || 'null');
      return value && typeof value==='object' ? value : null;
    }catch(e){ return null; }
  }

  function applyScroll(state){
    if(!state) return;
    const app=document.getElementById('app');
    window.scrollTo(0,Number(state.windowY) || 0);
    if(app) app.scrollTop=Number(state.appY) || 0;
  }

  function restoreScroll(key){
    const state=readScroll(key);
    if(!state) return;
    restoring=true;
    const attempts=[0,80,220,500,900,1500,2400];
    attempts.forEach(function(delay,index){
      window.setTimeout(function(){
        applyScroll(state);
        if(index===attempts.length-1){
          restoring=false;
          saveScroll(key);
        }
      },delay);
    });
  }

  if('scrollRestoration' in history) history.scrollRestoration='manual';
  window.addEventListener('scroll',scheduleSave,{passive:true});
  document.addEventListener('scroll',function(event){
    if(event.target && event.target.id==='app') scheduleSave();
  },true);
  window.addEventListener('pagehide',function(){ saveScroll(currentRouteKey()); });
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='hidden') saveScroll(currentRouteKey());
  });
  window.addEventListener('hashchange',function(event){
    saveScroll(routeKeyFromUrl(event.oldURL));
    restoreScroll(routeKeyFromUrl(event.newURL));
  });
  window.addEventListener('popstate',function(){ restoreScroll(currentRouteKey()); });

  const observer=new MutationObserver(function(){
    addMobileSeeAllButtons();
  });
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',function(){
    addMobileSeeAllButtons();
    restoreScroll(currentRouteKey());
  },{once:true});
  window.setTimeout(addMobileSeeAllButtons,0);
  window.setTimeout(addMobileSeeAllButtons,1800);
  window.setTimeout(addMobileSeeAllButtons,3600);
})();
</script>`;

if (!html.includes("const SCROLL_PREFIX='da_pagespeed_scroll_v1:'")) {
  html = html.replace('</body>', `${script}\n</body>`);
}

await fs.writeFile(FILE, html, 'utf8');
console.log('Navegação final aplicada: restauração de rolagem e botão único em Kits promocionais.');
