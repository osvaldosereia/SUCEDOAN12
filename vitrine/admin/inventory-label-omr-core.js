/* DA6 — leitura óptica determinística, compatível com navegador e worker. */
(function(root){
  'use strict';
  function decodeMarkedDigits(marked){
    if(!Array.isArray(marked)||marked.length!==10)throw Error('São necessárias dez posições');
    const indexes=marked.map((v,i)=>v===true?i:-1).filter(i=>i>=0);
    return indexes.length===1?indexes[0]:null;
  }
  function decodeCount(active,tens,units){
    if(active!==true)return {status:'unused'};
    const d=decodeMarkedDigits(tens),u=decodeMarkedDigits(units);
    return d===null||u===null?{status:'review'}:{status:'read',quantity:d*10+u};
  }
  root.DonaAntoniaOMR={decodeMarkedDigits,decodeCount,version:'DA6'};
})(typeof globalThis!=='undefined'?globalThis:this);
