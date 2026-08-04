(function(){
  'use strict';

  var DEFAULT_FIREBASE='https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  var DEFAULT_NODE='produtos';
  var PLACEHOLDER="data:image/svg+xml;charset=UTF-8,"+encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><rect width='100%' height='100%' fill='#f4f1ea'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#999' font-family='Arial' font-size='18'>sem foto</text></svg>");
  var STORAGE_SETTINGS='da_contagem_settings_v1';
  var STORAGE_SESSION='da_contagem_session_v1';
  var CATALOG_TTL=300000;
  var settings=loadSettings();
  var state={
    key:'',product:null,original:null,stream:null,detector:null,scanning:false,scanTimer:null,
    catalog:null,catalogAt:0,catalogLoading:false,searchId:0,recent:loadSession().recent||[],
    count:loadSession().count||0,saving:false
  };

  function $(id){return document.getElementById(id);}
  function trim(value){return String(value==null?'':value).replace(/\s+/g,' ').trim();}
  function digits(value){return String(value==null?'':value).replace(/\D/g,'');}
  function norm(value){return trim(value).toUpperCase();}
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});}
  function clone(value){return JSON.parse(JSON.stringify(value||{}));}
  function num(value){
    if(typeof value==='number'&&isFinite(value))return value;
    var s=trim(value).replace(/[^\d,.-]/g,'');
    var comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');
    if(comma>-1&&dot>-1)s=comma>dot?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
    else if(comma>-1)s=s.replace(/\./g,'').replace(',','.');
    var n=Number(s);return isFinite(n)?n:0;
  }
  function money(value){return num(value).toFixed(2).replace('.',',');}
  function loadSettings(){
    var base={firebaseUrl:DEFAULT_FIREBASE,productsNode:DEFAULT_NODE,auth:''};
    try{
      var old=JSON.parse(localStorage.getItem('da_cadastro_mobile_settings_v1')||'{}');
      var cad=JSON.parse(localStorage.getItem('da_cadastro_ia_v6_settings')||'{}');
      var own=JSON.parse(localStorage.getItem(STORAGE_SETTINGS)||'{}');
      var merged={};
      [base,old,cad,own].forEach(function(obj){Object.keys(obj||{}).forEach(function(k){merged[k]=obj[k];});});
      return{
        firebaseUrl:trim(merged.firebaseUrl||DEFAULT_FIREBASE).replace(/\/+$/,''),
        productsNode:trim(merged.productsNode||merged.produtosNode||DEFAULT_NODE).replace(/^\/+|\/+$/g,''),
        auth:trim(merged.auth||merged.firebaseAuth||'')
      };
    }catch(e){return base;}
  }
  function loadSession(){try{return JSON.parse(localStorage.getItem(STORAGE_SESSION)||'{}');}catch(e){return {};}}
  function saveSession(){localStorage.setItem(STORAGE_SESSION,JSON.stringify({count:state.count,recent:state.recent.slice(0,10)}));}
  function setStatus(text,type){var el=$('status');el.textContent=text;el.className='status '+(type||'warn');}
  function busy(show,text){$('busyText').textContent=text||'Carregando...';$('busy').className=show?'busy show':'busy';}
  function firebaseUrl(path,query){
    var url=settings.firebaseUrl.replace(/\/+$/,'')+'/'+String(path||'').replace(/^\/+|\/+$/g,'')+'.json';
    var parts=[];
    if(query)Object.keys(query).forEach(function(k){if(query[k]!==''&&query[k]!=null)parts.push(encodeURIComponent(k)+'='+encodeURIComponent(String(query[k])));});
    if(settings.auth)parts.push('auth='+encodeURIComponent(settings.auth));
    return url+(parts.length?'?'+parts.join('&'):'');
  }
  function xhr(method,url,data,callback){
    var request=new XMLHttpRequest(),ended=false;
    var timer=setTimeout(function(){if(ended)return;ended=true;try{request.abort();}catch(e){}callback(new Error('Tempo esgotado.'));},18000);
    request.open(method,url,true);request.setRequestHeader('Accept','application/json');
    if(data!=null)request.setRequestHeader('Content-Type','application/json');
    request.onreadystatechange=function(){
      if(request.readyState!==4||ended)return;ended=true;clearTimeout(timer);
      var parsed=null;try{parsed=request.responseText?JSON.parse(request.responseText):null;}catch(e){parsed=request.responseText;}
      if(request.status>=200&&request.status<300)callback(null,parsed);else callback(new Error((parsed&&parsed.error)||('Erro '+request.status)));
    };
    request.onerror=function(){if(ended)return;ended=true;clearTimeout(timer);callback(new Error('Falha de conexão.'));};
    request.send(data==null?null:JSON.stringify(data));
  }
  function productUrl(key){return firebaseUrl(settings.productsNode+'/'+encodeURIComponent(key));}
  function imageOf(product){return trim(product&&(product.url_imagem||product.imagem_url||product.imagem||product.image||product.foto))||PLACEHOLDER;}
  function nameOf(product){return trim(product&&(product.nome||product.titulo||product.descricao||product.codigo))||'Produto sem nome';}
  function codeOf(product){return trim(product&&(product.gtin||product.ean||product.codigo||product.sku));}

  function codeVariants(value){
    var normalized=norm(value),list=[];if(!normalized)return list;list.push(normalized);
    if(/^\d+$/.test(normalized)){
      if(normalized.length===12)list.push('0'+normalized);
      if(normalized.length===13&&normalized.charAt(0)==='0')list.push(normalized.slice(1));
      var nozero=normalized.replace(/^0+(?=\d)/,'');if(nozero)list.push(nozero);
    }
    return list.filter(function(v,i,a){return a.indexOf(v)===i;});
  }
  function matchesCode(product,key,variants){
    var values=[key,product&&product.firebaseKey,product&&product.id,product&&product.codigo,product&&product.sku,product&&product.gtin,product&&product.ean];
    var aliases=[];
    [product&&product.eans_alternativos,product&&product.ean_aliases].forEach(function(source){
      if(Array.isArray(source))aliases=aliases.concat(source);
      else if(source&&typeof source==='object')aliases=aliases.concat(Object.keys(source).map(function(k){return source[k];}));
      else if(source)aliases=aliases.concat(String(source).split(/[,;|\s]+/));
    });
    values=values.concat(aliases);
    return values.some(function(value){return variants.indexOf(norm(value))>-1;});
  }
  function queryField(field,value,callback){
    xhr('GET',firebaseUrl(settings.productsNode,{orderBy:JSON.stringify(field),equalTo:JSON.stringify(value),limitToFirst:1}),null,function(error,data){
      if(error)return callback(error);var keys=data&&typeof data==='object'?Object.keys(data):[];
      if(!keys.length)return callback(null,null);callback(null,{key:keys[0],product:data[keys[0]]});
    });
  }
  function findByCode(raw,callback){
    var variants=codeVariants(raw);if(!variants.length)return callback(null,null);
    var direct=variants.slice(),fields=['gtin','ean','codigo','sku'];
    function directNext(){
      if(!direct.length)return queryNext(0,0);
      var key=direct.shift();
      xhr('GET',productUrl(key),null,function(error,product){if(!error&&product&&typeof product==='object')return callback(null,{key:key,product:product});directNext();});
    }
    function queryNext(fieldIndex,valueIndex){
      if(fieldIndex>=fields.length)return catalogFallback();
      if(valueIndex>=variants.length)return queryNext(fieldIndex+1,0);
      queryField(fields[fieldIndex],variants[valueIndex],function(error,found){if(found)return callback(null,found);queryNext(fieldIndex,valueIndex+1);});
    }
    function catalogFallback(){
      loadCatalog(function(error,list){
        if(error)return callback(error);var found=null;
        for(var i=0;i<list.length;i++){if(matchesCode(list[i].product,list[i].key,variants)){found=list[i];break;}}
        if(!found)return callback(null,null);fetchFresh(found,callback);
      });
    }
    directNext();
  }
  function fetchFresh(item,callback){
    var candidates=[item&&item.product&&item.product.firebaseKey,item&&item.product&&item.product.key,item&&item.key,item&&item.product&&item.product.id].filter(Boolean);
    function next(){
      if(!candidates.length)return callback(null,item);
      var key=trim(candidates.shift());
      xhr('GET',productUrl(key),null,function(error,product){if(!error&&product&&typeof product==='object')return callback(null,{key:key,product:product});next();});
    }
    next();
  }
  function normalizeCatalog(data){
    var list=[];
    if(Array.isArray(data))data.forEach(function(product,index){if(product&&typeof product==='object')list.push({key:trim(product.firebaseKey||product.key||product.id||product.codigo||index),product:product});});
    else if(data&&typeof data==='object')Object.keys(data).forEach(function(key){var product=data[key];if(product&&typeof product==='object')list.push({key:key,product:product});});
    return list;
  }
  function loadCatalog(callback){
    if(state.catalog&&Date.now()-state.catalogAt<CATALOG_TTL)return callback(null,state.catalog);
    if(state.catalogLoading){setTimeout(function(){loadCatalog(callback);},250);return;}
    state.catalogLoading=true;var paths=['../site/produtos-admin.json','../site/produtos-home.json'];
    function tryPath(){
      if(!paths.length){
        xhr('GET',firebaseUrl(settings.productsNode),null,function(error,data){state.catalogLoading=false;if(error)return callback(error);state.catalog=normalizeCatalog(data);state.catalogAt=Date.now();buildLists();callback(null,state.catalog);});
        return;
      }
      var path=paths.shift()+'?v='+Date.now();
      xhr('GET',path,null,function(error,data){
        if(error)return tryPath();var list=normalizeCatalog(data);if(!list.length)return tryPath();
        state.catalogLoading=false;state.catalog=list;state.catalogAt=Date.now();buildLists();callback(null,list);
      });
    }
    tryPath();
  }
  function buildLists(){
    if(!state.catalog)return;
    var sets={marcas:{},categorias:{},subcategorias:{},gondolas:{},prateleiras:{}};
    state.catalog.forEach(function(item){
      var product=item.product||{};
      [['marcas',product.marca],['categorias',product.categoria],['subcategorias',product.subcategoria],['gondolas',product.gondola],['prateleiras',product.prateleira]].forEach(function(pair){var value=trim(pair[1]);if(value)sets[pair[0]][value]=1;});
    });
    Object.keys(sets).forEach(function(id){var values=Object.keys(sets[id]).sort(function(a,b){return a.localeCompare(b,'pt-BR');});$(id).innerHTML=values.map(function(value){return '<option value="'+esc(value)+'"></option>';}).join('');});
  }

  function searchByName(){
    var term=trim($('nameInput').value).toLowerCase();
    if(term.length<2){setStatus('Digite pelo menos 2 letras do nome.','warn');return;}
    busy(true,'Carregando lista de produtos...');
    loadCatalog(function(error,list){
      busy(false);if(error){setStatus('Não foi possível carregar a lista: '+error.message,'err');return;}
      var words=term.split(/\s+/).filter(Boolean);
      var results=list.filter(function(item){
        var product=item.product||{};
        var hay=[product.nome,product.titulo,product.descricao,product.marca,product.categoria,product.subcategoria,product.gtin,product.ean,product.codigo].join(' ').toLowerCase();
        return words.every(function(word){return hay.indexOf(word)>-1;});
      }).slice(0,30);
      renderNameResults(results);setStatus(results.length?results.length+' resultado(s) encontrado(s).':'Nenhum produto encontrado.',results.length?'ok':'warn');
    });
  }
  function renderNameResults(results){
    var host=$('nameResults');
    if(!results.length){host.innerHTML='<div class="empty">Nenhum resultado.</div>';host.className='nameResults show';return;}
    host.innerHTML=results.map(function(item,index){
      var product=item.product||{};
      return '<button class="resultBtn" type="button" data-result="'+index+'"><img src="'+esc(imageOf(product))+'" onerror="this.src=\''+PLACEHOLDER+'\'"><span><b>'+esc(nameOf(product))+'</b><small>'+esc([product.marca,product.embalagem,codeOf(product)].filter(Boolean).join(' · '))+'</small></span></button>';
    }).join('');
    host._results=results;host.className='nameResults show';
  }
  function openItem(item){
    busy(true,'Abrindo produto...');
    fetchFresh(item,function(error,fresh){busy(false);if(error||!fresh){setStatus('Não foi possível abrir o produto.','err');return;}showProduct(fresh.key,fresh.product);});
  }

  function setField(name,value){$('f_'+name).value=value==null?'':value;}
  function fieldValue(name){return trim($('f_'+name).value);}
  function pad(value){return ('0'+value).slice(-2);}
  function formatDate(value){
    var raw=trim(value);if(!raw)return '';
    var match=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(match)return pad(match[3])+'/'+pad(match[2])+'/'+match[1];
    match=raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);if(match)return pad(match[1])+'/'+pad(match[2])+'/'+match[3];
    return raw;
  }
  function validDate(value){
    if(!value)return true;var match=value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!match)return false;
    var day=Number(match[1]),month=Number(match[2]),year=Number(match[3]),date=new Date(year,month-1,day);
    return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day;
  }
  function showProduct(key,product){
    stopCamera();state.key=key;state.product=clone(product);state.original=clone(product);
    $('empty').style.display='none';$('product').className='product show';$('savebar').className='savebar';
    $('photo').src=imageOf(product);$('photo').onerror=function(){this.src=PLACEHOLDER;};
    $('displayName').textContent=nameOf(product);$('displayMeta').textContent=[codeOf(product),product.embalagem,product.marca].filter(Boolean).join(' · ');
    setField('nome',product.nome||'');setField('validade',formatDate(product.validade||product.data_validade||''));setField('estoque',num(product.estoque));
    setField('preco_custo',money(product.preco_custo));setField('preco',money(product.preco));setField('gondola',product.gondola||'');
    setField('prateleira',product.prateleira||'');setField('marca',product.marca||'');setField('categoria',product.categoria||'');setField('subcategoria',product.subcategoria||'');
    $('nameResults').className='nameResults';$('nameResults').innerHTML='';$('codeInput').value=codeOf(product)||'';
    markChanges();setStatus('Produto carregado. Informe a contagem e salve.','ok');
    setTimeout(function(){try{$('f_estoque').focus();$('f_estoque').select();}catch(e){}},100);loadCatalog(function(){});
  }
  function currentData(){
    return{nome:fieldValue('nome'),validade:fieldValue('validade'),estoque:num(fieldValue('estoque')),preco_custo:num(fieldValue('preco_custo')),preco:num(fieldValue('preco')),gondola:fieldValue('gondola'),prateleira:fieldValue('prateleira'),marca:fieldValue('marca'),categoria:fieldValue('categoria'),subcategoria:fieldValue('subcategoria')};
  }
  function comparable(name,value){if(name==='estoque'||name==='preco_custo'||name==='preco')return num(value);if(name==='validade')return formatDate(value);return trim(value);}
  function changedFields(){
    if(!state.product||!state.original)return[];var current=currentData(),changed=[];
    Object.keys(current).forEach(function(name){if(comparable(name,current[name])!==comparable(name,state.original[name]))changed.push(name);});return changed;
  }
  function markChanges(){
    var changed=changedFields();
    Array.prototype.forEach.call(document.querySelectorAll('[data-field]'),function(input){var base='input';if(input.classList.contains('money'))base+=' money';if(changed.indexOf(input.getAttribute('data-field'))>-1)base+=' changed';input.className=base;});
    $('saveBtn').textContent=changed.length?'Salvar '+changed.length+' alteração(ões)':'Confirmar contagem';
  }
  function saveProduct(){
    if(state.saving||!state.key)return;var data=currentData();
    if(!data.nome){setStatus('O nome não pode ficar vazio.','err');$('f_nome').focus();return;}
    if(!validDate(data.validade)){setStatus('Validade inválida. Use dd/mm/aaaa.','err');$('f_validade').focus();return;}
    var now=new Date(),patch=data;
    patch.last_update=now.getTime();patch.updated_at=now.toISOString();patch.stock_updated_at=now.toISOString();patch.ultima_contagem_em=now.toISOString();patch.contagem_origem='contagem_mobile_v1';
    state.saving=true;busy(true,'Salvando contagem...');
    xhr('PATCH',productUrl(state.key),patch,function(error){
      state.saving=false;busy(false);if(error){setStatus('Erro ao salvar: '+error.message,'err');return;}
      Object.keys(patch).forEach(function(key){state.product[key]=patch[key];state.original[key]=patch[key];});
      state.count+=1;state.recent=[{key:state.key,nome:data.nome,ean:codeOf(state.product)}].concat(state.recent.filter(function(item){return item.key!==state.key;})).slice(0,10);
      saveSession();renderSession();markChanges();if(navigator.vibrate)navigator.vibrate([60,40,60]);setStatus('Contagem salva com sucesso.','ok');setTimeout(nextProduct,500);
    });
  }
  function nextProduct(){
    state.key='';state.product=null;state.original=null;$('product').className='product';$('empty').style.display='block';$('savebar').className='savebar hidden';
    $('codeInput').value='';$('nameInput').value='';$('nameResults').className='nameResults';$('nameResults').innerHTML='';
    setStatus('Pronto para o próximo produto.','warn');setTimeout(function(){$('codeInput').focus();},100);
  }
  function renderSession(){
    $('sessionCount').textContent=state.count;var card=$('recentCard'),host=$('recent');
    if(!state.recent.length){card.className='card hidden';return;}card.className='card';
    host.innerHTML=state.recent.map(function(item,index){return '<button type="button" data-recent="'+index+'">'+esc(item.nome||item.ean||item.key)+'</button>';}).join('');
  }

  function openCamera(){
    if(state.scanning){stopCamera();return;}
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.BarcodeDetector){$('photoInput').click();setStatus('Este navegador não tem leitura ao vivo. Abri a câmera do celular; se não ler, digite o EAN.','warn');return;}
    $('cameraBox').className='cameraBox open';setStatus('Abrindo câmera...','warn');
    navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:640},height:{ideal:480}},audio:false}).then(function(stream){
      state.stream=stream;$('video').srcObject=stream;try{$('video').play();}catch(e){}
      state.detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf']});state.scanning=true;$('cameraBtn').textContent='Fechar';setStatus('Aponte o código para o centro.','ok');scanFrame();
    }).catch(function(){$('cameraBox').className='cameraBox';$('photoInput').click();setStatus('Não foi possível abrir a câmera ao vivo. Use a foto ou digite o EAN.','warn');});
  }
  function scanFrame(){
    if(!state.scanning||!state.detector)return;var video=$('video');
    if(video.readyState>=2){
      state.detector.detect(video).then(function(codes){
        if(!state.scanning)return;
        if(codes&&codes[0]&&codes[0].rawValue){var code=norm(codes[0].rawValue);$('codeInput').value=code;if(navigator.vibrate)navigator.vibrate(60);stopCamera();searchCode(code);return;}
        state.scanTimer=setTimeout(scanFrame,250);
      }).catch(function(){state.scanTimer=setTimeout(scanFrame,350);});
    }else state.scanTimer=setTimeout(scanFrame,300);
  }
  function stopCamera(){
    state.scanning=false;if(state.scanTimer){clearTimeout(state.scanTimer);state.scanTimer=null;}
    if(state.stream){try{state.stream.getTracks().forEach(function(track){track.stop();});}catch(e){}state.stream=null;}
    $('video').srcObject=null;$('cameraBox').className='cameraBox';$('cameraBtn').textContent='📷 Câmera';
  }
  function decodePhoto(file){
    if(!file)return;
    if(!window.BarcodeDetector||!window.createImageBitmap){setStatus('Foto aberta. Este aparelho não lê automaticamente; digite o EAN.','warn');return;}
    busy(true,'Lendo código...');
    createImageBitmap(file).then(function(bitmap){
      var detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf']});
      return detector.detect(bitmap).then(function(codes){if(bitmap.close)bitmap.close();return codes;});
    }).then(function(codes){
      busy(false);if(codes&&codes[0]&&codes[0].rawValue){var code=norm(codes[0].rawValue);$('codeInput').value=code;searchCode(code);}else setStatus('Não consegui ler essa foto. Digite o EAN.','warn');
    }).catch(function(){busy(false);setStatus('Não consegui ler essa foto. Digite o EAN.','warn');});
  }
  function searchCode(code){
    code=norm(code||$('codeInput').value);if(!code){setStatus('Digite ou leia um EAN.','warn');return;}
    var searchId=++state.searchId;busy(true,'Buscando produto...');
    findByCode(code,function(error,found){if(searchId!==state.searchId)return;busy(false);if(error){setStatus('Erro na busca: '+error.message,'err');return;}if(!found){setStatus('EAN '+code+' não encontrado.','err');return;}showProduct(found.key,found.product);});
  }

  document.addEventListener('click',function(event){
    var target=event.target;
    var result=target.closest?target.closest('[data-result]'):null;
    if(result){var list=$('nameResults')._results||[];openItem(list[Number(result.getAttribute('data-result'))]);return;}
    var recent=target.closest?target.closest('[data-recent]'):null;
    if(recent){var item=state.recent[Number(recent.getAttribute('data-recent'))];if(item)openItem({key:item.key,product:{firebaseKey:item.key,gtin:item.ean,nome:item.nome}});return;}
    if(target.id==='cameraBtn')openCamera();else if(target.id==='closeCameraBtn')stopCamera();else if(target.id==='photoCameraBtn')$('photoInput').click();
    else if(target.id==='findCodeBtn')searchCode();else if(target.id==='findNameBtn')searchByName();else if(target.id==='saveBtn')saveProduct();else if(target.id==='nextBtn')nextProduct();
  });
  document.addEventListener('input',function(event){
    if(event.target&&event.target.getAttribute('data-field')){
      if(event.target.id==='f_validade'){var value=digits(event.target.value).slice(0,8);event.target.value=value.slice(0,2)+(value.length>2?'/'+value.slice(2,4):'')+(value.length>4?'/'+value.slice(4,8):'');}
      markChanges();
    }
  });
  document.addEventListener('keydown',function(event){
    if(event.key==='Enter'&&event.target.id==='codeInput'){event.preventDefault();searchCode();}
    else if(event.key==='Enter'&&event.target.id==='nameInput'){event.preventDefault();searchByName();}
  });
  $('photoInput').addEventListener('change',function(){if(this.files&&this.files[0])decodePhoto(this.files[0]);this.value='';});
  window.addEventListener('beforeunload',stopCamera);
  renderSession();setTimeout(function(){$('codeInput').focus();},250);
})();