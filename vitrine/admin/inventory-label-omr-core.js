/* DA6 — leitura óptica local: funções puras, sem IA. */
(function(){
  'use strict';
  function decodeMarkedDigits(marked){
    if(!Array.isArray(marked)||marked.length!==10)throw Error('São necessárias dez posições');
    const indexes=marked.map((v,i)=>v?i:-1).filter(i=>i>=0);
    return indexes.length===1?indexes[0]:null;
  }
  function decodeCount(active,tens,units){
    if(!active)return {status:'unused'};
    const d=decodeMarkedDigits(tens),u=decodeMarkedDigits(units);
    return d===null||u===null?{status:'review'}:{status:'read',quantity:d*10+u};
  }
  window.DonaAntoniaOMR={decodeMarkedDigits,decodeCount};
})();