from pathlib import Path

SITE_PATHS=[Path('index.html'),Path('vitrine/index.html')]
ADMIN_PATH=Path('vitrine/admin/index.html')

SITE_CONSTANTS="""    const WHATSAPP_CHANNELS={'0975':'5565998150975','1018':'5565984491018'};
    const DEFAULT_WHATSAPP_ORIGIN='0975';
    const WHATSAPP=WHATSAPP_CHANNELS[DEFAULT_WHATSAPP_ORIGIN];
    const MARKETING_CONTEXT_KEY='da_vitrine_marketing_context_v1';
    const CAMPAIGN_BRANDS={
      'nivea':{signal:'NIVEA',label:'NIVEA'},
      'elseve':{signal:'ELSEVE',label:'Elseve'},
      'seda':{signal:'SEDA',label:'Seda'},
      'monange':{signal:'MONANGE',label:'Monange'},
      'lola-cosmetics':{signal:'LOLA',label:'Lola Cosmetics'},
      'skala':{signal:'SKALA',label:'Skala'},
      'dove':{signal:'DOVE',label:'Dove'},
      'omo':{signal:'OMO',label:'OMO'},
      'ype':{signal:'YPE',label:'Ypê'},
      'downy':{signal:'DOWNY',label:'Downy'}
    };
    const MARKETING_CATEGORIES=new Set(['bebe','cabelos','beleza','higiene','limpeza','lavanderia','pet','casa','doces-lanches']);
    const MARKETING_CTA_PRIORITY=['BEBE','PET','CABELOS','BELEZA','LAVANDERIA','LIMPEZA','DOCES_LANCHES','HIGIENE','CASA'];"""

