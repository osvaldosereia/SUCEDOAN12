(()=>{
  'use strict';

  const CACHE_KEY='da_cadastro_ia_taxonomia_v1';
  const SETTINGS_KEY='da_cadastro_ia_v6_settings';
  const CACHE_TTL=12*60*60*1000;
  const originalFetch=window.fetch.bind(window);
  let taxonomy=null;
  let loading=null;
  let replayingSubmit=false;

  const text=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
  const normalized=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const sortPt=(a,b)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'});

  function settings(){
    const defaults={
      firebaseUrl:'https://cedar-chemist-310801-default-rtdb.firebaseio.com',
      productsNode:'produtos',
      auth:''
    };
    try{return {...defaults,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}}
    catch{return defaults}
  }

  function firebaseUrl(){
    const config=settings();
    const base=text(config.firebaseUrl).replace(/\/+$/,'');
    const node=text(config.productsNode||'produtos').replace(/^\/+|\/+$/g,'');
    const auth=text(config.auth);
    return `${base}/${node}.json${auth?`?auth=${encodeURIComponent(auth)}`:''}`;
  }

  function readCache(){
    try{
      const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      if(!cached?.payload||Number(cached.expiresAt)<=Date.now())return null;
      if(!Array.isArray(cached.payload.categorias)||!Array.isArray(cached.payload.marcas))return null;
      return cached.payload;
    }catch{return null}
  }

  function saveCache(payload,productCount){
    try{
      localStorage.setItem(CACHE_KEY,JSON.stringify({
        payload,
        productCount,
        generatedAt:new Date().toISOString(),
        expiresAt:Date.now()+CACHE_TTL
      }));
    }catch{}
  }

  function buildTaxonomy(products){
    const categories=new Map();
    const brands=new Map();
    let productCount=0;

    for(const product of Object.values(products||{})){
      if(!product||typeof product!=='object')continue;
      productCount+=1;
      const category=text(product.categoria);
      const subcategory=text(product.subcategoria);
      const subsubcategory=text(product.subsubcategoria);
      const brand=text(product.marca);

      if(brand&&!brands.has(normalized(brand)))brands.set(normalized(brand),brand);
      if(!category)continue;
      const categoryKey=normalized(category);
      if(!categories.has(categoryKey))categories.set(categoryKey,{nome:category,subs:new Map()});
      const categoryEntry=categories.get(categoryKey);
      if(!subcategory)continue;
      const subcategoryKey=normalized(subcategory);
      if(!categoryEntry.subs.has(subcategoryKey))categoryEntry.subs.set(subcategoryKey,{nome:subcategory,subsubs:new Map()});
      const subcategoryEntry=categoryEntry.subs.get(subcategoryKey);
      if(subsubcategory&&!subcategoryEntry.subsubs.has(normalized(subsubcategory))){
        subcategoryEntry.subsubs.set(normalized(subsubcategory),subsubcategory);
      }
    }

    const categorias=[...categories.values()].sort((a,b)=>sortPt(a.nome,b.nome)).map(category=>({
      nome:category.nome,
      subcategorias:[...category.subs.values()].sort((a,b)=>sortPt(a.nome,b.nome)).map(subcategory=>({
        nome:subcategory.nome,
        subsubcategorias:[...subcategory.subsubs.values()].sort(sortPt)
      }))
    }));
    const marcas=[...brands.values()].sort(sortPt);
    return {payload:{categorias,marcas},productCount};
  }

  function compact(payload){
    return {
      c:(payload?.categorias||[]).map(category=>[
        category.nome,
        (category.subcategorias||[]).map(subcategory=>[subcategory.nome,subcategory.subsubcategorias||[]])
      ]),
      m:payload?.marcas||[]
    };
  }

  function existingBrand(value){
    const key=normalized(value);
    if(!key)return '';
    return (taxonomy?.marcas||[]).find(item=>normalized(item)===key)||'';
  }

  function status(messageValue='',isError=false){
    const element=document.getElementById('taxonomyStatus');
    if(!element)return;
    if(messageValue){
      element.textContent=messageValue;
      element.style.color=isError?'#9f2222':'';
      return;
    }
    const subcategories=(taxonomy?.categorias||[]).reduce((sum,item)=>sum+(item.subcategorias?.length||0),0);
    const subsubs=(taxonomy?.categorias||[]).reduce((sum,item)=>sum+(item.subcategorias||[]).reduce((subtotal,sub)=>subtotal+(sub.subsubcategorias?.length||0),0),0);
    element.style.color='';
    element.textContent=`Classificações existentes: ${taxonomy?.categorias?.length||0} categorias, ${subcategories} subcategorias, ${subsubs} subsubcategorias e ${taxonomy?.marcas?.length||0} marcas.`;
  }

  function showMessage(value,type=''){
    const element=document.getElementById('message');
    if(!element)return;
    element.textContent=value;
    element.className=`message show ${type}`;
  }

  function populateBrands(){
    const list=document.getElementById('brandOptions');
    if(!list)return;
    list.replaceChildren(...(taxonomy?.marcas||[]).map(value=>{
      const option=document.createElement('option');
      option.value=value;
      return option;
    }));
  }

  function installUi(){
    const brandInput=document.getElementById('brandInput');
    if(brandInput){
      brandInput.setAttribute('list','brandOptions');
      brandInput.setAttribute('autocomplete','off');
      brandInput.placeholder='Escolha uma existente ou deixe a IA identificar';
      if(!document.getElementById('brandOptions')){
        const list=document.createElement('datalist');
        list.id='brandOptions';
        brandInput.insertAdjacentElement('afterend',list);
      }
    }

    const oldNote=document.querySelector('.panel-body > .note');
    if(oldNote&&!document.getElementById('taxonomyStatus')){
      oldNote.innerHTML='<strong id="taxonomyStatus">Carregando categorias e marcas existentes...</strong><br>A IA escolherá somente classificações que já existam nos produtos do Firebase. A lista fica em cache por 12 horas neste aparelho. <button class="btn" id="refreshTaxonomyButton" type="button" style="margin-left:6px;padding:6px 10px">Atualizar listas</button>';
      oldNote.querySelector('#refreshTaxonomyButton')?.addEventListener('click',async event=>{
        const button=event.currentTarget;
        button.disabled=true;
        try{
          await loadTaxonomy(true);
          showMessage('Categorias e marcas atualizadas pelo Firebase.','ok');
        }catch(error){
          status(error.message||'Falha ao atualizar classificações.',true);
          showMessage(error.message||'Não foi possível atualizar as classificações.','error');
        }finally{
          button.disabled=false;
        }
      });
    }
    populateBrands();
    if(taxonomy)status();
  }

  async function loadTaxonomy(force=false){
    if(loading)return loading;
    if(!force){
      const cached=readCache();
      if(cached){
        taxonomy=cached;
        installUi();
        status();
        return taxonomy;
      }
    }

    loading=(async()=>{
      status('Atualizando categorias e marcas pelo Firebase...');
      const response=await originalFetch(firebaseUrl(),{cache:'no-store'});
      if(!response.ok)throw new Error(`Firebase retornou ${response.status} ao carregar classificações.`);
      const products=await response.json();
      const result=buildTaxonomy(products);
      if(!result.payload.categorias.length)throw new Error('Nenhuma categoria existente foi encontrada em produtos.');
      const packed=JSON.stringify(compact(result.payload));
      if(packed.length>180000)throw new Error('A lista de classificações ficou grande demais para envio automático.');
      taxonomy=result.payload;
      saveCache(taxonomy,result.productCount);
      installUi();
      status();
      return taxonomy;
    })().finally(()=>{loading=null});
    return loading;
  }

  function isMakeWebhook(input,init){
    const url=typeof input==='string'?input:String(input?.url||'');
    const method=String(init?.method||input?.method||'GET').toUpperCase();
    return method==='POST'&&/hook\.eu1\.make\.com/i.test(url);
  }

  window.fetch=async(input,init={})=>{
    if(!isMakeWebhook(input,init))return originalFetch(input,init);
    const current=taxonomy||await loadTaxonomy(false);
    try{
      const wrapper=JSON.parse(String(init.body||'{}'));
      const payload=JSON.parse(String(wrapper.payload||'{}'));
      payload.catalogo_opcoes_json=JSON.stringify(compact(current));
      payload.versao='2026-08-20-v10-barcode-first-taxonomia';
      const manualBrand=text(payload?.contexto?.marca);
      if(manualBrand&&payload?.contexto&&!payload.contexto.marca_generica){
        payload.contexto.marca=existingBrand(manualBrand);
      }
      wrapper.payload=JSON.stringify(payload);
      return originalFetch(input,{...init,body:JSON.stringify(wrapper)});
    }catch(error){
      console.error('Não foi possível incluir as classificações existentes no webhook.',error);
      throw new Error('Falha ao preparar categorias e marcas para o Make.');
    }
  };

  document.addEventListener('click',async event=>{
    const button=event.target.closest('#submitButton');
    if(!button||replayingSubmit)return;
    if(taxonomy){
      const typed=text(document.getElementById('brandInput')?.value);
      const generic=document.getElementById('genericBrandButton')?.classList.contains('selected');
      if(typed&&!generic&&!existingBrand(typed)){
        event.preventDefault();
        event.stopImmediatePropagation();
        showMessage('Escolha uma marca que já exista no sistema ou deixe o campo vazio para a IA identificar.','error');
      }
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    button.disabled=true;
    try{
      await loadTaxonomy(false);
      replayingSubmit=true;
      button.disabled=false;
      button.click();
    }catch(error){
      button.disabled=false;
      status(error.message||'Falha ao carregar classificações.',true);
      showMessage('Não foi possível carregar as categorias e marcas existentes. Atualize as listas e tente novamente.','error');
    }finally{
      setTimeout(()=>{replayingSubmit=false},0);
    }
  },true);

  document.addEventListener('DOMContentLoaded',()=>{
    installUi();
    loadTaxonomy(false).catch(error=>status(error.message||'Falha ao carregar classificações.',true));
  },{once:true});
})();
