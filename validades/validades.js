(function(){
  'use strict';

  var DEFAULT_FIREBASE='https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  var DEFAULT_NODE='produtos';
  var PLACEHOLDER="data:image/svg+xml;charset=UTF-8,"+encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><rect width='100%' height='100%' fill='#f4f1ea'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#999' font-family='Arial' font-size='14'>sem foto</text></svg>");
  var settings=loadSettings();
  var state={items:[],changed:{},loading:false,saving:false};

  function $(id){return document.getElementById(id);}
  function trim(value){return String(value==null?'':value).replace(/\s+/g,' ').trim();}
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});}
  function num(value){
    if(typeof value==='number'&&isFinite(value))return value;
    var s=trim(value).replace(/[^\d,.-]/g,'');
    var comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');
    if(comma>-1&&dot>-1)s=comma>dot?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
    else if(comma>-1)s=s.replace(/\./g,'').replace(',','.');
    var n=Number(s);return isFinite(n)?n:0;
  }
  function pad(value){return ('0'+value).slice(-2);}
  function loadSettings(){
    var base={firebaseUrl:DEFAULT_FIREBASE,productsNode:DEFAULT_NODE,auth:''};
    try{
      var sources=[
        JSON.parse(localStorage.getItem('da_cadastro_mobile_settings_v1')||'{}'),
        JSON.parse(localStorage.getItem('da_cadastro_ia_v6_settings')||'{}'),
        JSON.parse(localStorage.getItem('da_contagem_settings_v1')||'{}')
      ];
      var merged={};
      [base].concat(sources).forEach(function(obj){Object.keys(obj||{}).forEach(function(key){merged[key]=obj[key];});});
      return{
        firebaseUrl:trim(merged.firebaseUrl||DEFAULT_FIREBASE).replace(/\/+$/,''),
        productsNode:trim(merged.productsNode||merged.produtosNode||DEFAULT_NODE).replace(/^\/+|\/+$/g,''),
        auth:trim(merged.auth||merged.firebaseAuth||'')
      };
    }catch(error){return base;}
  }
  function firebaseUrl(path){
    var url=settings.firebaseUrl.replace(/\/+$/,'')+'/'+String(path||'').replace(/^\/+|\/+$/g,'')+'.json';
    return url+(settings.auth?'?auth='+encodeURIComponent(settings.auth):'');
  }
  function productUrl(key){return firebaseUrl(settings.productsNode+'/'+encodeURIComponent(key));}
  function xhr(method,url,data,callback){
    var request=new XMLHttpRequest(),ended=false;
    var timer=setTimeout(function(){if(ended)return;ended=true;try{request.abort();}catch(ignore){}callback(new Error('Tempo esgotado.'));},20000);
    request.open(method,url,true);request.setRequestHeader('Accept','application/json');
    if(data!=null)request.setRequestHeader('Content-Type','application/json');
    request.onreadystatechange=function(){
      if(request.readyState!==4||ended)return;ended=true;clearTimeout(timer);
      var parsed=null;try{parsed=request.responseText?JSON.parse(request.responseText):null;}catch(error){parsed=request.responseText;}
      if(request.status>=200&&request.status<300)callback(null,parsed);else callback(new Error((parsed&&parsed.error)||('Erro '+request.status)));
    };
    request.onerror=function(){if(ended)return;ended=true;clearTimeout(timer);callback(new Error('Falha de conexão.'));};
    request.send(data==null?null:JSON.stringify(data));
  }
  function request(method,url,data){return new Promise(function(resolve,reject){xhr(method,url,data,function(error,result){if(error)reject(error);else resolve(result);});});}
  function setStatus(text,type){var el=$('status');el.textContent=text;el.className='status '+(type||'warn');}
  function busy(show,text){$('busyText').textContent=text||'Carregando…';$('busy').className=show?'busy show':'busy';}
  function nameOf(product){return trim(product&&(product.nome||product.titulo||product.descricao||product.codigo))||'Produto sem nome';}
  function codeOf(product){return trim(product&&(product.gtin||product.ean||product.codigo||product.sku));}
  function imageOf(product){return trim(product&&(product.url_imagem||product.imagem_url||product.imagem||product.image||product.foto))||PLACEHOLDER;}
  function validityOf(product){return trim(product&&(product.validade||product.data_validade||''));}

  function parseDate(value){
    var raw=trim(value),match,year,month,day;
    if(!raw)return null;
    match=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(match){year=Number(match[1]);month=Number(match[2]);day=Number(match[3]);}
    else{
      match=raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
      if(!match)return null;day=Number(match[1]);month=Number(match[2]);year=Number(match[3]);
    }
    var date=new Date(year,month-1,day,12,0,0,0);
    if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)return null;
    return date;
  }
  function toInputDate(value){var date=parseDate(value);return date?date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate()):'';}
  function toStoreDate(input){var date=parseDate(input);return date?pad(date.getDate())+'/'+pad(date.getMonth()+1)+'/'+date.getFullYear():'';}
  function daysUntil(value){
    var date=parseDate(value);if(!date)return null;
    var today=new Date();today.setHours(12,0,0,0);
    return Math.round((date.getTime()-today.getTime())/86400000);
  }
  function dayText(days){
    if(days==null)return 'sem data';
    if(days<0)return 'vencido há '+Math.abs(days)+' dia'+(Math.abs(days)===1?'':'s');
    if(days===0)return 'vence hoje';
    if(days===1)return 'vence amanhã';
    return 'vence em '+days+' dias';
  }
  function urgencyClass(days){if(days<0)return'expired';if(days<=7)return'urgent';if(days<=30)return'attention';return'';}
  function normalizeCatalog(data){
    var list=[];
    if(Array.isArray(data))data.forEach(function(product,index){if(product&&typeof product==='object')list.push({key:trim(product.firebaseKey||product.key||product.id||product.codigo||index),product:product});});
    else if(data&&typeof data==='object')Object.keys(data).forEach(function(key){var product=data[key];if(product&&typeof product==='object')list.push({key:key,product:product});});
    return list;
  }
  function findItem(key){for(var i=0;i<state.items.length;i++)if(state.items[i].key===key)return state.items[i];return null;}
  function currentValues(item){
    var draft=state.changed[item.key];
    return draft?{validade:draft.validade,estoque:draft.estoque}:{validade:toInputDate(validityOf(item.product)),estoque:num(item.product.estoque)};
  }
  function originalValues(item){return{validade:toInputDate(validityOf(item.product)),estoque:num(item.product.estoque)};}
  function sameValues(a,b){return trim(a.validade)===trim(b.validade)&&num(a.estoque)===num(b.estoque);}
  function searchHay(item){var p=item.product||{};return [nameOf(p),p.marca,p.categoria,p.subcategoria,p.subsubcategoria,p.gtin,p.ean,p.codigo,p.sku,item.key].join(' ').toLowerCase();}
  function configureHorizonOptions(){
    var select=$('horizonSelect');
    if(!select)return;
    select.innerHTML='<option value="5">Até 5 dias</option><option value="15">Até 15 dias</option><option value="30">Até 30 dias</option><option value="60">Até 60 dias</option>';
    select.value='30';
  }

  function loadProducts(force){
    if(state.loading)return;
    if(force&&Object.keys(state.changed).length&&!window.confirm('Existem alterações ainda não salvas. Deseja descartá-las e recarregar?'))return;
    state.loading=true;busy(true,'Carregando produtos do Firebase…');setStatus('Carregando produtos diretamente do Firebase…','warn');
    xhr('GET',firebaseUrl(settings.productsNode),null,function(error,data){
      state.loading=false;busy(false);
      if(error){setStatus('Não foi possível carregar os produtos: '+error.message,'err');return;}
      state.items=normalizeCatalog(data);state.changed={};render();
      setStatus('Lista atualizada. Edite validade ou estoque e salve somente o que mudou.','ok');
    });
  }

  function filteredItems(){
    var term=trim($('searchInput').value).toLowerCase();
    var horizon=$('horizonSelect').value;
    var showZero=$('showZeroInput').checked;
    return state.items.filter(function(item){
      var values=currentValues(item),days=daysUntil(values.validade);
      if(days==null)return false;
      if(!showZero&&num(values.estoque)<=0)return false;
      if(term&&searchHay(item).indexOf(term)<0)return false;
      if(horizon!=='all'&&days>Number(horizon))return false;
      return true;
    }).sort(function(a,b){
      var da=daysUntil(currentValues(a).validade),db=daysUntil(currentValues(b).validade);
      if(da!==db)return da-db;
      return nameOf(a.product).localeCompare(nameOf(b.product),'pt-BR');
    });
  }
  function render(){
    var list=filteredItems(),host=$('productsList');
    $('visibleCount').textContent=list.length;
    var expired=0,seven=0,thirty=0;
    list.forEach(function(item){var days=daysUntil(currentValues(item).validade);if(days<0)expired++;else if(days<=7)seven++;if(days>=0&&days<=30)thirty++;});
    $('expiredCount').textContent=expired;$('sevenCount').textContent=seven;$('thirtyCount').textContent=thirty;
    if(!list.length){host.innerHTML='';$('emptyState').hidden=false;updateChangedUi();return;}
    $('emptyState').hidden=true;
    host.innerHTML=list.map(function(item){
      var p=item.product||{},values=currentValues(item),days=daysUntil(values.validade),dirty=!!state.changed[item.key],urgency=urgencyClass(days);
      var meta=[p.marca,p.embalagem,codeOf(p)].filter(Boolean).join(' · ');
      return '<article class="product-row '+urgency+(dirty?' dirty':'')+'" data-key="'+esc(item.key)+'">'
        +'<img class="product-photo" src="'+esc(imageOf(p))+'" alt="" onerror="this.src=\''+PLACEHOLDER+'\'">'
        +'<div class="product-info"><strong class="product-name">'+esc(nameOf(p))+'</strong><span class="product-meta">'+esc(meta||item.key)+'</span><span class="validity-note">'+esc(dayText(days))+'</span></div>'
        +'<div class="edit-field field-validity"><label>Validade</label><input class="validity-input" type="date" value="'+esc(values.validade)+'" data-field="validade"></div>'
        +'<div class="edit-field field-stock"><label>Estoque</label><input class="stock-input" type="number" min="0" step="1" inputmode="decimal" value="'+esc(values.estoque)+'" data-field="estoque"></div>'
        +'<button class="row-save" type="button" data-save="1" '+(dirty?'':'disabled')+'>'+(dirty?'Salvar':'Salvo')+'</button>'
        +'</article>';
    }).join('');
    updateChangedUi();
  }
  function updateChangedUi(){
    var count=Object.keys(state.changed).length;
    $('changedCount').textContent=count;$('saveCount').textContent=count;$('savebar').className=count?'savebar':'savebar hidden';
  }
  function updateDraft(row){
    var key=row.getAttribute('data-key'),item=findItem(key);if(!item)return;
    var validity=row.querySelector('[data-field="validade"]').value;
    var stock=row.querySelector('[data-field="estoque"]').value;
    var values={validade:validity,estoque:num(stock)},original=originalValues(item);
    if(sameValues(values,original))delete state.changed[key];else state.changed[key]=values;
    var dirty=!!state.changed[key];row.classList.toggle('dirty',dirty);
    var button=row.querySelector('[data-save]');button.disabled=!dirty;button.textContent=dirty?'Salvar':'Salvo';
    updateChangedUi();
  }
  function validateDraft(key){
    var item=findItem(key),values=state.changed[key]||currentValues(item);
    if(!item)return new Error('Produto não encontrado na lista.');
    if(!values.validade||!parseDate(values.validade))return new Error('Informe uma validade válida.');
    if(num(values.estoque)<0)return new Error('O estoque não pode ser negativo.');
    return null;
  }
  function persistKey(key){
    var item=findItem(key),values=state.changed[key];
    if(!item||!values)return Promise.resolve(false);
    var validation=validateDraft(key);if(validation)return Promise.reject(validation);
    var now=new Date(),patch={
      validade:toStoreDate(values.validade),
      estoque:num(values.estoque),
      last_update:now.getTime(),
      updated_at:now.toISOString(),
      stock_updated_at:now.toISOString(),
      validade_updated_at:now.toISOString(),
      validade_origem:'validades_mobile_v1'
    };
    return request('PATCH',productUrl(key),patch).then(function(){
      Object.keys(patch).forEach(function(field){item.product[field]=patch[field];});
      delete state.changed[key];return true;
    });
  }
  function saveOne(key){
    if(state.saving||!state.changed[key])return;
    var validation=validateDraft(key);if(validation){setStatus(validation.message,'err');return;}
    state.saving=true;busy(true,'Salvando produto…');
    persistKey(key).then(function(){
      state.saving=false;busy(false);if(navigator.vibrate)navigator.vibrate(50);render();setStatus('Validade e estoque atualizados com sucesso.','ok');
    }).catch(function(error){state.saving=false;busy(false);setStatus('Erro ao salvar: '+error.message,'err');});
  }
  function saveAll(){
    if(state.saving)return;var keys=Object.keys(state.changed);if(!keys.length)return;
    for(var i=0;i<keys.length;i++){var validation=validateDraft(keys[i]);if(validation){setStatus(validation.message,'err');return;}}
    state.saving=true;busy(true,'Salvando 0 de '+keys.length+'…');var done=0,errors=[];
    keys.reduce(function(chain,key){
      return chain.then(function(){
        $('busyText').textContent='Salvando '+(done+1)+' de '+keys.length+'…';
        return persistKey(key).then(function(){done++;}).catch(function(error){done++;errors.push({key:key,error:error});});
      });
    },Promise.resolve()).then(function(){
      state.saving=false;busy(false);render();
      if(errors.length)setStatus((keys.length-errors.length)+' salvo(s); '+errors.length+' falharam. Tente novamente os que ficaram alterados.','err');
      else{if(navigator.vibrate)navigator.vibrate([50,30,50]);setStatus(keys.length+' produto(s) atualizados com sucesso.','ok');}
    });
  }

  document.addEventListener('input',function(event){
    var field=event.target&&event.target.getAttribute('data-field');
    if(field){var row=event.target.closest('.product-row');if(row)updateDraft(row);return;}
    if(event.target&&event.target.id==='searchInput')render();
  });
  document.addEventListener('change',function(event){
    if(event.target&&event.target.getAttribute('data-field')){var row=event.target.closest('.product-row');if(row)updateDraft(row);return;}
    if(event.target&&(/^(horizonSelect|showZeroInput)$/.test(event.target.id)))render();
  });
  document.addEventListener('click',function(event){
    var save=event.target&&event.target.closest?event.target.closest('[data-save]'):null;
    if(save){var row=save.closest('.product-row');if(row)saveOne(row.getAttribute('data-key'));return;}
    if(event.target&&event.target.id==='reloadButton')loadProducts(true);
    else if(event.target&&event.target.id==='saveAllButton')saveAll();
  });

  configureHorizonOptions();
  loadProducts(false);
})();