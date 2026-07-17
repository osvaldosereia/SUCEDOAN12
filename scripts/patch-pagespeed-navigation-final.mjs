import fs from 'node:fs/promises';

const FILE = 'index-pagespeed-test.html';
let html = await fs.readFile(FILE, 'utf8');

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

  function keepSingleKitButton(){
    const root=document.querySelector('.da-home-profit');
    if(!root) return;
    root.querySelectorAll('section,.da-home-section').forEach(function(section){
      if(sectionTitle(section)!=='kits promocionais') return;
      section.querySelectorAll(':scope > .da-mobile-see-all').forEach(function(button){ button.remove(); });
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
        keepSingleKitButton();
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

  const observer=new MutationObserver(keepSingleKitButton);
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',function(){
    keepSingleKitButton();
    restoreScroll(currentRouteKey());
  },{once:true});
  window.setTimeout(keepSingleKitButton,0);
  window.setTimeout(keepSingleKitButton,1800);
  window.setTimeout(keepSingleKitButton,3600);
})();
</script>`;

if (!html.includes("const SCROLL_PREFIX='da_pagespeed_scroll_v1:'")) {
  html = html.replace('</body>', `${script}\n</body>`);
}

await fs.writeFile(FILE, html, 'utf8');
console.log('Restauração de rolagem e botão único de Kits promocionais aplicados.');