SITE_HELPERS=r'''    function marketingSlug(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}
    function readStoredMarketingContext(){try{const value=JSON.parse(sessionStorage.getItem(MARKETING_CONTEXT_KEY)||'null');if(!value||Date.now()-Number(value.captured_at||0)>4*60*60*1000)return null;return value}catch{return null}}
    function captureMarketingEntryContext(){
      const params=new URLSearchParams(location.search),keys=['origem','ofertas','categoria','marca','campanha'],hasEntry=keys.some(k=>params.has(k));
      let ctx=readStoredMarketingContext();
      if(hasEntry){
        const requestedOrigin=String(params.get('origem')||'').trim(),origin=WHATSAPP_CHANNELS[requestedOrigin]?requestedOrigin:DEFAULT_WHATSAPP_ORIGIN;
        const category=marketingSlug(params.get('categoria')||''),brand=marketingSlug(params.get('marca')||''),campaign=marketingSlug(params.get('campanha')||'');
        ctx={origin,offers:params.get('ofertas')==='1',category:MARKETING_CATEGORIES.has(category)?category:'',brand:CAMPAIGN_BRANDS[brand]?brand:'',campaign,captured_at:Date.now()};
        try{sessionStorage.setItem(MARKETING_CONTEXT_KEY,JSON.stringify(ctx))}catch{}
        keys.forEach(k=>params.delete(k));const qs=params.toString();history.replaceState(null,'',location.pathname+(qs?'?'+qs:'')+location.hash);
      }
      if(!ctx)ctx={origin:DEFAULT_WHATSAPP_ORIGIN,offers:false,category:'',brand:'',campaign:'',captured_at:Date.now()};
      state.marketingContext=ctx;state.whatsappOrigin=WHATSAPP_CHANNELS[ctx.origin]?ctx.origin:DEFAULT_WHATSAPP_ORIGIN;return ctx;
    }
    function resolveWhatsappDestination(){return WHATSAPP_CHANNELS[state.whatsappOrigin]||WHATSAPP_CHANNELS[DEFAULT_WHATSAPP_ORIGIN]}
    function marketingInterestForProduct(product){
      const sub=marketingSlug(product?.subcategory||''),leaf=marketingSlug(product?.subsubcategory||'');
      if(sub==='bebe'||leaf.includes('fralda')||leaf.includes('bebe'))return 'BEBE';
      if(sub==='cabelos'||['shampoo','condicionador','creme-de-pentear','tratamentos-capilares','coloracao-capilar','oleos-e-seruns-capilares','acessorios-de-cabelo','escovas-e-pentes','kits-de-shampoo-e-condicionador'].includes(leaf))return 'CABELOS';
      if(sub==='beleza-e-cuidados'||['unhas','labios','cuidados-corporais','cuidados-com-o-rosto','protecao-da-pele','acessorios-de-beleza'].includes(leaf))return 'BELEZA';
      if(sub==='higiene-pessoal')return 'HIGIENE';
      if(sub==='limpeza')return 'LIMPEZA';
      if(sub==='lavanderia')return 'LAVANDERIA';
      if(sub==='pets'||['caes','gatos','petiscos-para-pets','higiene-pet'].includes(leaf))return 'PET';
      if(sub==='casa-e-utilidades')return 'CASA';
      if(['biscoitos','chocolates-e-doces','balas-e-chicletes','salgadinhos-e-petiscos','bebidas','cereais-e-barras'].includes(leaf))return 'DOCES_LANCHES';
      return '';
    }
    function buildMarketingSignals(){
      const interests=new Set(),brands=new Set(),standalone=state.cart.filter(item=>item.type==='product'&&Number(item.qty||0)>0);
      if(state.cart.some(item=>item.type==='basket'&&Number(item.qty||0)>0))interests.add('CESTAS');
      for(const item of standalone){const p=state.productsById.get(item.id)||item,interest=marketingInterestForProduct(p);if(interest)interests.add(interest);const bk=marketingSlug(p.brand||'');if(CAMPAIGN_BRANDS[bk])brands.add(CAMPAIGN_BRANDS[bk].signal)}
      const optIn=state.customerLookup.customer?.marketing_opt_in===true||$('#checkoutMarketing')?.checked===true,ordered=MARKETING_CTA_PRIORITY.find(x=>interests.has(x)),cta=optIn?(ordered||(interests.has('CESTAS')?'OFERTAS':'NENHUM')):'NENHUM';
      return {interests:[...interests],brands:[...brands],optIn,cta,campaign:marketingSlug(state.marketingContext?.campaign||'')};
    }
    function applyMarketingEntryContext(){
      if(state.marketingEntryApplied)return;const ctx=state.marketingContext||captureMarketingEntryContext();state.marketingEntryApplied=true;
      if(ctx.brand&&CAMPAIGN_BRANDS[ctx.brand]){renderSearch(CAMPAIGN_BRANDS[ctx.brand].label);return}
      if(ctx.category){renderMarketingCategory(ctx.category);return}
      if(ctx.offers)renderOffers();
    }
'''

