from pathlib import Path
import re

src_path = Path('producao/index.html')
out_path = src_path
s = src_path.read_text(encoding='utf-8')


def find_matching_brace(text, open_pos):
    assert text[open_pos] == '{'
    depth = 0
    i = open_pos
    state = 'code'
    quote = None
    escape = False
    prev_sig = ''
    while i < len(text):
        c = text[i]
        n = text[i+1] if i+1 < len(text) else ''
        if state == 'line_comment':
            if c == '\n': state = 'code'
        elif state == 'block_comment':
            if c == '*' and n == '/': state = 'code'; i += 1
        elif state == 'string':
            if escape: escape = False
            elif c == '\\': escape = True
            elif c == quote: state = 'code'
        elif state == 'template':
            if escape: escape = False
            elif c == '\\': escape = True
            elif c == '`': state = 'code'
        elif state == 'regex':
            if escape: escape = False
            elif c == '\\': escape = True
            elif c == '[': state = 'regex_class'
            elif c == '/':
                state = 'code'
                while i+1 < len(text) and text[i+1].isalpha(): i += 1
        elif state == 'regex_class':
            if escape: escape = False
            elif c == '\\': escape = True
            elif c == ']': state = 'regex'
        else:
            if c == '/' and n == '/': state = 'line_comment'; i += 1
            elif c == '/' and n == '*': state = 'block_comment'; i += 1
            elif c in "'\"": state = 'string'; quote = c; escape = False
            elif c == '`': state = 'template'; escape = False
            elif c == '/':
                if prev_sig in ('', '(', '[', '{', '=', ':', ',', ';', '!', '?', '&', '|'):
                    state = 'regex'; escape = False
                else:
                    prev_sig = c
            elif c == '{':
                depth += 1; prev_sig = c
            elif c == '}':
                depth -= 1
                if depth == 0: return i
                prev_sig = c
            elif not c.isspace():
                prev_sig = c
        i += 1
    raise ValueError(f'No matching brace from {open_pos}')


def function_spans(text, name):
    pats = [
        re.compile(rf'(?m)^[ \t]*(?:async[ \t]+)?function[ \t]+{re.escape(name)}[ \t]*\([^\n]*?\)[ \t]*\{{'),
        re.compile(rf'(?m)^[ \t]*{re.escape(name)}[ \t]*=[ \t]*(?:async[ \t]+)?function[ \t]*\([^\n]*?\)[ \t]*\{{'),
        re.compile(rf'(?m)^[ \t]*{re.escape(name)}[ \t]*=[ \t]*async[ \t]*\([^\n]*?\)[ \t]*=>[ \t]*\{{'),
        re.compile(rf'(?m)^[ \t]*{re.escape(name)}[ \t]*=[ \t]*\([^\n]*?\)[ \t]*=>[ \t]*\{{'),
    ]
    found=[]
    for pat in pats:
        for m in pat.finditer(text):
            op=text.find('{',m.start(),m.end()+1)
            if op<0: continue
            end=find_matching_brace(text,op)+1
            while end < len(text) and text[end] in ' \t': end += 1
            if end < len(text) and text[end] == ';': end += 1
            if end < len(text) and text[end] == '\r': end += 1
            if end < len(text) and text[end] == '\n': end += 1
            found.append((m.start(),end))
    return sorted(set(found))


def remove_spans(text, spans):
    for a,b in sorted(spans, reverse=True):
        text=text[:a]+text[b:]
    return text


def remove_occurrences(text,name,indices):
    spans=function_spans(text,name)
    selected=[]
    for idx in indices:
        if idx<0: idx=len(spans)+idx
        selected.append(spans[idx])
    return remove_spans(text, selected)

s = remove_occurrences(s, 'renderProducts', [0])
s = remove_occurrences(s, 'createProduct', [0])
s = remove_occurrences(s, 'duplicateProduct', [0])
s = remove_occurrences(s, 'updateProduct', [0])
s = remove_occurrences(s, 'updateProductFromCard', [0,1,2])
s = remove_occurrences(s, 'createProductBanner', [0,1,2,3])
s = remove_occurrences(s, 'bannerPositionOptionsHtml', [0,1])

s = re.sub(
    r'\n\s*const originalUpdateProductFromCardForSelects=updateProductFromCard;\s*\n\s*updateProductFromCard=function\(key,field,value\)\{[\s\S]*?\n\s*\};\s*\n',
    '\n', s, count=1
)

s = re.sub(r'\n\s*saveGithubNow=async function\(\)\{try\{if\(!ensureCatalogReadyForFullExport\(\)\)return;setStatus\("Enviando arquivos ao GitHub\.\.\."[\s\S]*?\};\s*\n', '\n', s, count=1)

