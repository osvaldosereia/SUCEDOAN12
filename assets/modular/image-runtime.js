
(function(){
  'use strict';
  let scheduled=false;
  let preloadObserver=null;
  function productImagePreloader(root){
    if(preloadObserver || !('IntersectionObserver' in window)) return preloadObserver;
    preloadObserver=new IntersectionObserver((entries,observer)=>{
      entries.forEach(entry=>{
        if(!entry.isIntersecting) return;
        const img=entry.target;
        img.loading='eager';
        img.fetchPriority='auto';
        img.dataset.daImageReady='1';
        observer.unobserve(img);
      });
    },{root,rootMargin:'1000px 0px',threshold:.01});
    return preloadObserver;
  }
  function optimizeProductImages(){
    const root=document.getElementById('app');
    if(!root) return;
    const observer=productImagePreloader(root);
    const imgs=Array.from(root.querySelectorAll('.da-home-offer-feature-media img, .da-home-offer-grid .da-home-offer-media img, .product-imgbox img, #product-main-image'));
    imgs.forEach((img,index)=>{
      img.decoding='async';
      if(!img.width) img.width=300;
      if(!img.height) img.height=300;
      if(index<2){
        img.loading='eager';
        img.fetchPriority='high';
        if(observer) observer.unobserve(img);
      }else if(index<4){
        img.loading='eager';
        img.fetchPriority='auto';
        if(observer) observer.unobserve(img);
      }else if(img.dataset.daImageReady==='1'){
        img.loading='eager';
        img.fetchPriority='auto';
        if(observer) observer.unobserve(img);
      }else{
        img.loading='lazy';
        img.fetchPriority='auto';
        if(img.complete && img.naturalWidth){
          img.dataset.daImageReady='1';
          if(observer) observer.unobserve(img);
        }else if(observer && img.dataset.daImageReady!=='1'){
          observer.observe(img);
        }
      }
    });
  }
  function run(){
    if(scheduled) return;
    scheduled=true;
    queueMicrotask(()=>{
      scheduled=false;
      optimizeProductImages();
    });
  }
  document.addEventListener('DOMContentLoaded',run,{once:true});
  const app=document.getElementById('app');
  if(app) new MutationObserver(run).observe(app,{childList:true,subtree:true});
  window.addEventListener('hashchange',run,{passive:true});
  window.addEventListener('pageshow',run,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) run();},{passive:true});
  run();
  setTimeout(run,500);
  setTimeout(run,1600);
})();
