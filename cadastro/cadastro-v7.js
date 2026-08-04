(()=>{
  'use strict';

  const OFFICIAL_WEBHOOK='https://hook.eu1.make.com/ly4ycpajxdvjuk2yuakhv44qqqq8cm63';
  const DEFAULTS={
    firebaseUrl:'https://cedar-chemist-310801-default-rtdb.firebaseio.com',
    productsNode:'produtos',
    jobsNode:'cadastros_ia_jobs',
    auth:'',
    webhook:OFFICIAL_WEBHOOK
  };
  const SETTINGS_KEY='da_cadastro_ia_v6_settings';
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));

  const state={
    settings:loadSettings(),
    photos:{frente:'',ean:'',informacoes:''},
    busy:false,
    jobId:'',
    firebaseKey:'',
    pollTimer:null,
    options:{categories:[],subcategories:{},subsubs:{},brands:[]},
    brandMode:'select'
  };

  function loadSettings(){
    try{return {...DEFAULTS,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}}
    catch{return {...DEFAULTS}}
  }

  const text=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
  const digits=value=>String(value??'').replace(/\D/g,'');
  const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const esc=value=>String(value??'').replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));

  function dbUrl(path,query=''){
    const base=state.settings.firebaseUrl.replace(/\/+$/,'');
    const auth=state.settings.auth?`auth=${encodeURIComponent(state.settings.auth)}`:'';
    const params=[query,auth].filter(Boolean).join('&');
    return `${base}/${String(path).replace(/^\/+|\/+$/g,'')}.json${params?'?'+params:''}`;
  }

  async function request(url,options={},timeout=30000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetch(url,{cache:'no-store',...options,signal:controller.signal});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const body=await response.text();
      return body?JSON.parse(body):null;
    }catch(error){
      if(error.name==='AbortError')throw new Error('Tempo esgotado.');
      throw error;
    }finally{
      clearTimeout(timer);
    }
  }

  function message(value,type=''){
    const element=$('#message');
    element.textContent=value;
    element.className=`message show ${type}`;
    if(type==='ok')setTimeout(()=>element.classList.remove('show'),4200);
  }

  function validGtin(value){
    const code=digits(value);
    if(![8,12,13,14].includes(code.length))return false;
    const total=code.slice(0,-1).split('').reverse().reduce((sum,number,index)=>sum+Number(number)*(index%2?1:3),0);
    return (10-total%10)%10===Number(code.at(-1));
  }

  async function compress(file){
    const source=URL.createObjectURL(file);
    try{
      const image=await new Promise((resolve,reject)=>{
        const item=new Image();
        item.onload=()=>resolve(item);
        item.onerror=reject;
        item.src=source;
      });
      const max=1280;
      const scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d',{alpha:false});
      context.fillStyle='#fff';
      context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(image,0,0,canvas.width,canvas.height);
      let quality=.76;
      let data=canvas.toDataURL('image/jpeg',quality);
      while(data.length>1350000&&quality>.48){
        quality-=.08;
        data=canvas.toDataURL('image/jpeg',quality);
      }
      return data;
    }finally{
      URL.revokeObjectURL(source);
    }
  }

  async function readBarcode(file){
    if(!('BarcodeDetector' in window))return '';
    try{
      const detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','code_128','itf']});
      const bitmap=await createImageBitmap(file);
      const result=await detector.detect(bitmap);
      if(bitmap.close)bitmap.close();
      return digits(result?.[0]?.rawValue);
    }catch{return ''}
  }

  async function handlePhoto(input){
    const key=input.dataset.photo;
    const file=input.files?.[0];
    if(!file)return;
    message('Otimizando foto...');
    try{
      const [data,ean]=await Promise.all([compress(file),key==='ean'?readBarcode(file):'']);
      state.photos[key]=data;
      const preview=$(`[data-preview="${key}"]`);
      preview.src=data;
      preview.hidden=false;
      $(`[data-card="${key}"]`).classList.add('done');
      if(ean)$('#eanInput').value=ean;
      message('Foto pronta.','ok');
    }catch(error){
      message(error.message||'Não foi possível usar a foto.','error');
    }
  }

  function progress(stage,label){
    const stages=['recebido','identificando','pesquisando','gerando_imagem','salvando','concluido'];
    const current=stages.indexOf(stage);
    $$('.step').forEach((element,index)=>{
      element.classList.toggle('done',stage==='concluido'||index<current);
      element.classList.toggle('active',stage!=='concluido'&&index===Math.max(0,current));
    });
    $('#progressText').textContent=label||'Processando.';
  }

  async function findExisting(ean){
    if(!ean)return null;
    for(const field of ['gtin','ean','codigo']){
      const query=`orderBy=${encodeURIComponent(JSON.stringify(field))}&equalTo=${encodeURIComponent(JSON.stringify(ean))}`;
      try{
        const data=await request(dbUrl(state.settings.productsNode,query));
        if(data&&Object.keys(data).length)return Object.values(data)[0];
      }catch{}
    }
    try{
      const all=await request(dbUrl(state.settings.productsNode,`aliases=${Date.now()}`));
      for(const product of Object.values(all||{})){
        if(!product||typeof product!=='object')continue;
        const aliases=[];
        for(const source of [product.eans_alternativos,product.ean_aliases]){
          if(Array.isArray(source))aliases.push(...source);
          else if(source&&typeof source==='object')aliases.push(...Object.values(source));
          else if(source)aliases.push(...String(source).split(/[,;|\s]+/));
        }
        if(aliases.map(digits).includes(ean))return product;
      }
    }catch{}
    return null;
  }

  function fill(select,values,placeholder='Opcional'){
    const current=select.value;
    select.innerHTML=[`<option value="">${esc(placeholder)}</option>`,...(values||[]).map(value=>`<option value="${esc(value)}">${esc(value)}</option>`)].join('');
    if((values||[]).includes(current))select.value=current;
  }

  async function loadOptions(){
    try{
      const products=await request(dbUrl(state.settings.productsNode,`options=${Date.now()}`),{},40000);
      const categories=new Set();
      const brands=new Set();
      const subcategories={};
      const subsubs={};
      for(const product of Object.values(products||{})){
        if(!product||typeof product!=='object')continue;
        const category=text(product.categoria);
        const subcategory=text(product.subcategoria);
        const subsub=text(product.subsubcategoria);
        const brand=text(product.marca);
        if(category)categories.add(category);
        if(brand)brands.add(brand);
        if(category&&subcategory){
          if(!subcategories[category])subcategories[category]=new Set();
          subcategories[category].add(subcategory);
        }
        if(category&&subcategory&&subsub){
          const key=`${category}|||${subcategory}`;
          if(!subsubs[key])subsubs[key]=new Set();
          subsubs[key].add(subsub);
        }
      }
      state.options={
        categories:[...categories].sort((a,b)=>a.localeCompare(b,'pt-BR')),
        brands:[...brands].sort((a,b)=>a.localeCompare(b,'pt-BR')),
        subcategories:Object.fromEntries(Object.entries(subcategories).map(([key,value])=>[key,[...value].sort((a,b)=>a.localeCompare(b,'pt-BR'))])),
        subsubs:Object.fromEntries(Object.entries(subsubs).map(([key,value])=>[key,[...value].sort((a,b)=>a.localeCompare(b,'pt-BR'))]))
      };
      fill($('#categorySelect'),state.options.categories,'Sem categoria / opcional');
      fill($('#brandSelect'),state.options.brands,'Sem marca / opcional');
      updateSubcategories();
      message('Categorias e marcas carregadas. Todos os campos são opcionais.','ok');
    }catch{
      fill($('#categorySelect'),[],'Sem categoria / opcional');
      fill($('#subcategorySelect'),[],'Sem subcategoria / opcional');
      fill($('#subsubcategorySelect'),[],'Sem subsubcategoria / opcional');
      fill($('#brandSelect'),[],'Sem marca / opcional');
      message('Não foi possível carregar as listas, mas o cadastro pode continuar sem esses campos.','error');
    }
  }

  function updateSubcategories(){
    const category=$('#categorySelect').value;
    fill($('#subcategorySelect'),state.options.subcategories[category]||[],'Sem subcategoria / opcional');
    updateSubsubs();
  }

  function updateSubsubs(){
    const key=`${$('#categorySelect').value}|||${$('#subcategorySelect').value}`;
    fill($('#subsubcategorySelect'),state.options.subsubs[key]||[],'Sem subsubcategoria / opcional');
  }

  function brandMode(mode){
    state.brandMode=mode;
    $('#genericBrandButton').classList.toggle('selected',mode==='generic');
    $('#newBrandButton').classList.toggle('selected',mode==='new');
    $('#newBrandInput').classList.toggle('hidden',mode!=='new');
    if(mode!=='select')$('#brandSelect').value='';
    if(mode==='new')$('#newBrandInput').focus();
    if(mode==='generic')message('Produto marcado como sem marca / genérico.','ok');
  }

  function selectedBrand(){
    if(state.brandMode==='generic')return {marca:'',marca_generica:true};
    if(state.brandMode==='new'){
      const marca=text($('#newBrandInput').value);
      return {marca,marca_generica:false};
    }
    return {marca:text($('#brandSelect').value),marca_generica:false};
  }

  function firstPhoto(){
    return state.photos.frente||state.photos.informacoes||state.photos.ean||'';
  }

  async function start(){
    if(state.busy)return;

    const basePhoto=firstPhoto();
    if(!basePhoto)return message('Envie pelo menos uma foto do produto para a IA conseguir trabalhar.','error');

    const categoria=text($('#categorySelect').value);
    const subcategoria=text($('#subcategorySelect').value);
    const subsubcategoria=text($('#subsubcategorySelect').value);
    const brand=selectedBrand();
    const ean=digits($('#eanInput').value);

    if(ean&&!validGtin(ean))return message('O EAN preenchido é inválido. Corrija ou deixe o campo vazio.','error');
    if(Object.values(state.photos).reduce((sum,value)=>sum+(value?.length||0),0)>5500000)return message('Fotos muito grandes. Tire novamente mais próximo.','error');

    state.busy=true;
    $('#submitButton').disabled=true;
    progress('recebido','Consultando cadastro existente.');

    try{
      const existing=await findExisting(ean);
      if(existing)throw new Error(`EAN já cadastrado: ${text(existing.nome)||'produto existente'}.`);

      const stamp=Date.now();
      const random=(crypto.randomUUID?.()||Math.random().toString(36).slice(2)).replace(/-/g,'').slice(0,9);
      state.jobId=`cad_${stamp}_${random}`;
      state.firebaseKey=`${stamp}_${random.slice(0,4)}`;

      const payload={
        acao:'cadastrar_produto_3_fotos_auto',
        versao:'2026-08-04-v7-opcional',
        job_id:state.jobId,
        firebase_key:state.firebaseKey,
        codigo_lido:ean,
        fotos:{
          frente:state.photos.frente||basePhoto,
          ean:state.photos.ean||basePhoto,
          informacoes:state.photos.informacoes||basePhoto
        },
        contexto:{
          categoria,
          subcategoria,
          subsubcategoria,
          marca:brand.marca,
          marca_generica:brand.marca_generica,
          preco_custo:Math.max(0,Number($('#costInput').value)||0),
          fornecedor:text($('#supplierInput').value),
          estoque:Math.max(0,Math.floor(Number($('#stockInput').value)||0)),
          gondola:text($('#gondolaInput').value),
          prateleira:text($('#shelfInput').value),
          localizacao:text($('#locationInput').value),
          observacoes:text($('#notesInput').value),
          validade_manual:text($('#validityInput').value),
          lote_manual:text($('#batchInput').value)
        },
        destinos:{
          firebase_url:state.settings.firebaseUrl.replace(/\/+$/,''),
          produtos_node:state.settings.productsNode,
          jobs_node:state.settings.jobsNode,
          github_owner:'osvaldosereia',
          github_repo:'SUCEDOAN12',
          github_branch:'main',
          github_images_path:'site/img/produtos_3'
        },
        regras:{situacao_inicial:'I',usar_preco_medio_web:true,ncm_confianca_minima:.7}
      };

      await request(dbUrl(`${state.settings.jobsNode}/${state.jobId}`),{
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          job_id:state.jobId,
          firebase_key:state.firebaseKey,
          status:'enviando',
          etapa:'recebido',
          mensagem:'Aguardando o Make.',
          criado_em:new Date().toISOString()
        })
      }).catch(()=>{});

      progress('identificando','Enviando as imagens ao Make.');
      const response=await fetch(state.settings.webhook||OFFICIAL_WEBHOOK,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({payload:JSON.stringify(payload)})
      });
      if(!response.ok)throw new Error(`Make retornou ${response.status}`);
      poll();
    }catch(error){
      state.busy=false;
      $('#submitButton').disabled=false;
      message(error.message||'Falha ao iniciar.','error');
      progress('recebido','Aguardando as fotos.');
    }
  }

  async function poll(attempt=0){
    try{
      const job=await request(dbUrl(`${state.settings.jobsNode}/${state.jobId}`,`p=${Date.now()}`),{},14000);
      if(job){
        progress(job.etapa||job.status,job.mensagem||job.message);
        if(['concluido','completed'].includes(job.status))return finish(job);
        if(['erro','failed'].includes(job.status))throw new Error(job.mensagem||'Erro no cenário.');
      }
    }catch(error){
      if(attempt>3&&/erro|falh|invalid|duplic/i.test(error.message)){
        state.busy=false;
        $('#submitButton').disabled=false;
        return message(error.message,'error');
      }
    }
    if(attempt>150){
      state.busy=false;
      $('#submitButton').disabled=false;
      return message('Tempo excedido. Verifique o Make.','error');
    }
    state.pollTimer=setTimeout(()=>poll(attempt+1),2800);
  }

  function finish(job){
    state.busy=false;
    $('#submitButton').disabled=false;
    progress('concluido',job.mensagem||'Produto salvo inativo.');
    $('#resultPanel').classList.add('show');
    $('#resultImage').src=job.imagem_url||'';
    $('#resultName').textContent=job.nome||'Produto cadastrado';
    $('#resultKey').textContent=`Firebase: ${job.firebase_key||state.firebaseKey}`;
    $('#resultPrice').textContent=money(job.preco_medio||job.preco);
    $('#resultNcm').textContent=job.ncm||job.ncm_sugerido||'—';
    $('#resultEan').textContent=job.gtin||'—';
    message('Produto salvo automaticamente como inativo.','ok');
  }

  function reset(){
    clearTimeout(state.pollTimer);
    state.busy=false;
    state.photos={frente:'',ean:'',informacoes:''};
    state.brandMode='select';
    $$('[data-photo]').forEach(element=>element.value='');
    $$('[data-preview]').forEach(element=>{element.hidden=true;element.removeAttribute('src')});
    $$('[data-card]').forEach(element=>element.classList.remove('done'));
    ['eanInput','costInput','supplierInput','gondolaInput','shelfInput','locationInput','notesInput','validityInput','batchInput','newBrandInput'].forEach(id=>$('#'+id).value='');
    $('#stockInput').value=0;
    $('#brandSelect').value='';
    $('#genericBrandButton').classList.remove('selected');
    $('#newBrandButton').classList.remove('selected');
    $('#newBrandInput').classList.add('hidden');
    $('#resultPanel').classList.remove('show');
    $('#submitButton').disabled=false;
    fill($('#categorySelect'),state.options.categories,'Sem categoria / opcional');
    updateSubcategories();
    progress('recebido','Aguardando as fotos.');
    scrollTo({top:0,behavior:'smooth'});
  }

  function openSettings(){
    $('#webhookInput').value=state.settings.webhook||OFFICIAL_WEBHOOK;
    $('#firebaseInput').value=state.settings.firebaseUrl;
    $('#productsNodeInput').value=state.settings.productsNode;
    $('#jobsNodeInput').value=state.settings.jobsNode;
    $('#authInput').value=state.settings.auth;
    $('#settingsDialog').showModal();
  }

  function saveSettings(){
    state.settings={
      webhook:$('#webhookInput').value.trim()||OFFICIAL_WEBHOOK,
      firebaseUrl:$('#firebaseInput').value.trim().replace(/\/+$/,'')||DEFAULTS.firebaseUrl,
      productsNode:$('#productsNodeInput').value.trim().replace(/^\/+|\/+$/g,'')||'produtos',
      jobsNode:$('#jobsNodeInput').value.trim().replace(/^\/+|\/+$/g,'')||'cadastros_ia_jobs',
      auth:$('#authInput').value.trim()
    };
    localStorage.setItem(SETTINGS_KEY,JSON.stringify(state.settings));
    $('#settingsDialog').close();
    message('Configuração salva.','ok');
    loadOptions();
  }

  document.addEventListener('change',event=>{
    if(event.target.matches('[data-photo]'))handlePhoto(event.target);
  });
  $('#submitButton').onclick=start;
  $('#resetButton').onclick=reset;
  $('#againButton').onclick=reset;
  $('#settingsButton').onclick=openSettings;
  $('#closeSettingsButton').onclick=()=>$('#settingsDialog').close();
  $('#saveSettingsButton').onclick=saveSettings;
  $('#eanInput').oninput=event=>event.target.value=digits(event.target.value).slice(0,14);
  $('#categorySelect').onchange=updateSubcategories;
  $('#subcategorySelect').onchange=updateSubsubs;
  $('#brandSelect').onchange=()=>{if($('#brandSelect').value)brandMode('select')};
  $('#genericBrandButton').onclick=()=>brandMode('generic');
  $('#newBrandButton').onclick=()=>brandMode('new');

  const online=()=>$('#offline').classList.toggle('show',!navigator.onLine);
  addEventListener('online',online);
  addEventListener('offline',online);
  online();
  progress('recebido','Aguardando as fotos.');
  loadOptions();
})();