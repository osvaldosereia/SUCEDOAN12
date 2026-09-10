(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  let wasFast=false,focusTimer=null;
  function isFast(){return Boolean($('app')?.classList.contains('fast-mode-on'))}
  function scanner(){return $('fastScanInput')}
  function keepScannerReady(delay=0){clearTimeout(focusTimer);focusTimer=setTimeout(()=>{if(!isFast())return;const input=scanner();if(!input)return;input.disabled=false;input.readOnly=false;input.removeAttribute('disabled');input.removeAttribute('readonly');try{input.focus({preventScroll:true})}catch{try{input.focus()}catch{}}},delay)}
  function routeLegacyScanToFast(event){if(!isFast())return;const code=String($('eanInput')?.value||'').trim();if(!code)return;event.preventDefault();event.stopImmediatePropagation();const input=scanner();if(!input)return;input.disabled=false;input.readOnly=false;input.value=code;input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));if($('eanInput'))$('eanInput').value='';keepScannerReady(0)}
  function syncMode(){const app=$('app');if(!app)return;const fast=app.classList.contains('fast-mode-on');if(fast)keepScannerReady(0);if(wasFast&&!fast)setTimeout(()=>{try{$('retryButton')?.click()}catch{}},30);wasFast=fast}
  function bind(){
    $('searchButton')?.addEventListener('click',routeLegacyScanToFast,true);
    const input=scanner();if(input){new MutationObserver(()=>{if(!isFast())return;if(input.disabled||input.readOnly){input.disabled=false;input.readOnly=false;input.removeAttribute('disabled');input.removeAttribute('readonly')}}).observe(input,{attributes:true,attributeFilter:['disabled','readonly']});input.addEventListener('keydown',e=>{if(isFast()&&(e.key==='Enter'||e.key==='Tab'))keepScannerReady(0)},true);input.addEventListener('blur',()=>{if(isFast())keepScannerReady(10)},true)}
    const app=$('app');if(app)new MutationObserver(syncMode).observe(app,{attributes:true,attributeFilter:['class']});
    window.addEventListener('online',()=>keepScannerReady(0));document.addEventListener('visibilitychange',()=>{if(!document.hidden)keepScannerReady(0)});
    setInterval(()=>{if(isFast())keepScannerReady(0)},700);syncMode();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();