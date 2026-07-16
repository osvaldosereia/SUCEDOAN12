from pathlib import Path
import re
p=Path('producao/index.html')
s=p.read_text()

def find_matching_brace(text, open_pos):
    depth=0;i=open_pos;state='code';quote='';esc=False;prev=''
    while i<len(text):
        c=text[i];n=text[i+1] if i+1<len(text) else ''
        if state=='line':
            if c=='\n':state='code'
        elif state=='block':
            if c=='*' and n=='/':state='code';i+=1
        elif state=='str':
            if esc:esc=False
            elif c=='\\':esc=True
            elif c==quote:state='code'
        elif state=='tmpl':
            if esc:esc=False
            elif c=='\\':esc=True
            elif c=='`':state='code'
        elif state=='regex':
            if esc:esc=False
            elif c=='\\':esc=True
            elif c=='[':state='rclass'
            elif c=='/':state='code'
        elif state=='rclass':
            if esc:esc=False
            elif c=='\\':esc=True
            elif c==']':state='regex'
        else:
            if c=='/' and n=='/':state='line';i+=1
            elif c=='/' and n=='*':state='block';i+=1
            elif c in "'\"":state='str';quote=c;esc=False
            elif c=='`':state='tmpl';esc=False
            elif c=='/' and prev in ('','(','[','{','=',':',',',';','!','?','&','|'):state='regex';esc=False
            elif c=='{':depth+=1;prev=c
            elif c=='}':
                depth-=1
                if depth==0:return i
                prev=c
            elif not c.isspace():prev=c
        i+=1
    raise ValueError(open_pos)

def spans(text,name):
    pats=[
      re.compile(rf'(?m)^[ \t]*(?:async[ \t]+)?function[ \t]+{re.escape(name)}[ \t]*\([^\n]*?\)[ \t]*\{{'),
      re.compile(rf'(?m)^[ \t]*{re.escape(name)}[ \t]*=[ \t]*(?:async[ \t]+)?function[ \t]*\([^\n]*?\)[ \t]*\{{'),
      re.compile(rf'(?m)^[ \t]*{re.escape(name)}[ \t]*=[ \t]*async[ \t]*\([^\n]*?\)[ \t]*=>[ \t]*\{{'),
    ]
    out=[]
    for pat in pats:
      for m in pat.finditer(text):
        op=text.rfind('{',m.start(),m.end());end=find_matching_brace(text,op)+1
        while end<len(text) and text[end] in ' \t':end+=1
        if end<len(text) and text[end]==';':end+=1
        if end<len(text) and text[end]=='\r':end+=1
        if end<len(text) and text[end]=='\n':end+=1
        out.append((m.start(),end))
    return sorted(set(out))

def remove_occ(text,name,idxs):
    ss=spans(text,name);sel=[]
    for idx in idxs:
      if idx<0:idx=len(ss)+idx
      if idx>=len(ss):raise Exception((name,idx,len(ss)))
      sel.append(ss[idx])
    for a,b in sorted(sel,reverse=True):text=text[:a]+text[b:]
    return text

for name,idxs in {
  'saveProducts':[0],
  'saveMeta':[0,1],
  'saveCestas':[0,1],
  'saveKits':[0,1],
  'saveGithubNow':[0],
  'saveEverything':[0,1],
  'githubUpsert':[0,1],
  'githubUpsertText':[0,1],
  'githubUpsertRaw':[0,1],
  'saveGithubFiles':[0,1],
  'githubContent':[0],
  'githubPutWithFreshSha':[0],
  'renderCatalogs':[0],
  'renderCategories':[0],
  'renderFlatRegistry':[0],
  'renderFornecedores':[0],
  'normalizeMeta':[0],
}.items():
    s=remove_occ(s,name,idxs)

for pat in [
  r'\n\s*const originalSaveCestas=saveCestas;\s*',
  r'\n\s*const originalSaveKits=saveKits;\s*',
  r'\n\s*const originalSaveMeta=saveMeta;\s*',
  r'\n\s*const originalSaveEverythingWithImageCleanup=saveEverything;\s*',
  r'\n\s*const originalUpdateProductFromCardForSelects=updateProductFromCard;\s*',
]:
    s=re.sub(pat,'\n',s,count=1)

