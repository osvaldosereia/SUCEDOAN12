(()=>{
  'use strict';

  const OFFICIAL_WEBHOOK=window.__DA_CADASTRO_WEBHOOK__||'https://hook.eu1.make.com/ly4ycpajxdvjuk2yuakhv44qqqq8cm63';
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
    frontPhoto:'',
    busy:false,
    jobId:'',
    firebaseKey:'',
    pollTimer:null,
    genericBrand:false
  };

  function loadSettings(){
    try{return {...DEFAULTS,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}}
    catch{return {...DEFAULTS}}
  }

  const text=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
  const digits=value=>String(value??'').replace(/\D/g,'');
  const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

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
    if(type==='ok')setTimeout(()=>element.classList.remove('show'),5000);
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
        item.onerror=()=>reject(new Error('Não foi possível abrir a foto.'));
        item.src=source;
      });
      const max=1200;
      const scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d',{alpha:false});
      context.fillStyle='#fff';
      context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(image,0,0,canvas.width,canvas.height);
      let quality=.72;
      let data=canvas.toDataURL('image/jpeg',quality);
      while(data.length>1100000&&quality>.44){
        quality-=.07;
        data=canvas.toDataURL('image/jpeg',quality);
      }
      return data;
    }finally{
      URL.revokeObjectURL(source);
    }
  }

  async function readBarcode(file){
    if(!('BarcodeDetector' in window))return {code:'',unsupported:true};
    try{
      const detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','code_128','itf']});
      const bitmap=await createImageBitmap(file);
      const results=await detector.detect(bitmap);
      if(bitmap.close)bitmap.close();
      const valid=(results||[])
        .map(item=>digits(item.rawValue))
        .find(code=>validGtin(code));
      return {code:valid||'',unsupported:false};
    }catch{
      return {code:'',unsupported:false};
    }
  }

  function showPreview(key,fileOrData,isObjectUrl=false){
    const preview=$(`[data-preview="${key}"]`);
    if(isObjectUrl){
      const url=URL.createObjectURL(fileOrData);
      preview.onload=()=>URL.revokeObjectURL(url);
      preview.src=url;
    }else{
      preview.src=fileOrData;
    }
    preview.hidden=false;
    $(`[data-card="${key}"]`).classList.add('done');
  }

  async function handlePhoto(input){
    const key=input.dataset.photo;
    const file=input.files?.[0];
    if(!file)return;

    if(key==='ean'){
      message('Lendo o EAN somente neste aparelho...');
      showPreview('ean',file,true);
      const result=await readBarcode(file);
      if(result.code){
        $('#eanInput').value=result.code;
        message('EAN preenchido. A foto do código não será enviada.','ok');
      }else if(result.unsupported){
        message('Este navegador não oferece leitura automática. Digite o EAN; a foto não foi enviada.','error');
      }else{
        message('Não consegui ler o EAN. Tire outra foto ou digite o código; a imagem não foi enviada.','error');
      }
      input.value='';
      return;
    }

    message('Otimizando a única foto que será enviada...');
    try{
      const data=await compress(file);
      state.frontPhoto=data;
      showPreview('frente',data);
      message('Foto da frente pronta.','ok');
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
    return null;
  }

  function toggleGenericBrand(force){
    state.genericBrand=typeof force==='boolean'?force:!state.genericBrand;
    const input=$('#brandInput');
    const button=$('#genericBrandButton');
    button.classList.toggle('selected',state.genericBrand);
    button.textContent=state.genericBrand?'Genérico marcado ✓':'Marcar como genérico';
    input.disabled=state.genericBrand;
    if(state.genericBrand)input.value='';
  }

  async function start(){
    if(state.busy)return;
    if(!state.frontPhoto)return message('Tire a foto da frente do produto. Ela é a única foto enviada à IA.','error');

    const ean=digits($('#eanInput').value);
    if(ean&&!validGtin(ean))return message('O EAN preenchido é inválido. Corrija ou deixe vazio.','error');
    if(state.frontPhoto.length>1400000)return message('A foto ficou muito grande. Tire novamente mais próximo do produto.','error');

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
        acao:'cadastrar_produto_1_foto_auto',
        versao:'2026-08-04-v8-1-foto',
        job_id:state.jobId,
        firebase_key:state.firebaseKey,
        codigo_lido:ean,
        fotos:{frente:state.frontPhoto},
        contexto:{
          marca:state.genericBrand?'':text($('#brandInput').value),
          marca_generica:state.genericBrand,
          comentario_ia:text($('#notesInput').value),
          preco_custo:Math.max(0,Number($('#costInput').value)||0),
          fornecedor:text($('#supplierInput').value),
          estoque:Math.max(0,Math.floor(Number($('#stockInput').value)||0)),
          gondola:text($('#gondolaInput').value),
          prateleira:text($('#shelfInput').value),
          localizacao:text($('#locationInput').value),
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

      progress('identificando','Enviando uma foto ao Make.');
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
      progress('recebido','Aguardando a foto da frente.');
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
    state.frontPhoto='';
    state.jobId='';
    state.firebaseKey='';
    toggleGenericBrand(false);
    $$('[data-photo]').forEach(element=>element.value='');
    $$('[data-preview]').forEach(element=>{element.hidden=true;element.removeAttribute('src')});
    $$('[data-card]').forEach(element=>element.classList.remove('done'));
    ['eanInput','costInput','supplierInput','gondolaInput','shelfInput','locationInput','notesInput','validityInput','batchInput','brandInput'].forEach(id=>$('#'+id).value='');
    $('#stockInput').value=0;
    $('#resultPanel').classList.remove('show');
    $('#submitButton').disabled=false;
    progress('recebido','Aguardando a foto da frente.');
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
  $('#genericBrandButton').onclick=()=>toggleGenericBrand();

  const online=()=>$('#offline').classList.toggle('show',!navigator.onLine);
  addEventListener('online',online);
  addEventListener('offline',online);
  online();
  progress('recebido','Aguardando a foto da frente.');
})();