MARKETING_CATEGORY_FUNCTION=r'''    async function renderMarketingCategory(segment){
      const slug=marketingSlug(segment),configs={
        'bebe':{sales:'higiene_beleza',label:'Produtos para bebê',match:p=>marketingSlug(p.subcategory)==='bebe'||marketingSlug(p.subsubcategory).includes('fralda')||marketingSlug(p.subsubcategory).includes('bebe')},
        'cabelos':{sales:'higiene_beleza',label:'Produtos para cabelo',match:p=>marketingSlug(p.subcategory)==='cabelos'},
        'beleza':{sales:'higiene_beleza',label:'Beleza e cuidados',match:p=>marketingSlug(p.subcategory)==='beleza-e-cuidados'},
        'higiene':{sales:'higiene_beleza',label:'Higiene pessoal',match:p=>marketingSlug(p.subcategory)==='higiene-pessoal'},
        'limpeza':{sales:'limpeza_lavanderia',label:'Produtos de limpeza',match:p=>marketingSlug(p.subcategory)==='limpeza'},
        'lavanderia':{sales:'limpeza_lavanderia',label:'Lavanderia',match:p=>marketingSlug(p.subcategory)==='lavanderia'},
        'pet':{sales:'casa_pet',label:'Produtos para pets',match:p=>marketingSlug(p.subcategory)==='pets'||['caes','gatos','petiscos-para-pets','higiene-pet'].includes(marketingSlug(p.subsubcategory))},
        'casa':{sales:'casa_pet',label:'Casa e utilidades',match:p=>marketingSlug(p.subcategory)==='casa-e-utilidades'},
        'doces-lanches':{sales:'mercearia',label:'Doces e lanches',match:p=>['biscoitos','chocolates-e-doces','balas-e-chicletes','salgadinhos-e-petiscos','bebidas','cereais-e-barras'].includes(marketingSlug(p.subsubcategory))}
      },cfg=configs[slug];if(!cfg){renderHome();return}
      state.view='marketing:'+slug;state.category=null;state.query='';renderNav();$('#globalSearchInput').value='';content.innerHTML='<section class="section"><div class="section-head"><div><h2>'+esc(cfg.label)+'</h2><p>Seleção do catálogo disponível agora.</p></div><button class="text-btn" type="button" id="backHome">Voltar</button></div><div class="grid" id="productGrid"><div class="loader"></div><div class="loader"></div></div></section>';$('#backHome').onclick=renderHome;
      try{let offset=0,found=[],guard=0;while(offset!=null&&guard<18&&found.length<24){const data=await api('products',{category:cfg.sales,limit:36,offset});for(const p of data.products||[])if(cfg.match(p))found.push(p);offset=data.next_offset;guard++}found=found.slice(0,24);const grid=$('#productGrid');grid.innerHTML=found.length?found.map((p,i)=>productCard(p,false,i)).join(''):'<div class="empty">Não encontrei produtos disponíveis nesta seleção agora.</div>';attachProductControls(grid,found)}catch{$('#productGrid').innerHTML='<div class="empty">Não consegui carregar esta seleção agora. <button class="text-btn" id="retryMarketingCategory">Tentar novamente</button></div>';$('#retryMarketingCategory').onclick=()=>renderMarketingCategory(slug)}window.scrollTo({top:0,behavior:'smooth'})
    }
'''

CHECKOUT_MARKETING_HELPER=r'''    function checkoutMarketingPreferenceHtml(){const c=state.customerLookup.customer;if(state.customerLookup.status!=='found'||c?.registration_complete!==true||state.editRegistration)return '';return '<div class="rule-notice"><strong>Ofertas pelo WhatsApp</strong>'+(c.marketing_opt_in?'Você autorizou ofertas, promoções e recomendações da Dona Antônia.':'Você não autorizou ofertas de marketing pelo WhatsApp.')+'<div style="margin-top:8px"><button type="button" class="secondary" id="editMarketingPreference">Alterar preferência</button></div></div>'}
'''


