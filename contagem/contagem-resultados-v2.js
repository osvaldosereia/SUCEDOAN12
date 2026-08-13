(function(){
  'use strict';

  var DEFAULT_FIREBASE='https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  var DEFAULT_NODE='produtos';
  var RAW_BASE='https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/main/';
  var PLACEHOLDER="data:image/svg+xml;charset=UTF-8,"+encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='500' height='500'><rect width='100%' height='100%' fill='#f4f1ea'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#999' font-family='Arial' font-size='22'>sem foto</text></svg>");
  var cache=null;
  var cacheAt=0;
  var loading=false;
  var waiting=[];
  var selectedProduct=null;

  function $(id){return document.getElementById(id);}
  function trim(value){return String(value==null?'':value).replace(/\s+/g,' ').trim();}
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[m];});}
  function num(value){var n=Number(String(value==null?'0':value).replace(',','.'));return isFinite(n)?n:0;}
  function nameOf(product){return trim(product&&(product.nome||product.titulo||product.descricao||product.codigo))||'Produto sem nome';}
  function codeOf(product){return trim(product&&(product.gtin||product.ean||product.codigo||product.sku));}
  function activeOf(product){
    if(!product)return false;
    if(product.ativo===true||product.visivel===true)return true;
    var value=trim(product.situacao||product.status).toUpperCase();
    return value==='A'||value==='ATIVO'||value==='ACTIVE';
  }
  function settings(){
    var base={firebaseUrl:DEFAULT_FIREBASE,productsNode:DEFAULT_NODE,auth:''};
    try{
      var own=JSON.parse(localStorage.getItem('da_contagem_settings_v1')||'{}');
      var cad=JSON.parse(localStorage.getItem('da_cadastro_ia_v6_settings')||'{}');
      var merged={};
      [base,cad,own].forEach(function(obj){Object.keys(obj||{}).forEach(function(key){merged[key]=obj[key];});});
      return{
        firebaseUrl:trim(merged.firebaseUrl||DEFAULT_FIREBASE).replace(/\/+$/,''),
        productsNode:trim(merged.productsNode||merged.produtosNode||DEFAULT_NODE).replace(/^\/+|\/+$/g,''),
        auth:trim(merged.auth||merged.firebaseAuth||'')
      };
    }catch(error){return base;}
  }
  function firebaseUrl(){
    var config=settings();
    return config.firebaseUrl+'/'+config.productsNode+'.json'+(config.auth?'?auth='+encodeURIComponent(config.auth):'');
  }
  function xhr(url,callback){
    var request=new XMLHttpRequest();
    var ended=false;
    var timer=setTimeout(function(){
      if(ended)return;
      ended=true;
      try{request.abort();}catch(error){}
      callback(new Error('Tempo esgotado.'));
    },45000);
    request.open('GET',url,true);
    request.setRequestHeader('Accept','application/json');
    request.onreadystatechange=function(){
      if(request.readyState!==4||ended)return;
      ended=true;
      clearTimeout(timer);
      var data=null;
      try{data=request.responseText?JSON.parse(request.responseText):null;}catch(error){}
      if(request.status>=200&&request.status<300)callback(null,data);
      else callback(new Error('Erro '+request.status));
    };
    request.onerror=function(){
      if(ended)return;
      ended=true;
      clearTimeout(timer);
      callback(new Error('Falha de conexão.'));
    };
    request.send();
  }
  function normalizeCatalog(data){
    var list=[];
    if(Array.isArray(data)){
      data.forEach(function(product,index){
        if(product&&typeof product==='object')list.push({key:trim(product.firebaseKey||product.key||product.id||product.codigo||index),product:product});
      });
    }else if(data&&typeof data==='object'){
      Object.keys(data).forEach(function(key){
        if(data[key]&&typeof data[key]==='object')list.push({key:key,product:data[key]});
      });
    }
    list.sort(function(a,b){return nameOf(a.product).localeCompare(nameOf(b.product),'pt-BR');});
    return list;
  }
  function loadAll(callback){
    if(cache&&Date.now()-cacheAt<300000)return callback(null,cache);
    waiting.push(callback);
    if(loading)return;
    loading=true;
    xhr(firebaseUrl(),function(error,data){
      loading=false;
      if(!error){cache=normalizeCatalog(data);cacheAt=Date.now();}
      var callbacks=waiting.slice();
      waiting=[];
      callbacks.forEach(function(fn){fn(error,cache);});
    });
  }
  function add(list,value){
    value=trim(value);
    if(value&&list.indexOf(value)<0)list.push(value);
  }
  function collectImages(product){
    var values=[];
    if(!product)return values;
    [
      product.url_imagem,product.imagem_url,product.imagem,product.image,product.foto,
      product.urlImagem,product.imageUrl,product.imagem_path,product.image_path,
      product.caminho_imagem,product.foto_url,product.photo,product.thumbnail
    ].forEach(function(value){add(values,value);});
    [product.imagens,product.images,product.fotos].forEach(function(source){
      if(Array.isArray(source))source.forEach(function(value){add(values,value&&typeof value==='object'?(value.url||value.src||value.path):value);});
      else if(source&&typeof source==='object')Object.keys(source).forEach(function(key){
        var value=source[key];
        add(values,value&&typeof value==='object'?(value.url||value.src||value.path):value);
      });
    });
    return values;
  }
  function normalizeImage(value){
    var raw=trim(value);
    if(!raw)return '';
    if(/^data:|^blob:/i.test(raw))return raw;
    if(/^\/\//.test(raw))return 'https:'+raw;
    if(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i.test(raw)){
      return raw.replace(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i,'https://raw.githubusercontent.com/$1/$2/$3/$4');
    }
    if(/^https?:\/\//i.test(raw))return raw;
    raw=raw.replace(/\\/g,'/').replace(/^\.\//,'');
    if(raw.indexOf('site/')===0)return '/'+raw;
    if(raw.indexOf('/site/')===0)return raw;
    if(raw.indexOf('img/')===0)return '/site/'+raw;
    if(raw.indexOf('/img/')===0)return '/site'+raw;
    if(raw.indexOf('site/img/')>-1)return '/'+raw.slice(raw.indexOf('site/img/'));
    return raw.charAt(0)==='/'?raw:'/'+raw;
  }
  function imageSources(product){
    var result=[];
    collectImages(product).forEach(function(value){
      var normalized=normalizeImage(value);
      add(result,normalized);
      var path=trim(value).replace(/\\/g,'/').replace(/^\.?\//,'');
      if(path.indexOf('site/')===0)add(result,RAW_BASE+path);
    });
    add(result,PLACEHOLDER);
    return result;
  }
  function setImage(img,product){
    if(!img)return;
    var sources=imageSources(product);
    img._sources=sources;
    img._sourceIndex=0;
    img.onerror=function(){
      this._sourceIndex+=1;
      if(this._sources&&this._sourceIndex<this._sources.length)this.src=this._sources[this._sourceIndex];
      else this.onerror=null;
    };
    img.src=sources[0]||PLACEHOLDER;
  }
  function status(text,type){
    var el=$('status');
    if(!el)return;
    el.textContent=text;
    el.className='status '+(type||'warn');
  }
  function busy(show,text){
    var box=$('busy'),label=$('busyText');
    if(label)label.textContent=text||'Carregando...';
    if(box)box.className=show?'busy show':'busy';
  }
  function cardBadges(product){
    var active=activeOf(product);
    var stock=num(product&&product.estoque);
    return '<span class="searchBadge '+(active?'active':'inactive')+'">'+(active?'Ativo':'Inativo')+'</span>'+ 
      '<span class="searchBadge '+(stock>0?'stock':'zero')+'">Estoque '+stock+'</span>';
  }
  function render(results){
    var host=$('nameResults');
    if(!host)return;
    host._results=results;
    if(!results.length){
      host.innerHTML='<div class="empty searchEmpty">Nenhum produto encontrado.</div>';
      host.className='nameResults show';
      return;
    }
    host.innerHTML=results.map(function(item,index){
      var product=item.product||{};
      return '<button class="searchProductCard" type="button" data-result="'+index+'">'+
        '<span class="searchPhoto"><img data-search-image="'+index+'" loading="lazy" decoding="async" alt=""></span>'+ 
        '<span class="searchCardBody">'+
          '<b>'+esc(nameOf(product))+'</b>'+ 
          '<small>'+esc([product.marca,product.embalagem,codeOf(product)].filter(Boolean).join(' · ')||'Sem classificação')+'</small>'+ 
          '<span class="searchBadges">'+cardBadges(product)+'</span>'+ 
        '</span>'+ 
      '</button>';
    }).join('');
    host.className='nameResults show';
    Array.prototype.forEach.call(host.querySelectorAll('[data-search-image]'),function(img){
      var item=results[Number(img.getAttribute('data-search-image'))];
      setImage(img,item&&item.product);
    });
  }
  function searchAll(){
    var input=$('nameInput');
    var term=trim(input&&input.value).toLowerCase();
    busy(true,term?'Buscando em todos os produtos...':'Carregando todos os produtos...');
    loadAll(function(error,list){
      busy(false);
      if(error){
        status('Não foi possível carregar todos os produtos: '+error.message,'err');
        return;
      }
      var words=term.split(/\s+/).filter(Boolean);
      var results=(list||[]).filter(function(item){
        if(!words.length)return true;
        var product=item.product||{};
        var hay=[
          product.nome,product.titulo,product.descricao,product.marca,product.categoria,
          product.subcategoria,product.subsubcategoria,product.gtin,product.ean,product.codigo,
          product.sku,product.embalagem
        ].join(' ').toLowerCase();
        return words.every(function(word){return hay.indexOf(word)>-1;});
      });
      render(results);
      status(results.length+' produto(s) exibido(s), incluindo inativos e estoque zerado.',results.length?'ok':'warn');
    });
  }
  function findCachedProduct(){
    if(!cache)return null;
    var code=trim($('codeInput')&&$('codeInput').value).toUpperCase();
    var name=trim($('displayName')&&$('displayName').textContent).toLowerCase();
    var found=null;
    cache.some(function(item){
      var product=item.product||{};
      var codes=[item.key,product.firebaseKey,product.id,product.codigo,product.sku,product.gtin,product.ean].map(function(value){return trim(value).toUpperCase();});
      if((code&&codes.indexOf(code)>-1)||(name&&nameOf(product).toLowerCase()===name)){found=product;return true;}
      return false;
    });
    return found;
  }
  function refreshMainImage(){
    var photo=$('photo');
    if(!photo)return;
    var product=selectedProduct||findCachedProduct();
    if(product)setImage(photo,product);
    selectedProduct=null;
  }
  function installOpsNavigation(){
    var nav=document.querySelector('.ops-app-nav');
    if(!nav)return;
    nav.style.gridTemplateColumns='repeat(4,minmax(0,1fr))';
    nav.innerHTML='<a class="active" aria-current="page" href="../contagem/"><span class="ops-app-nav-icon">📦</span><span>Contagem</span></a><a href="../cadastro/"><span class="ops-app-nav-icon">➕</span><span>Cadastro</span></a><a href="../validades/"><span class="ops-app-nav-icon">📅</span><span>Validades</span></a><a href="../kit-mobile/"><span class="ops-app-nav-icon">🎁</span><span>Kits</span></a>';
  }

  document.addEventListener('click',function(event){
    var button=event.target&&event.target.closest?event.target.closest('#findNameBtn'):null;
    if(button){
      event.preventDefault();
      event.stopImmediatePropagation();
      searchAll();
      return;
    }
    var card=event.target&&event.target.closest?event.target.closest('[data-result]'):null;
    if(card){
      var host=$('nameResults');
      var item=host&&host._results?host._results[Number(card.getAttribute('data-result'))]:null;
      selectedProduct=item&&item.product;
      setTimeout(refreshMainImage,500);
      setTimeout(refreshMainImage,1400);
    }
  },true);

  document.addEventListener('keydown',function(event){
    if(event.key==='Enter'&&event.target&&event.target.id==='nameInput'){
      event.preventDefault();
      event.stopImmediatePropagation();
      searchAll();
    }
  },true);

  var display=$('displayName');
  if(display&&window.MutationObserver){
    new MutationObserver(function(){setTimeout(refreshMainImage,50);}).observe(display,{childList:true,characterData:true,subtree:true});
  }

  installOpsNavigation();
  window.addEventListener('load',function(){
    installOpsNavigation();
    var input=$('nameInput');
    var button=$('findNameBtn');
    if(input)input.placeholder='Nome, marca ou categoria; vazio mostra todos';
    if(button)button.textContent='Buscar / todos';
  });
})();