render_spans=spans(s,'renderSettingsUi')
read_spans=spans(s,'readSettingsFromUi')
if not render_spans or not read_spans:raise Exception('settings spans missing')
settings_render='''  function renderSettingsUi(){
    if(typeof ensureProdutosHomeSettingField==="function")ensureProdutosHomeSettingField();
    const settings=state.settings;
    const fields={
      setFirebaseUrl:"firebaseUrl",setProdutosNode:"produtosNode",setMetaNode:"metaNode",setCestasNode:"cestasNode",setKitsNode:"kitsNode",
      setGithubToken:"githubToken",setGithubOwner:"githubOwner",setGithubRepo:"githubRepo",setGithubBranch:"githubBranch",setSiteBaseUrl:"siteBaseUrl",
      setGithubProdutosPath:"githubProdutosPath",setGithubProdutosHomePath:"githubProdutosHomePath",setGithubMetaPath:"githubMetaPath",setGithubAdminMetaPath:"githubAdminMetaPath",
      setGithubCestasPath:"githubCestasPath",setGithubKitsPath:"githubKitsPath",setGithubAnotacoesPath:"githubAnotacoesPath",setGithubImagesPath:"githubImagesPath",
      setImagePublicBase:"imagePublicBase",setGithubKitImagesPath:"githubKitImagesPath",setKitImagePublicBase:"kitImagePublicBase",
      setMakeTextWebhookUrl:"makeTextWebhookUrl",setMakeImageWebhookUrl:"makeImageWebhookUrl",setMakeInstagramKitWebhookUrl:"makeInstagramKitWebhookUrl",
      setMakeBannerWebhookUrl:"makeBannerWebhookUrl",setMakeBannerAutomaticWebhookUrl:"makeBannerAutomaticWebhookUrl",setMakeBlingWebhookUrl:"makeBlingWebhookUrl",
      setBlingToken:"blingToken",setBlingDeposito:"blingDeposito",setBlingUnidade:"blingUnidade"
    };
    Object.entries(fields).forEach(([id,key])=>{const element=document.getElementById(id);const value=String(settings[key]??"");if(element&&element.value!==value)element.value=value});
    const auto=document.getElementById("setAutoGithub");if(auto)auto.checked=!!settings.autoGithub;
  }
'''
settings_read='''  function readSettingsFromUi(){
    if(typeof ensureProdutosHomeSettingField==="function")ensureProdutosHomeSettingField();
    const fields={
      setFirebaseUrl:"firebaseUrl",setProdutosNode:"produtosNode",setMetaNode:"metaNode",setCestasNode:"cestasNode",setKitsNode:"kitsNode",
      setGithubToken:"githubToken",setGithubOwner:"githubOwner",setGithubRepo:"githubRepo",setGithubBranch:"githubBranch",setSiteBaseUrl:"siteBaseUrl",
      setGithubProdutosPath:"githubProdutosPath",setGithubProdutosHomePath:"githubProdutosHomePath",setGithubMetaPath:"githubMetaPath",setGithubAdminMetaPath:"githubAdminMetaPath",
      setGithubCestasPath:"githubCestasPath",setGithubKitsPath:"githubKitsPath",setGithubAnotacoesPath:"githubAnotacoesPath",setGithubImagesPath:"githubImagesPath",
      setImagePublicBase:"imagePublicBase",setGithubKitImagesPath:"githubKitImagesPath",setKitImagePublicBase:"kitImagePublicBase",
      setMakeTextWebhookUrl:"makeTextWebhookUrl",setMakeImageWebhookUrl:"makeImageWebhookUrl",setMakeInstagramKitWebhookUrl:"makeInstagramKitWebhookUrl",
      setMakeBannerWebhookUrl:"makeBannerWebhookUrl",setMakeBannerAutomaticWebhookUrl:"makeBannerAutomaticWebhookUrl",setMakeBlingWebhookUrl:"makeBlingWebhookUrl",
      setBlingToken:"blingToken",setBlingDeposito:"blingDeposito",setBlingUnidade:"blingUnidade"
    };
    Object.entries(fields).forEach(([id,key])=>{const element=document.getElementById(id);if(element)state.settings[key]=element.value.trim()});
    state.settings.githubProdutosHomePath=state.settings.githubProdutosHomePath||"site/produtos-home.json";
    state.settings.githubAnotacoesPath=state.settings.githubAnotacoesPath||"site/anotacoes.json";
    state.settings.autoGithub=!!document.getElementById("setAutoGithub")?.checked;
  }
'''
for a,b in sorted(render_spans[1:]+read_spans[1:],reverse=True):s=s[:a]+s[b:]
rs=spans(s,'renderSettingsUi')[0];s=s[:rs[0]]+settings_render+s[rs[1]:]
qs=spans(s,'readSettingsFromUi')[0];s=s[:qs[0]]+settings_read+s[qs[1]:]