def patch_site(path:Path):
    s=path.read_text(encoding='utf-8')
    if "function captureMarketingEntryContext()" in s:
        print(f'{path}: already patched')
        return
    old="    const WHATSAPP = '5565998150975';"
    if old not in s: raise SystemExit(f'{path}: whatsapp constant anchor missing')
    s=s.replace(old,SITE_CONSTANTS,1)
    old="      whatsappPhone: '',\n      checkoutDdd: '65',"
    new="      whatsappPhone: '',\n      whatsappOrigin: DEFAULT_WHATSAPP_ORIGIN,\n      marketingContext: null,\n      marketingEntryApplied: false,\n      checkoutDdd: '65',"
    if old not in s: raise SystemExit(f'{path}: state anchor missing')
    s=s.replace(old,new,1)
    anchor="    function captureWhatsappPhone(){"
    if anchor not in s: raise SystemExit(f'{path}: phone capture anchor missing')
    s=s.replace(anchor,SITE_HELPERS+anchor,1)
    anchor="    async function renderSearch(q){"
    if anchor not in s: raise SystemExit(f'{path}: search anchor missing')
    s=s.replace(anchor,MARKETING_CATEGORY_FUNCTION+anchor,1)
    old="state.cart.push({type:'product',id,name:p.name,image_url:p.image_url||'',unit_cents:Number(p.price_cents||0),stock_quantity:stockNumber(p.stock_quantity),qty:1})"
    new="state.cart.push({type:'product',id,name:p.name,image_url:p.image_url||'',unit_cents:Number(p.price_cents||0),stock_quantity:stockNumber(p.stock_quantity),brand:p.brand||'',category:p.category||'',subcategory:p.subcategory||'',subsubcategory:p.subsubcategory||'',qty:1})"
    if old not in s: raise SystemExit(f'{path}: product cart anchor missing')
    s=s.replace(old,new,1)
    anchor="    function registrationSectionHtml(){"
    if anchor not in s: raise SystemExit(f'{path}: registration section anchor missing')
    s=s.replace(anchor,CHECKOUT_MARKETING_HELPER+anchor,1)
    old="'+registrationSectionHtml()+'<h3 class=\"checkout-title\">Data de entrega</h3>"
    new="'+registrationSectionHtml()+checkoutMarketingPreferenceHtml()+'<h3 class=\"checkout-title\">Data de entrega</h3>"
    if old not in s: raise SystemExit(f'{path}: checkout marketing mount anchor missing')
    s=s.replace(old,new,1)
    old="if($('#editAddress'))$('#editAddress').onclick=()=>{state.editRegistration=true;state.addressConfirmed=false;paintCheckout()};if($('#saveCheckoutRegistration'))"
    new="if($('#editAddress'))$('#editAddress').onclick=()=>{state.editRegistration=true;state.addressConfirmed=false;paintCheckout()};if($('#editMarketingPreference'))$('#editMarketingPreference').onclick=()=>{state.editRegistration=true;state.addressConfirmed=false;paintCheckout()};if($('#saveCheckoutRegistration'))"
    if old not in s: raise SystemExit(f'{path}: checkout handler anchor missing')
    s=s.replace(old,new,1)
    old="if(state.customerLookup.status!=='found'||state.customerLookup.customer?.registration_complete!==true||state.addressConfirmed!==true){toast('Confirme seu cadastro e endereço antes de finalizar');return}const handoffWindow=reserveWhatsAppHandoff()"
    new="if(state.customerLookup.status!=='found'||state.customerLookup.customer?.registration_complete!==true||state.addressConfirmed!==true){toast('Confirme seu cadastro e endereço antes de finalizar');return}const marketingSignals=buildMarketingSignals();const handoffWindow=reserveWhatsAppHandoff()"
    if old not in s: raise SystemExit(f'{path}: send marketing signal anchor missing')
    s=s.replace(old,new,1)
    old="body:JSON.stringify({payment_method:selected.value,whatsapp_phone:info.full,delivery_date:state.checkoutDeliveryDate,items:"
    new="body:JSON.stringify({payment_method:selected.value,whatsapp_phone:info.full,delivery_date:state.checkoutDeliveryDate,whatsapp_origin:state.whatsappOrigin,marketing_context:state.marketingContext||null,items:"
    if old not in s: raise SystemExit(f'{path}: submit payload anchor missing')
    s=s.replace(old,new,1)
    old="lines.push('','TOTAL: '+money(saved?.total_cents??cartTotal()),'PAGAMENTO: '+selected.value);if(saved?.delivery?.reason==='after_cutoff')lines.push('OBS: pedido realizado a partir das 11h de Cuiabá.');const url='https://wa.me/'+WHATSAPP+'?text='+encodeURIComponent(lines.join('\\n'));"
    new="lines.push('','TOTAL: '+money(saved?.total_cents??cartTotal()),'PAGAMENTO: '+selected.value);lines.push('','INTERESSES_MKT: '+(marketingSignals.interests.length?marketingSignals.interests.join(' | '):'NENHUM'),'MARCAS_MKT: '+(marketingSignals.brands.length?marketingSignals.brands.join(' | '):'NENHUMA'),'OFERTAS_WHATSAPP: '+(marketingSignals.optIn?'SIM':'NAO'),'CTA_POS_PEDIDO: '+marketingSignals.cta);if(marketingSignals.campaign)lines.push('CAMPANHA_ORIGEM: '+marketingSignals.campaign);if(saved?.delivery?.reason==='after_cutoff')lines.push('OBS: pedido realizado a partir das 11h de Cuiabá.');const url='https://wa.me/'+resolveWhatsappDestination()+'?text='+encodeURIComponent(lines.join('\\n'));"
    if old not in s: raise SystemExit(f'{path}: whatsapp message anchor missing')
    s=s.replace(old,new,1)
    old="async function start(){state.whatsappPhone=await resolveEntryWhatsappPhone();"
    new="async function start(){captureMarketingEntryContext();state.whatsappPhone=await resolveEntryWhatsappPhone();"
    if old not in s: raise SystemExit(f'{path}: start anchor missing')
    s=s.replace(old,new,1)
    old="writeCache(HOME_CACHE_KEY,state.home);if(state.view==='home'&&!hadCached)renderHome()}catch(e)"
    new="writeCache(HOME_CACHE_KEY,state.home);if(state.view==='home'&&!hadCached)renderHome();applyMarketingEntryContext()}catch(e)"
    if old not in s: raise SystemExit(f'{path}: entry apply anchor missing')
    s=s.replace(old,new,1)
    s=s.replace("href=\"https://wa.me/'+WHATSAPP+'\"", "href=\"https://wa.me/'+resolveWhatsappDestination()+'\"",1)
    path.write_text(s,encoding='utf-8')
    print(f'{path}: patched')