start = s.index('  async function loadProductsWithFallback(){')
end_marker = '  /* ===== Ajustes funcionais solicitados ===== */'
end = s.index(end_marker, start)
new_loader = r'''  function daWait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
  function daWithTimeout(promise,timeoutMs,label="operação"){
    let timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`Tempo esgotado em ${label}`)),timeoutMs)})
    ]).finally(()=>clearTimeout(timer));
  }
  function daFirebaseProductSources(){
    const configuredBase=String(state.settings.firebaseUrl||"").trim().replace(/\/+$/,'');
    const configuredNode=String(state.settings.produtosNode||"").trim().replace(/^\/+|\/+$/g,'');
    const defaultBase=String(defaultSettings.firebaseUrl||"").trim().replace(/\/+$/,'');
    const defaultNode=String(defaultSettings.produtosNode||"produtos").trim().replace(/^\/+|\/+$/g,'');
    const values=[[configuredBase,configuredNode],[defaultBase,defaultNode]];
    const seen=new Set();
    return values.filter(([base,node])=>{
      if(!base||!node)return false;
      const key=`${base}/${node}`;
      if(seen.has(key))return false;
      seen.add(key);return true;
    }).map(([base,node])=>({base,node,url:`${base}/${node.split('/').map(encodeURIComponent).join('/')}.json`}));
  }
  async function daFetchFirebaseProducts({attempts=4,timeoutMs=25000}={}){
    const errors=[];
    const sources=daFirebaseProductSources();
    if(!sources.length)throw new Error("Firebase não configurado.");
    for(let attempt=1;attempt<=attempts;attempt++){
      for(const source of sources){
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),timeoutMs);
        const url=`${source.url}?_admin_load=${Date.now()}_${attempt}`;
        try{
          const response=await fetch(url,{cache:"no-store",headers:{Accept:"application/json"},signal:controller.signal});
          if(!response.ok)throw new Error(`HTTP ${response.status}`);
          const data=await response.json();
          const products=normalizeProducts(data);
          if(!products.length)throw new Error("catálogo vazio");
          return {products,source:"Firebase",url:source.url,attempt};
        }catch(error){
          const detail=error?.name==="AbortError"?`tempo esgotado após ${Math.round(timeoutMs/1000)}s`:(error?.message||String(error));
          errors.push(`${source.url} · tentativa ${attempt}: ${detail}`);
        }finally{clearTimeout(timer)}
      }
      if(attempt<attempts)await daWait(Math.min(4000,700*attempt));
    }
    throw new Error(errors.join(" | "));
  }
  function daPrepareProductsAfterLoad(products){
    state.produtos=products;
    markProductsReloaded();
    state.produtos.forEach(product=>{
      if(!Array.isArray(product.imagens))product.imagens=uniq([product.url_imagem||product.imagem||""]).filter(Boolean);
      if(!product.video_youtube&&product.video_url)product.video_youtube=product.video_url;
      if(typeof applyExpiryRules==="function"){
        const result=applyExpiryRules(product)||{fields:[]};
        if(result.fields?.length)markProductDirty(getKey(product),result.fields);
      }
    });
  }
  let daStartupViewInitialized=false;
  function daRenderLoadedProducts(result,{provisional=false}={}){
    daPrepareProductsAfterLoad(result.products);
    if(!daStartupViewInitialized){resetProductViewForStartup();daStartupViewInitialized=true}
    renderAll();
    const warning=result.warning?` · ${result.warning}`:"";
    setStatus(`${provisional?"Exibindo":"Produtos carregados"}: ${state.produtos.length} via ${result.source}${warning}`,provisional||result.warning?"warn":"ok");
  }
  function daReadLocalJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||fallback)}catch{return JSON.parse(fallback)}}
  async function daLoadAuxiliaryCatalogs(generation){
    const tasks=[
      daWithTimeout(loadAdminMetaFromGithub(),15000,"metadados do GitHub"),
      daWithTimeout(loadCestasFromGithub(),15000,"cestas do GitHub"),
      daWithTimeout(loadKitsFromGithub(),15000,"kits do GitHub")
    ];
    const [metaResult,cestasResult,kitsResult]=await Promise.allSettled(tasks);
    if(generation!==daLoadGeneration)return;
    state.meta=metaResult.status==="fulfilled"?normalizeMeta(metaResult.value):normalizeMeta(daReadLocalJson(LS_META,"{}"));
    state.cestas=cestasResult.status==="fulfilled"?normalizeCestas(cestasResult.value):normalizeCestas(daReadLocalJson(LS_CESTAS,"[]"));
    state.kits=kitsResult.status==="fulfilled"?normalizeKits(kitsResult.value):normalizeKits(daReadLocalJson(LS_KITS,"[]"));
    if(!state.cestas.length)state.cestas=normalizeCestas(DEFAULT_CESTAS);
    if(!state.meta.categorias.length&&state.produtos.length)rebuildMeta(false);
    state.selectedBasketId=state.selectedBasketId||state.cestas[0]?.id||null;
    state.selectedKitId=state.selectedKitId||state.kits[0]?.id||null;
    state.dirtyCestas=state.dirtyKits=state.dirtyMeta=false;
    state.kits.forEach(kit=>{if(typeof recalcKit==="function")recalcKit(kit)});
    renderAll();
  }
  async function daLoadNotesDeferred(){
    if(typeof normalizeNotes!=="function"||typeof loadNotesFromGithub!=="function")return;
    const localNotes=normalizeNotes(daReadLocalJson(LS_NOTES,"[]"));
    const hadPending=localStorage.getItem(LS_NOTES_DIRTY)==="1";
    try{
      const remoteNotes=await daWithTimeout(loadNotesFromGithub(),12000,"anotações do GitHub");
      state.anotacoes=hadPending?localNotes:remoteNotes;
    }catch(error){console.warn("Anotações remotas não carregadas:",error);state.anotacoes=localNotes}
    const removed=typeof cleanupExpiredNotes==="function"?cleanupExpiredNotes():0;
    state.dirtyNotes=hadPending||removed>0;
    if(state.dirtyNotes)safeLocalSet(LS_NOTES_DIRTY,"1","marcador de anotações pendentes");
    saveLocal();renderAll();
    if(typeof updateExpiryAlert==="function")updateExpiryAlert();
    if(state.dirtyNotes&&state.settings.githubToken&&typeof saveNotes==="function")saveNotes(false).catch(error=>console.warn(error));
  }
  function daLoadDeferredModules(generation){
    const jobs=[daLoadNotesDeferred()];
    if(typeof daLoadBannerCatalog==="function")jobs.push(daWithTimeout(daLoadBannerCatalog(true),20000,"catálogo de banners").then(()=>renderProducts()));
    if(typeof daLoadKitCarouselQueue==="function")jobs.push(daWithTimeout(daLoadKitCarouselQueue(true),15000,"fila de carrosséis"));
    if(typeof daOfferLoad==="function")jobs.push(daWithTimeout(daOfferLoad(),15000,"histórico de ofertas"));
    Promise.allSettled(jobs).then(results=>{
      if(generation!==daLoadGeneration)return;
      results.forEach(result=>{if(result.status==="rejected")console.warn("Módulo auxiliar não carregado:",result.reason)});
    });
  }

  let productsSilentRefreshRunning=false;
  let daProductsRecoveryTimer=null;
  let daProductsRecoveryAttempt=0;
  function daScheduleProductsRecovery(){
    if(daProductsRecoveryTimer||state.produtos.length)return;
    const delay=Math.min(60000,5000*Math.max(1,2**daProductsRecoveryAttempt));
    daProductsRecoveryTimer=setTimeout(async()=>{
      daProductsRecoveryTimer=null;daProductsRecoveryAttempt++;
      try{
        const fresh=await daFetchFirebaseProducts({attempts:2,timeoutMs:25000});
        daRenderLoadedProducts(fresh);await writeProductsCache(fresh.products,"Firebase").catch(()=>false);daProductsRecoveryAttempt=0;
      }catch(error){console.warn("Nova tentativa automática do Firebase falhou:",error);daScheduleProductsRecovery()}
    },delay);
  }
  async function refreshProductsSilently({force=false}={}){
    if(productsSilentRefreshRunning||(!force&&(state.dirtyProductKeys.size||state.deletedProductKeys.size)))return false;
    productsSilentRefreshRunning=true;
    try{
      let fresh;
      try{fresh=await daFetchFirebaseProducts({attempts:2,timeoutMs:25000})}
      catch(firebaseError){
        console.warn("Atualização silenciosa pelo Firebase falhou:",firebaseError);
        fresh=await daWithTimeout(loadProductsFromGithub(),25000,"catálogo de produtos no GitHub");
      }
      if(!fresh?.products?.length)return false;
      daRenderLoadedProducts(fresh);
      await writeProductsCache(state.produtos,fresh.source).catch(()=>false);
      return true;
    }catch(error){console.warn("Atualização silenciosa de produtos falhou:",error);if(!state.produtos.length)daScheduleProductsRecovery();return false}
    finally{productsSilentRefreshRunning=false}
  }

  let daLoadDataRunning=null;
  let daLoadGeneration=0;
  async function loadData(options={}){
    const force=options===true||options?.force===true;
    if(daLoadDataRunning&&!force)return daLoadDataRunning;
    const generation=++daLoadGeneration;
    const requestedTab=state.activeTab;
    const task=(async()=>{
      setStatus("Conectando ao Firebase e carregando produtos...","warn");
      let cacheResult=null;
      try{cacheResult=await daWithTimeout(readProductsCache(),3000,"cache local de produtos")}catch(error){console.warn("Cache local indisponível:",error)}
      if(generation!==daLoadGeneration)return false;
      if(cacheResult?.products?.length&&!state.produtos.length)daRenderLoadedProducts(cacheResult,{provisional:true});
      else if(!state.produtos.length)renderLoading();

      let productResult=null;
      let firebaseError=null;
      try{productResult=await daFetchFirebaseProducts({attempts:4,timeoutMs:25000})}
      catch(error){firebaseError=error;console.error("Firebase não respondeu com catálogo válido:",error)}
      if(generation!==daLoadGeneration)return false;

      if(!productResult){
        try{productResult=await daWithTimeout(loadProductsFromGithub(),30000,"fallback de produtos no GitHub")}
        catch(error){console.error("Fallback do GitHub falhou:",error)}
      }
      if(generation!==daLoadGeneration)return false;

      if(productResult?.products?.length){
        daRenderLoadedProducts(productResult);
        writeProductsCache(productResult.products,productResult.source).catch(error=>console.warn("Cache de produtos não atualizado:",error));
      }else if(cacheResult?.products?.length){
        daRenderLoadedProducts({...cacheResult,warning:"Firebase temporariamente indisponível"},{provisional:true});
      }else if(state.produtos.length){
        setStatus(`Mantendo ${state.produtos.length} produtos da sessão; o Firebase será consultado novamente automaticamente.`,"warn");
      }else{
        setStatus(`Não foi possível carregar os produtos agora${firebaseError?`: ${firebaseError.message}`:""}. Nova tentativa automática agendada.`,"err");
        renderAll();daScheduleProductsRecovery();
      }

      await daLoadAuxiliaryCatalogs(generation).catch(error=>console.warn("Dados auxiliares não carregados:",error));
      if(generation!==daLoadGeneration)return false;
      if(requestedTab&&requestedTab!=="leitura")state.activeTab=requestedTab;
      document.querySelectorAll('[data-tab="leitura"],#tab-leitura').forEach(element=>element.remove());
      if(state.activeTab==="leitura")state.activeTab="produtos";
      renderAll();
      daLoadDeferredModules(generation);
      return !!state.produtos.length;
    })();
    daLoadDataRunning=task;
    try{return await task}
    finally{if(daLoadDataRunning===task)daLoadDataRunning=null}
  }

'''
s = s[:start] + new_loader + s[end:]

