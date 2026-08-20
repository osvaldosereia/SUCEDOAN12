(()=>{
  'use strict';

  const OFFICIAL_WEBHOOK=window.__DA_CADASTRO_WEBHOOK__||'https://hook.eu1.make.com/ly4ycpajxdvjuk2yuakhv44qqqq8cm63';
  const DEFAULTS={
    firebaseUrl:'https://cedar-chemist-310801-default-rtdb.firebaseio.com',
    productsNode:'produtos',
    jobsNode:'cadastros_ia_jobs',
    auth:'',
    webhook:OFFICIAL_WEBHOOK,
    githubToken:'',
    githubOwner:'osvaldosereia',
    githubRepo:'SUCEDOAN12',
    githubBranch:'main'
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
    genericBrand:false,
    mode:'lookup',
    lookupEan:'',
    existingKey:'',
    existingProduct:null,
    stream:null,
    detector:null,
    scanning:false,
    scanTimer:null,
    lastCreated:null
  };

  function loadSettings(){
    try{
      const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');
      const admin=JSON.parse(localStorage.getItem('da_admin_v2_config')||'{}');
      return {
        ...DEFAULTS,
        ...saved,
        githubToken:saved.githubToken||admin.githubToken||'',
        githubOwner:saved.githubOwner||admin.githubOwner||DEFAULTS.githubOwner,
        githubRepo:saved.githubRepo||admin.githubRepo||DEFAULTS.githubRepo,
        githubBranch:saved.githubBranch||admin.githubBranch||DEFAULTS.githubBranch
      };
    }catch{return {...DEFAULTS}}
  }

  const text=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
  const digits=value=>String(value??'').replace(/\D/g,'');
  const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const number=value=>Math.max(0,Math.floor(Number(value)||0));

  function dbUrl(path,query=''){
    const base=state.settings.firebaseUrl.replace(/\/+$/,'');
    const auth=state.settings.auth?'auth='+encodeURIComponent(state.settings.auth):'';
    const params=[query,auth].filter(Boolean).join('&');
    const clean=String(path||'').replace(/^\/+|\/+$/g,'');
    return base+'/'+clean+'.json'+(params?'?'+params:'');
  }

  async function request(url,options={},timeout=30000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetch(url,{cache:'no-store',...options,signal:controller.signal});
      const body=await response.text();
      if(!response.ok)throw new Error('HTTP '+response.status+(body?' · '+body.slice(0,180):''));
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
    element.className='message show '+type;
    if(type==='ok')setTimeout(()=>element.classList.remove('show'),5000);
  }

  function validGtin(value){
    const code=digits(value);
    if(![8,12,13,14].includes(code.length))return false;
    const total=code.slice(0,-1).split('').reverse().reduce((sum,item,index)=>sum+Number(item)*(index%2?1:3),0);
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

  function barcodeFormats(){
    return ['ean_13','ean_8','upc_a','upc_e','code_128','itf'];
  }

  async function readBarcode(file){
    if(!('BarcodeDetector' in window)||!window.createImageBitmap)return {code:'',unsupported:true};
    try{
      const detector=new BarcodeDetector({formats:barcodeFormats()});
      const bitmap=await createImageBitmap(file);
      const results=await detector.detect(bitmap);
      if(bitmap.close)bitmap.close();
      const valid=(results||[]).map(item=>digits(item.rawValue)).find(code=>validGtin(code));
      return {code:valid||'',unsupported:false};
    }catch{
      return {code:'',unsupported:false};
    }
  }

  function showPreview(key,fileOrData,isObjectUrl=false){
    const preview=$('[data-preview="'+key+'"]');
    if(!preview)return;
    if(isObjectUrl){
      const url=URL.createObjectURL(fileOrData);
      preview.onload=()=>URL.revokeObjectURL(url);
      preview.src=url;
    }else{
      preview.src=fileOrData;
    }
    preview.hidden=false;
    const card=$('[data-card="'+key+'"]');
    if(card)card.classList.add('done');
  }

  async function handlePhoto(input){
    const file=input.files?.[0];
    if(!file)return;
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
    const code=digits(ean);
    if(!code)return null;
    let successfulQueries=0;
    let lastError=null;
    const candidates=[code];
    const numeric=Number(code);
    if(Number.isSafeInteger(numeric))candidates.push(numeric);
    for(const field of ['gtin','ean','codigo']){
      for(const candidate of candidates){
        const query='orderBy='+encodeURIComponent(JSON.stringify(field))+'&equalTo='+encodeURIComponent(JSON.stringify(candidate));
        try{
          const data=await request(dbUrl(state.settings.productsNode,query));
          successfulQueries+=1;
          const entry=data&&Object.entries(data)[0];
          if(entry)return {key:entry[0],product:entry[1]};
        }catch(error){
          lastError=error;
        }
      }
    }
    if(!successfulQueries)throw new Error('Não foi possível consultar o Firebase. '+(lastError?.message||''));
    return null;
  }

  function stopScanner(){
    state.scanning=false;
    clearTimeout(state.scanTimer);
    state.scanTimer=null;
    if(state.stream){
      try{state.stream.getTracks().forEach(track=>track.stop())}catch{}
      state.stream=null;
    }
    const video=$('#scannerVideo');
    if(video)video.srcObject=null;
    $('#cameraBox').hidden=true;
    $('#openScannerButton').textContent='📷 Ler com a câmera';
  }

  async function openScanner(){
    if(state.scanning){
      stopScanner();
      return;
    }
    if(!navigator.mediaDevices?.getUserMedia||!window.BarcodeDetector){
      $('#barcodePhotoInput').click();
      message('Este navegador não oferece leitura ao vivo. A câmera para fotografar o código foi aberta.','error');
      return;
    }
    try{
      $('#cameraBox').hidden=false;
      $('#lookupHint').textContent='Abrindo a câmera traseira…';
      const stream=await navigator.mediaDevices.getUserMedia({
        video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},
        audio:false
      });
      state.stream=stream;
      const video=$('#scannerVideo');
      video.srcObject=stream;
      await video.play();
      state.detector=new BarcodeDetector({formats:barcodeFormats()});
      state.scanning=true;
      $('#openScannerButton').textContent='Fechar câmera';
      $('#lookupHint').textContent='Aponte o código para o centro do quadro.';
      scanFrame();
    }catch(error){
      stopScanner();
      $('#barcodePhotoInput').click();
      message('Não foi possível abrir a leitura ao vivo. Use a foto do código ou digite o EAN.','error');
    }
  }

  async function scanFrame(){
    if(!state.scanning||!state.detector)return;
    const video=$('#scannerVideo');
    if(video.readyState>=2){
      try{
        const results=await state.detector.detect(video);
        const code=(results||[]).map(item=>digits(item.rawValue)).find(item=>validGtin(item));
        if(code){
          $('#eanInput').value=code;
          if(navigator.vibrate)navigator.vibrate(70);
          stopScanner();
          await consultEan(code);
          return;
        }
      }catch{}
    }
    state.scanTimer=setTimeout(scanFrame,250);
  }

  async function handleBarcodePhoto(file){
    if(!file)return;
    message('Lendo o código na foto…');
    const result=await readBarcode(file);
    if(result.code){
      $('#eanInput').value=result.code;
      await consultEan(result.code);
    }else if(result.unsupported){
      message('Este navegador não lê o código automaticamente. Digite os números e toque em Consultar.','error');
    }else{
      message('Não consegui ler o código. Tire outra foto ou digite os números.','error');
    }
  }

  function productImage(product){
    return text(product?.url_imagem||product?.imagem_url||product?.imagem||(Array.isArray(product?.imagens)?product.imagens[0]:''));
  }

  function setMode(mode){
    state.mode=mode;
    $('#existingProductPanel').hidden=mode!=='existing';
    $('#newProductPanel').hidden=mode!=='new'&&mode!=='result';
    if(mode==='lookup'){
      state.lookupEan='';
      state.existingKey='';
      state.existingProduct=null;
      $('#lookupHint').textContent='Primeiro leia ou digite o código. A foto da frente só será solicitada se o produto não existir.';
    }
  }

  function showExisting(found,ean){
    state.lookupEan=ean;
    state.existingKey=found.key;
    state.existingProduct=found.product;
    setMode('existing');
    const product=found.product||{};
    $('#existingProductImage').src=productImage(product)||'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="100%" height="100%" fill="#f3f3f3"/><text x="50%" y="50%" text-anchor="middle" fill="#888" font-family="Arial">sem foto</text></svg>');
    $('#existingProductName').textContent=text(product.nome||product.titulo)||'Produto cadastrado';
    $('#existingProductMeta').textContent=[ean,text(product.marca),text(product.embalagem)].filter(Boolean).join(' · ');
    $('#existingCurrentStock').textContent=String(number(product.estoque));
    $('#existingStockInput').value=number(product.estoque);
    $('#lookupHint').textContent='Produto encontrado. Atualize o estoque abaixo.';
    message('Produto encontrado no Firebase.','ok');
    setTimeout(()=>{$('#existingStockInput').focus();$('#existingStockInput').select()},100);
  }

  function showNew(ean){
    state.lookupEan=ean;
    state.existingKey='';
    state.existingProduct=null;
    setMode('new');
    $('#lookupHint').textContent='Código não encontrado. Continue com a foto da frente.';
    progress('recebido','Aguardando a foto da frente.');
    message('Produto não cadastrado. Tire a foto da frente para continuar.','ok');
    setTimeout(()=>$('[data-photo="frente"]')?.focus(),100);
  }

  async function consultEan(forced=''){
    if(state.busy)return;
    const ean=digits(forced||$('#eanInput').value);
    $('#eanInput').value=ean;
    if(!validGtin(ean))return message('Digite ou leia um EAN válido com 8, 12, 13 ou 14 números.','error');
    state.busy=true;
    $('#checkEanButton').disabled=true;
    $('#openScannerButton').disabled=true;
    $('#lookupHint').textContent='Consultando o Firebase…';
    try{
      const found=await findExisting(ean);
      if(found)showExisting(found,ean);
      else showNew(ean);
    }catch(error){
      setMode('lookup');
      message(error.message||'Não foi possível consultar o Firebase.','error');
    }finally{
      state.busy=false;
      $('#checkEanButton').disabled=false;
      $('#openScannerButton').disabled=false;
    }
  }

  async function updateExistingStock(){
    if(state.busy||!state.existingKey)return;
    const stock=number($('#existingStockInput').value);
    if(!confirm('Atualizar o estoque total de "'+text(state.existingProduct?.nome||'produto')+'" para '+stock+' unidade(s)?'))return;
    state.busy=true;
    $('#updateStockButton').disabled=true;
    try{
      const now=new Date();
      await request(dbUrl(state.settings.productsNode+'/'+state.existingKey),{
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          estoque:stock,
          last_update:now.getTime(),
          updated_at:now.toISOString(),
          stock_updated_at:now.toISOString(),
          contagem_origem:'cadastro_mobile_consulta_v10'
        })
      });
      state.existingProduct.estoque=stock;
      $('#existingCurrentStock').textContent=String(stock);
      if(navigator.vibrate)navigator.vibrate([60,40,60]);
      message('Estoque atualizado com sucesso.','ok');
    }catch(error){
      message('Não foi possível atualizar o estoque: '+(error.message||error),'error');
    }finally{
      state.busy=false;
      $('#updateStockButton').disabled=false;
    }
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
    const ean=digits($('#eanInput').value);
    if(state.mode!=='new'||state.lookupEan!==ean)return message('Consulte primeiro o código de barras no Firebase.','error');
    if(!state.frontPhoto)return message('Tire a foto da frente do produto. Ela é a única foto enviada à IA.','error');
    if(!validGtin(ean))return message('O EAN preenchido é inválido. Consulte novamente.','error');
    if(state.frontPhoto.length>1400000)return message('A foto ficou muito grande. Tire novamente mais próximo do produto.','error');

    state.busy=true;
    $('#submitButton').disabled=true;
    progress('recebido','Confirmando que o código continua disponível.');

    try{
      const existing=await findExisting(ean);
      if(existing){
        showExisting(existing,ean);
        throw new Error('O produto foi cadastrado enquanto esta tela estava aberta. Atualize o estoque no cadastro existente.');
      }

      const stamp=Date.now();
      const random=(crypto.randomUUID?.()||Math.random().toString(36).slice(2)).replace(/-/g,'').slice(0,9);
      state.jobId='cad_'+stamp+'_'+random;
      state.firebaseKey=stamp+'_'+random.slice(0,4);

      const payload={
        acao:'cadastrar_produto_1_foto_auto',
        versao:'2026-08-20-v10-barcode-first',
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
          estoque:number($('#stockInput').value),
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
          github_owner:state.settings.githubOwner,
          github_repo:state.settings.githubRepo,
          github_branch:state.settings.githubBranch,
          github_images_path:'site/img/produtos_3'
        },
        regras:{situacao_inicial:'I',usar_preco_medio_web:true,ncm_confianca_minima:.7}
      };

      await request(dbUrl(state.settings.jobsNode+'/'+state.jobId),{
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
      if(!response.ok)throw new Error('Make retornou '+response.status);
      poll();
    }catch(error){
      state.busy=false;
      $('#submitButton').disabled=false;
      message(error.message||'Falha ao iniciar.','error');
      if(state.mode==='new')progress('recebido','Aguardando a foto da frente.');
    }
  }

  async function poll(attempt=0){
    try{
      const job=await request(dbUrl(state.settings.jobsNode+'/'+state.jobId,'p='+Date.now()),{},14000);
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

  async function finish(job){
    state.busy=false;
    $('#submitButton').disabled=false;
    const key=text(job.firebase_key||state.firebaseKey);
    const product=await request(dbUrl(state.settings.productsNode+'/'+key)).catch(()=>null);
    state.firebaseKey=key;
    state.lastCreated={
      firebaseKey:key,
      jobId:state.jobId,
      job:{...job},
      product:product||{},
      name:text(job.nome||product?.nome||'Produto cadastrado')
    };
    state.mode='result';
    progress('concluido',job.mensagem||'Produto salvo inativo.');
    $('#resultPanel').classList.add('show');
    $('#resultImage').src=job.imagem_url||productImage(product)||'';
    $('#resultName').textContent=state.lastCreated.name;
    $('#resultKey').textContent='Firebase: '+key;
    $('#resultPrice').textContent=money(job.preco_medio||job.preco||product?.preco);
    $('#resultNcm').textContent=job.ncm||job.ncm_sugerido||product?.ncm||'—';
    $('#resultEan').textContent=job.gtin||product?.gtin||state.lookupEan||'—';
    message('Produto salvo automaticamente como inativo. Revise ou apague este cadastro.','ok');
  }

  function imagePathFromUrl(value){
    const raw=text(value);
    if(!raw)return '';
    if(!/^https?:/i.test(raw))return raw.replace(/^\/+/,'');
    try{
      const url=new URL(raw);
      const parts=url.pathname.split('/').filter(Boolean);
      if(url.hostname==='raw.githubusercontent.com'&&parts.length>=4){
        return decodeURIComponent(parts.slice(3).join('/'));
      }
      if(/github\.com$/i.test(url.hostname)&&parts.length>=5&&['blob','raw'].includes(parts[2])){
        return decodeURIComponent(parts.slice(4).join('/'));
      }
      if(url.hostname===state.settings.githubOwner.toLowerCase()+'.github.io'&&parts[0]===state.settings.githubRepo){
        return decodeURIComponent(parts.slice(1).join('/'));
      }
      if(url.hostname==='cdn.jsdelivr.net'&&parts[0]==='gh'&&parts.length>=4){
        return decodeURIComponent(parts.slice(3).join('/'));
      }
    }catch{}
    return '';
  }

  function imagePaths(record){
    const values=[];
    const add=value=>{
      if(Array.isArray(value))value.forEach(add);
      else if(value)values.push(value);
    };
    const job=record?.job||{};
    const product=record?.product||{};
    ['imagem_path','image_path','github_path','imagem_url','url_imagem','imagem'].forEach(key=>{add(job[key]);add(product[key])});
    add(job.imagens);
    add(product.imagens);
    return [...new Set(values.map(imagePathFromUrl).filter(path=>path&&path.startsWith('site/')))];
  }

  async function githubFile(pathValue,options={}){
    const owner=encodeURIComponent(state.settings.githubOwner);
    const repo=encodeURIComponent(state.settings.githubRepo);
    const path=pathValue.split('/').map(encodeURIComponent).join('/');
    const token=state.settings.githubToken;
    const response=await fetch('https://api.github.com/repos/'+owner+'/'+repo+'/contents/'+path+(options.method?'':'?ref='+encodeURIComponent(state.settings.githubBranch)),{
      method:options.method||'GET',
      headers:{
        Accept:'application/vnd.github+json',
        Authorization:'Bearer '+token,
        'Content-Type':'application/json',
        'X-GitHub-Api-Version':'2022-11-28'
      },
      body:options.body?JSON.stringify(options.body):undefined
    });
    if(response.status===404)return null;
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new Error('GitHub retornou '+response.status+(data?.message?' · '+data.message:''));
    return data;
  }

  async function deleteGithubImage(path){
    const file=await githubFile(path);
    if(!file?.sha)return;
    await githubFile(path,{
      method:'DELETE',
      body:{
        message:'Remove imagem de cadastro móvel excluído',
        sha:file.sha,
        branch:state.settings.githubBranch
      }
    });
  }

  async function deleteRegistration(){
    if(state.busy||!state.lastCreated)return;
    const record=state.lastCreated;
    const paths=imagePaths(record);
    if(paths.length&&!state.settings.githubToken){
      message('Para apagar também a foto, informe o token GitHub nas configurações. Nada foi excluído.','error');
      openSettings();
      return;
    }
    const confirmed=confirm('Apagar definitivamente "'+record.name+'" do Firebase e remover '+paths.length+' foto(s) do GitHub? Esta ação não pode ser desfeita.');
    if(!confirmed)return;

    state.busy=true;
    const button=$('#deleteRegistrationButton');
    button.disabled=true;
    button.textContent='Apagando cadastro e foto…';
    try{
      for(const path of paths)await deleteGithubImage(path);
      const patch={};
      patch[state.settings.productsNode+'/'+record.firebaseKey]=null;
      if(record.jobId)patch[state.settings.jobsNode+'/'+record.jobId]=null;
      await request(dbUrl(''),{
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(patch)
      });
      state.lastCreated=null;
      reset();
      message('Cadastro, job e foto apagados do sistema.','ok');
    }catch(error){
      message('A exclusão não foi concluída: '+(error.message||error),'error');
    }finally{
      state.busy=false;
      button.disabled=false;
      button.textContent='Apagar cadastro e foto';
    }
  }

  function reset(){
    clearTimeout(state.pollTimer);
    stopScanner();
    state.busy=false;
    state.frontPhoto='';
    state.jobId='';
    state.firebaseKey='';
    state.lastCreated=null;
    toggleGenericBrand(false);
    $$('[data-photo]').forEach(element=>element.value='');
    $$('[data-preview]').forEach(element=>{element.hidden=true;element.removeAttribute('src')});
    $$('[data-card]').forEach(element=>element.classList.remove('done'));
    ['eanInput','costInput','supplierInput','gondolaInput','shelfInput','locationInput','notesInput','validityInput','batchInput','brandInput','existingStockInput'].forEach(id=>{const element=$('#'+id);if(element)element.value=''});
    $('#stockInput').value=0;
    $('#resultPanel').classList.remove('show');
    $('#submitButton').disabled=false;
    setMode('lookup');
    progress('recebido','Aguardando a foto da frente.');
    scrollTo({top:0,behavior:'smooth'});
  }

  function openSettings(){
    $('#webhookInput').value=state.settings.webhook||OFFICIAL_WEBHOOK;
    $('#firebaseInput').value=state.settings.firebaseUrl;
    $('#productsNodeInput').value=state.settings.productsNode;
    $('#jobsNodeInput').value=state.settings.jobsNode;
    $('#authInput').value=state.settings.auth;
    $('#githubTokenInput').value=state.settings.githubToken||'';
    $('#settingsDialog').showModal();
  }

  function saveSettings(){
    state.settings={
      ...state.settings,
      webhook:$('#webhookInput').value.trim()||OFFICIAL_WEBHOOK,
      firebaseUrl:$('#firebaseInput').value.trim().replace(/\/+$/,'')||DEFAULTS.firebaseUrl,
      productsNode:$('#productsNodeInput').value.trim().replace(/^\/+|\/+$/g,'')||'produtos',
      jobsNode:$('#jobsNodeInput').value.trim().replace(/^\/+|\/+$/g,'')||'cadastros_ia_jobs',
      auth:$('#authInput').value.trim(),
      githubToken:$('#githubTokenInput').value.trim(),
      githubOwner:state.settings.githubOwner||DEFAULTS.githubOwner,
      githubRepo:state.settings.githubRepo||DEFAULTS.githubRepo,
      githubBranch:state.settings.githubBranch||DEFAULTS.githubBranch
    };
    localStorage.setItem(SETTINGS_KEY,JSON.stringify(state.settings));
    $('#settingsDialog').close();
    message('Configuração salva neste aparelho.','ok');
  }

  document.addEventListener('change',event=>{
    if(event.target.matches('[data-photo]'))handlePhoto(event.target);
  });
  $('#submitButton').onclick=start;
  $('#resetButton').onclick=reset;
  $('#againButton').onclick=reset;
  $('#openScannerButton').onclick=openScanner;
  $('#closeScannerButton').onclick=stopScanner;
  $('#checkEanButton').onclick=()=>consultEan();
  $('#updateStockButton').onclick=updateExistingStock;
  $('#existingAnotherButton').onclick=reset;
  $('#deleteRegistrationButton').onclick=deleteRegistration;
  $('#settingsButton').onclick=openSettings;
  $('#closeSettingsButton').onclick=()=>$('#settingsDialog').close();
  $('#saveSettingsButton').onclick=saveSettings;
  $('#eanInput').oninput=event=>{
    event.target.value=digits(event.target.value).slice(0,14);
    if(state.lookupEan&&state.lookupEan!==event.target.value)setMode('lookup');
  };
  $('#eanInput').onkeydown=event=>{
    if(event.key==='Enter'){event.preventDefault();consultEan()}
  };
  $('#barcodePhotoInput').onchange=async event=>{
    const file=event.target.files?.[0];
    event.target.value='';
    await handleBarcodePhoto(file);
  };
  $('#genericBrandButton').onclick=()=>toggleGenericBrand();

  const online=()=>$('#offline').classList.toggle('show',!navigator.onLine);
  addEventListener('online',online);
  addEventListener('offline',online);
  addEventListener('beforeunload',stopScanner);
  online();
  setMode('lookup');
  progress('recebido','Aguardando a foto da frente.');
})();