ADMIN_CSS=r'''    .marketing-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.marketing-card{border:1px solid var(--line);border-radius:13px;background:#fff;padding:12px}.marketing-card h3{font-size:15px;margin:0 0 4px}.marketing-card p{margin:0;color:var(--muted);font-size:11px}.marketing-kpis{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.marketing-kpis span{background:var(--soft);border-radius:999px;padding:5px 8px;font-size:10px;font-weight:800}.marketing-section{margin-top:16px}.marketing-chip-list{display:flex;gap:6px;flex-wrap:wrap}.marketing-chip{display:inline-flex;align-items:center;border:1px solid var(--line);background:#fff;border-radius:999px;padding:7px 10px;font-size:11px;font-weight:800}.marketing-builder{display:grid;grid-template-columns:130px 1fr 1fr;gap:8px}.marketing-url{grid-column:1/-1;display:grid;grid-template-columns:1fr auto;gap:8px}.marketing-url input{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}@media(max-width:760px){.marketing-grid{grid-template-columns:1fr}.marketing-builder{grid-template-columns:1fr}.marketing-url{grid-template-columns:1fr}.marketing-url button{width:100%}}
'''

ADMIN_HELPERS=r'''  const MARKETING_BRANDS=[{key:'nivea',label:'NIVEA'},{key:'elseve',label:'Elseve'},{key:'seda',label:'Seda'},{key:'monange',label:'Monange'},{key:'lola-cosmetics',label:'Lola Cosmetics'},{key:'skala',label:'Skala'},{key:'dove',label:'Dove'},{key:'omo',label:'OMO'},{key:'ype',label:'Ypê'},{key:'downy',label:'Downy'}];
  const MARKETING_SEGMENTS=[{key:'bebe',label:'Bebê'},{key:'cabelos',label:'Cabelos'},{key:'beleza',label:'Beleza e cuidados'},{key:'higiene',label:'Higiene pessoal'},{key:'limpeza',label:'Limpeza'},{key:'lavanderia',label:'Lavanderia'},{key:'pet',label:'Pet'},{key:'casa',label:'Casa'},{key:'doces-lanches',label:'Doces e lanches'}];
  function marketingSegmentOf(p){const sub=normalize(p?.subcategory||''),leaf=normalize(p?.subsubcategory||'');if(sub.includes('bebe')||leaf.includes('fralda')||leaf.includes('bebe'))return 'Bebê';if(sub==='cabelos')return 'Cabelos';if(sub.includes('beleza'))return 'Beleza e cuidados';if(sub.includes('higiene pessoal'))return 'Higiene pessoal';if(sub==='limpeza')return 'Limpeza';if(sub==='lavanderia')return 'Lavanderia';if(sub==='pets'||leaf.includes('pet')||leaf==='caes'||leaf==='gatos')return 'Pet';if(sub.includes('casa e utilidades'))return 'Casa';if(['biscoitos','chocolates e doces','balas e chicletes','salgadinhos e petiscos','bebidas','cereais e barras'].includes(leaf))return 'Doces e lanches';return 'Outros'}
  function marketingCampaignSlug(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)}
'''