for name in ['baseRenderSettingsUi','baseReadSettingsFromUi','aiBaseRenderSettingsUi','aiBaseReadSettingsFromUi','daOriginalRenderSettingsUiSmartGithub','daOriginalReadSettingsFromUiSmartGithub']:
    s=re.sub(rf'\n\s*const {name}=[^;]+;\s*','\n',s,count=1)

s=re.sub(r'\n{5,}','\n\n\n',s)
s=s.replace('const values=[[configuredBase,configuredNode],[defaultBase,defaultNode]];','const values=[[defaultBase,defaultNode],[configuredBase,configuredNode]];')
s=s.replace('''      if(typeof applyExpiryRules==="function"){
        const result=applyExpiryRules(product)||{fields:[]};
        if(result.fields?.length)markProductDirty(getKey(product),result.fields);
      }
''','''      if(typeof applyExpiryRules==="function")applyExpiryRules(product);
''')
s=s.replace('''  function daScheduleProductsRecovery(){
    if(daProductsRecoveryTimer||state.produtos.length)return;
''','''  function daScheduleProductsRecovery(force=false){
    if(daProductsRecoveryTimer||(!force&&state.produtos.length))return;
''')
s=s.replace('''    daProductsRecoveryTimer=setTimeout(async()=>{
      daProductsRecoveryTimer=null;daProductsRecoveryAttempt++;
      try{
''','''    daProductsRecoveryTimer=setTimeout(async()=>{
      daProductsRecoveryTimer=null;daProductsRecoveryAttempt++;
      if(state.dirtyProductKeys.size||state.deletedProductKeys.size){daScheduleProductsRecovery(true);return}
      try{
''')
s=s.replace('''      }catch(error){console.warn("Nova tentativa automática do Firebase falhou:",error);daScheduleProductsRecovery()}
''','''      }catch(error){console.warn("Nova tentativa automática do Firebase falhou:",error);daScheduleProductsRecovery(true)}
''')
s=s.replace('''      if(productResult?.products?.length){
        daRenderLoadedProducts(productResult);
        writeProductsCache(productResult.products,productResult.source).catch(error=>console.warn("Cache de produtos não atualizado:",error));
''','''      if(productResult?.products?.length){
        daRenderLoadedProducts(productResult);
        writeProductsCache(productResult.products,productResult.source).catch(error=>console.warn("Cache de produtos não atualizado:",error));
        if(firebaseError||productResult.source!=="Firebase")daScheduleProductsRecovery(true);
''')
s=s.replace('''      }else if(cacheResult?.products?.length){
        daRenderLoadedProducts({...cacheResult,warning:"Firebase temporariamente indisponível"},{provisional:true});
''','''      }else if(cacheResult?.products?.length){
        daRenderLoadedProducts({...cacheResult,warning:"Firebase temporariamente indisponível"},{provisional:true});
        daScheduleProductsRecovery(true);
''')
s=s.replace('''      }else if(state.produtos.length){
        setStatus(`Mantendo ${state.produtos.length} produtos da sessão; o Firebase será consultado novamente automaticamente.`,"warn");
''','''      }else if(state.produtos.length){
        setStatus(`Mantendo ${state.produtos.length} produtos da sessão; o Firebase será consultado novamente automaticamente.`,"warn");
        daScheduleProductsRecovery(true);
''')
s=s.replace('  const daOriginalRenderSettingsUiSmartGithub = renderSettingsUi;\n\n  const daOriginalReadSettingsFromUiSmartGithub = readSettingsFromUi;\n','')
p.write_text(s)
print('round2',len(s),s.count('\n')+1)
