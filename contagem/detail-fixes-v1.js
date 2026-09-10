(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const nativeFetch=window.fetch.bind(window);
  const touched={gondola:false,shelf:false};

  function txt(v){return String(v??'').replace(/\s+/g,' ').trim()}
  function mark(id){if(id==='gondolaInput')touched.gondola=true;if(id==='shelfInput')touched.shelf=true}
  function resetTouched(){touched.gondola=false;touched.shelf=false}

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:(input?.url||'');
    let nextInit=init;
    const restore=[];
    try{
      if(url.includes('/functions/v1/inventory-count-v2')&&typeof init?.body==='string'){
        const body=JSON.parse(init.body);
        if(body?.action==='save'&&body?.product){
          const price=$('priceInput'),cost=$('costInput');
          const priceBlank=!txt(price?.value),costBlank=!txt(cost?.value);
          if(priceBlank){delete body.product.preco;if(price){restore.push([price,price.value]);price.value='-'}}
          if(costBlank){delete body.product.preco_custo;if(cost){restore.push([cost,cost.value]);cost.value='-'}}

          if(touched.gondola&&txt($('gondolaInput')?.value)==='')body.clear_gondola=true;
          if(touched.shelf&&txt($('shelfInput')?.value)==='')body.clear_shelf=true;

          nextInit={...init,body:JSON.stringify(body)};
        }
      }
    }catch{}

    let pending;
    try{pending=nativeFetch(input,nextInit)}
    finally{for(const [el,value] of restore){if(el.value==='-')el.value=value}}
    return pending;
  };

  function bind(){
    $('gondolaInput')?.addEventListener('input',()=>mark('gondolaInput'));
    $('shelfInput')?.addEventListener('input',()=>mark('shelfInput'));

    const productCard=$('productCard');
    if(productCard)new MutationObserver(()=>{
      if(!productCard.classList.contains('hidden'))resetTouched();
    }).observe(productCard,{attributes:true,attributeFilter:['class']});

    $('saveButton')?.addEventListener('click',event=>{
      const stockRaw=txt($('stockInput')?.value);
      if(stockRaw!=='')return;
      event.preventDefault();event.stopImmediatePropagation();
      const status=$('saveStatus');if(status){status.textContent='Informe o estoque contado antes de salvar.';status.className='note error'}
      try{$('stockInput')?.click()}catch{}
    },true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();