ADMIN_RENDER=r'''  async function renderMarketing(){
    const content=$('#content');content.innerHTML='<div class="page-head"><div><h1>Marketing</h1><p>Radar de oportunidades, segmentação e links de campanha. Nenhum envio é feito por esta tela.</p></div><button class="secondary" type="button" id="refreshMarketing">Atualizar</button></div><div class="panel"><div class="loading" id="marketingLoading">Lendo ofertas ativas do catálogo…</div></div>';
    if($('#refreshMarketing'))$('#refreshMarketing').onclick=renderMarketing;
    try{const data=await storefrontApi('offers'),offers=Array.isArray(data.offers)?data.offers:[],groups=new Map();for(const p of offers){const name=marketingSegmentOf(p),x=groups.get(name)||{name,offers:0,stock:0,brands:new Set()};x.offers++;x.stock+=Number(p.stock_quantity||0);if(p.brand)x.brands.add(p.brand);groups.set(name,x)}const cards=[...groups.values()].sort((a,b)=>b.offers-a.offers).map(x=>'<div class="marketing-card"><h3>'+esc(x.name)+'</h3><p>Oportunidade baseada nas ofertas públicas ativas agora.</p><div class="marketing-kpis"><span>'+x.offers+' ofertas</span><span>'+fmtQty(x.stock)+' un. disponíveis</span>'+(x.brands.size?'<span>'+esc([...x.brands].slice(0,3).join(' · '))+'</span>':'')+'</div></div>').join('')||'<div class="empty">Nenhuma oferta ativa para montar radar agora.</div>';
      content.innerHTML='<div class="page-head"><div><h1>Marketing</h1><p>Inteligência comercial sem disparo automático.</p></div><button class="secondary" type="button" id="refreshMarketing">Atualizar</button></div><section><div class="section-title" style="border-top:0;margin-top:0">Radar de Marketing</div><div class="marketing-grid">'+cards+'</div></section><section class="marketing-section"><div class="section-title">Segmentação</div><p class="muted">Os componentes automáticos das cestas não contam para afinidade de categoria ou marca. Só produtos avulsos alimentam os sinais do pedido.</p><div class="marketing-chip-list" style="margin-top:9px">'+MARKETING_SEGMENTS.map(x=>'<span class="marketing-chip">INT_'+esc(x.key.replace('-','_').toUpperCase())+'</span>').join('')+'</div><div class="section-title">Marcas autorizadas</div><div class="marketing-chip-list">'+MARKETING_BRANDS.map(x=>'<span class="marketing-chip">'+esc(x.label)+'</span>').join('')+'</div><p class="muted" style="margin-top:8px">A allowlist persistente já está preparada no banco. Enquanto o projeto está no limite de Edge Functions, esta versão usa a mesma lista fixa no site/Admin e não cria dependência de função nova.</p></section><section class="marketing-section"><div class="section-title">Links / Campanhas</div><div class="marketing-builder"><label><span>Canal</span><select id="mktChannel"><option value="0975">0975</option><option value="1018">1018</option></select></label><label><span>Destino</span><select id="mktTarget"><option value="offers">Ofertas</option>'+MARKETING_SEGMENTS.map(x=>'<option value="category:'+esc(x.key)+'">'+esc(x.label)+'</option>').join('')+'</select></label><label><span>Marca (opcional)</span><select id="mktBrand"><option value="">Nenhuma</option>'+MARKETING_BRANDS.map(x=>'<option value="'+esc(x.key)+'">'+esc(x.label)+'</option>').join('')+'</select></label><label style="grid-column:1/-1"><span>Nome da campanha (opcional)</span><input id="mktCampaign" placeholder="ex.: semana_bebe_out26"></label><div class="marketing-url"><input id="mktUrl" readonly><button class="primary" type="button" id="copyMktUrl">Copiar link</button></div></div></section><section class="marketing-section"><div class="section-title">Configuração</div><div class="panel" style="padding:12px"><strong>Prioridade atual de CTA pós-pedido</strong><p class="muted">Bebê → Pet → Cabelos → Beleza → Lavanderia → Limpeza → Doces/Lanches → Higiene → Casa → Ofertas para cesta.</p><p class="muted">O CTA só é sinalizado quando o cliente autorizou ofertas pelo WhatsApp.</p></div></section>';
      const updateLink=()=>{const channel=$('#mktChannel')?.value||'0975',target=$('#mktTarget')?.value||'offers',brand=$('#mktBrand')?.value||'',campaign=marketingCampaignSlug($('#mktCampaign')?.value||''),u=new URL('https://www.donaantonia.com.br/');u.searchParams.set('origem',channel);if(brand)u.searchParams.set('marca',brand);else if(target==='offers')u.searchParams.set('ofertas','1');else if(target.startsWith('category:'))u.searchParams.set('categoria',target.slice(9));if(campaign)u.searchParams.set('campanha',campaign);if($('#mktUrl'))$('#mktUrl').value=u.toString()};['mktChannel','mktTarget','mktBrand','mktCampaign'].forEach(id=>$('#'+id)?.addEventListener(id==='mktCampaign'?'input':'change',updateLink));$('#mktTarget')?.addEventListener('change',()=>{if($('#mktBrand'))$('#mktBrand').value='';updateLink()});$('#mktBrand')?.addEventListener('change',()=>updateLink());if($('#copyMktUrl'))$('#copyMktUrl').onclick=async()=>{updateLink();const value=$('#mktUrl')?.value||'';try{await navigator.clipboard.writeText(value);toast('Link copiado')}catch{const i=$('#mktUrl');i?.select();document.execCommand('copy');toast('Link copiado')}};if($('#refreshMarketing'))$('#refreshMarketing').onclick=renderMarketing;updateLink();
    }catch(e){content.innerHTML='<div class="page-head"><div><h1>Marketing</h1><p>Radar de oportunidades.</p></div></div><div class="empty">Não consegui carregar as ofertas agora.<br><button class="text" id="retryMarketing">Tentar novamente</button></div>';if($('#retryMarketing'))$('#retryMarketing').onclick=renderMarketing}
  }

'''


