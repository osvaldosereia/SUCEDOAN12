from pathlib import Path
import re
import subprocess
import tempfile

path = Path('producao/index.html')
s = path.read_text(encoding='utf-8')

before_markers = {
    marker: s.count(marker)
    for marker in (
        'const originalLoadData=loadData',
        'const daV6LoadDataBase = loadData',
        'const daLoadDataWithQueueBase=loadData',
        'const daOfferLoadDataBase=loadData',
        'daOfferEnsureUi',
        'tab-ofertas-auto',
        'bannerManagerBody',
        'DA_BANNER_PLACEMENTS',
        'tab-cestas',
        'tab-kits',
        'tab-cadastros',
        'tab-integracoes',
        'tab-json',
    )
}

start = s.index('  async function loadProductsWithFallback(){\n')
end = s.index('\n  async function loadData(){', start)
replacement = r'''  function firebaseProductsSources(){
    const configuredBase=String(state.settings.firebaseUrl||'').trim().replace(/\/+$/,'');
    const configuredNode=String(state.settings.produtosNode||'produtos').trim().replace(/^\/+|\/+$/g,'');
    const officialBase=String(defaultSettings.firebaseUrl||'').trim().replace(/\/+$/,'');
    const officialNode=String(defaultSettings.produtosNode||'produtos').trim().replace(/^\/+|\/+$/g,'');
    const seen=new Set();
    return [[officialBase,officialNode],[configuredBase,configuredNode]].filter(([base,node])=>{
      const key=`${base}/${node}`;
      if(!base||!node||seen.has(key))return false;
      seen.add(key);return true;
    }).map(([base,node])=>`${base}/${node}.json`);
  }

  async function loadProductsFromFirebase({attempts=3}={}){
    const errors=[],sources=firebaseProductsSources();
    for(let attempt=1;attempt<=attempts;attempt++){
      const timeout=attempt===1?10000:15000;
      for(const source of sources){
        try{
          const separator=source.includes('?')?'&':'?';
          const data=await fetchJson(`${source}${separator}_admin=${Date.now()}_${attempt}`,timeout);
          const products=normalizeProducts(data);
          if(products.length)return {products,source:'Firebase',firebaseUrl:source,attempt};
          errors.push(`${source}: catálogo vazio na tentativa ${attempt}`);
        }catch(error){errors.push(`${source}: ${error.message||error}`)}
      }
      if(attempt<attempts)await new Promise(resolve=>setTimeout(resolve,700*attempt));
    }
    throw new Error(errors.join(' | '));
  }

  async function loadProductsWithFallback(){
    const errors=[];
    let cached=null;
    try{cached=await readProductsCache()}catch(error){errors.push(`Cache local: ${error.message||error}`)}

    // O cache já é exibido provisoriamente por loadData. Não finalize o carregamento
    // com ele após a primeira demora: continue consultando o Firebase até esgotar
    // as tentativas. Isso elimina a necessidade de clicar em "Recarregar dados".
    try{
      const firebase=await loadProductsFromFirebase({attempts:3});
      writeProductsCache(firebase.products,'Firebase').catch(error=>console.warn('Cache de produtos não atualizado:',error));
      return firebase;
    }catch(error){errors.push(`Firebase: ${error.message||error}`)}

    try{
      const github=await loadProductsFromGithub();
      writeProductsCache(github.products,github.source).catch(error=>console.warn('Cache de produtos não atualizado:',error));
      return {...github,warning:errors.join(' | ')};
    }catch(error){errors.push(error.message||String(error))}

    if(cached?.products?.length)return {products:cached.products,source:'cache local seguro',warning:errors.join(' | ')};
    if(Array.isArray(state.produtos)&&state.produtos.length){
      console.warn('Não foi possível atualizar o catálogo; mantendo os produtos já carregados.',errors);
      return {products:[...state.produtos],source:'memória da sessão',warning:errors.join(' | ')};
    }
    throw new Error(errors.join(' | '));
  }

  let productsSilentRefreshRunning=false;
  async function refreshProductsSilently(){
    if(productsSilentRefreshRunning||state.dirtyProductKeys.size||state.deletedProductKeys.size)return false;
    productsSilentRefreshRunning=true;
    try{
      let fresh=null;
      try{fresh=await loadProductsFromFirebase({attempts:2})}
      catch(error){console.warn('Atualização silenciosa pelo Firebase falhou:',error)}
      if(!fresh){try{fresh=await loadProductsFromGithub()}catch(error){console.warn('Atualização silenciosa pelo GitHub falhou:',error)}}
      if(!fresh?.products?.length)return false;
      state.produtos=fresh.products;
      markProductsReloaded();
      await writeProductsCache(state.produtos,fresh.source).catch(()=>false);
      renderAll();
      setStatus(`Produtos atualizados automaticamente: ${state.produtos.length} via ${fresh.source}`,'ok');
      return true;
    }finally{productsSilentRefreshRunning=false}
  }
'''
s = s[:start] + replacement + s[end:]

needle = '      const warningText=productWarning?" · catálogo anterior preservado após falha de atualização":"";\n      setStatus(`Carregado: ${state.produtos.length} produtos via ${productSource}${warningText}, ${state.cestas.length} cestas, ${state.kits.length} kits`,productWarning?"warn":"ok");'
if needle not in s:
    raise SystemExit('Trecho final de loadData não encontrado')
s = s.replace(
    needle,
    needle + '\n      if(productSource!=="Firebase")setTimeout(()=>refreshProductsSilently().catch(error=>console.warn(error)),5000);',
    1,
)

for marker, count in before_markers.items():
    after = s.count(marker)
    if after != count:
        raise SystemExit(f'Módulo ativo alterado indevidamente: {marker} ({count} -> {after})')

path.write_text(s, encoding='utf-8')

scripts = re.findall(r'<script(?:\s[^>]*)?>([\s\S]*?)</script>', s, re.I)
with tempfile.TemporaryDirectory() as directory:
    for index, content in enumerate(scripts, 1):
        script = Path(directory) / f'inline-{index}.js'
        script.write_text(content, encoding='utf-8')
        subprocess.run(['node', '--check', str(script)], check=True)

print('Correção mínima aplicada; módulos e abas preservados.')