patterns = [
    r'\n\s*const originalLoadData=loadData;\s*\n\s*loadData=async function\(\)\{[\s\S]*?\n\s*\};\s*\n',
    r'\n\s*const daV6LoadDataBase = loadData;\s*\n\s*loadData = async function\(\)\{[\s\S]*?\n\s*\};\s*\n',
    r'\n\s*const daLoadDataWithQueueBase=loadData;\s*\n\s*loadData=async function\(\)\{[\s\S]*?\n\s*\};\s*\n',
    r'\n\s*const daOfferLoadDataBase=loadData;let daOfferLoadDataRunning=null;loadData=function\(\)\{[^\n]*\};\s*\n'
]
for pat in patterns:
    s,n=re.subn(pat,'\n',s,count=1)
    if n!=1: print('WARN wrapper not removed',pat[:50],n)

s=s.replace("if(a==='reload') loadData();", "if(a==='reload') loadData({force:true,reason:'manual'});")
s=s.replace("if(!state.produtos.length)refreshProductsSilently().catch(error=>console.warn(error));", "refreshProductsSilently().catch(error=>console.warn(error));")
s=s.replace('/* ===== BANNERS V10 · POSICIONAMENTO REAL DO SITE + LIMITE 4 POR ESPAÇO ===== */','/* ===== BANNERS · POSICIONAMENTO REAL DO SITE E FILA DE ATÉ 12 POR ESPAÇO ===== */')
s=s.replace('// Limite real de 4 banners ativos por espaço, inclusive em criações manuais.','// Limite real de 12 banners ativos ou agendados por família de posição.')
s=re.sub(r'\n{5,}','\n\n\n',s)

out_path.write_text(s,encoding='utf-8')
print('written',out_path,len(s),s.count('\n')+1)