def patch_admin(path:Path):
    s=path.read_text(encoding='utf-8')
    if "function renderMarketing()" in s:
        print(f'{path}: already patched')
        return
    old="    .quote-admin-shell{background:#fff;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}.quote-admin-frame{display:block;width:100%;height:calc(100vh - 190px);min-height:720px;border:0;background:#f3f5f8}"
    if old not in s: raise SystemExit('admin css anchor missing')
    s=s.replace(old,old+'\n'+ADMIN_CSS,1)
    old='<button class="tab nav-subtab" data-tab="customers" type="button">Clientes</button>'
    new=old+'\n            <button class="tab nav-subtab" data-tab="marketing" type="button">Marketing</button>'
    if old not in s: raise SystemExit('admin nav anchor missing')
    s=s.replace(old,new,1)
    anchor="  const OPERATOR_KEY='da_operator_name_v1';"
    if anchor not in s: raise SystemExit('admin helper anchor missing')
    s=s.replace(anchor,ADMIN_HELPERS+anchor,1)
    old="    if(tab==='quotes')renderQuotes();\n    if(tab==='expiry')"
    new="    if(tab==='quotes')renderQuotes();\n    if(tab==='marketing')renderMarketing();\n    if(tab==='expiry')"
    if old not in s: raise SystemExit('admin setTab anchor missing')
    s=s.replace(old,new,1)
    anchor="  async function renderQuotes(){"
    if anchor not in s: raise SystemExit('admin render anchor missing')
    s=s.replace(anchor,ADMIN_RENDER+anchor,1)
    path.write_text(s,encoding='utf-8')
    print(f'{path}: patched')

for path in SITE_PATHS:patch_site(path)
patch_admin(ADMIN_PATH)
