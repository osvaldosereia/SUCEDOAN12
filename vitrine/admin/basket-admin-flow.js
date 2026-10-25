(() => {
  'use strict';
  const api=()=>window.DonaAntoniaBasketAdminApi;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(cents||0)/100);
  const state={root:null,config:null,busy:false,settingsDirty:false,selectedBasketId:'',openTypeId:'',preview:null,previewLoading:false,previewError:'',startingPrices:Object.create(null),priceLoading:false,priceRequestId:0,previewRequestId:0,quoteTimer:null,quoteRequestId:0};
  const basketTypes=()=>[...(state.config?.basket_types||[])].sort((a,b)=>Number(a.flow_sort_order||0)-Number(b.flow_sort_order||0)||String(a.name).localeCompare(String(b.name),'pt-BR'));
  const productTypes=()=>[...(state.config?.product_types||[])].sort((a,b)=>Number(a.flow_sort_order||0)-Number(b.flow_sort_order||0)||String(a.name).localeCompare(String(b.name),'pt-BR'));
  const selectedBasket=()=>basketTypes().find(x=>String(x.id)===String(state.selectedBasketId))||null;
  const number=(value,fallback=0)=>{const n=Number(value);return Number.isFinite(n)?n:fallback};
  function startingPriceLabel(basket){
    if(!basket.linked_template_id||basket.template_active!==true)return 'Preço indisponível neste modelo';
    const price=state.startingPrices[String(basket.id)];
    if(price?.cents!=null)return 'A partir de '+money(price.cents)+' · combinação '+price.compositionNumber;
    if(price?.error)return price.error;
    return state.priceLoading?'Calculando preço inicial…':'Preço inicial ainda não consultado';
  }
  function style(){
    if(document.getElementById('daBasketFlowAdminStyle'))return;
    const s=document.createElement('style');s.id='daBasketFlowAdminStyle';
    s.textContent='.da-flow-admin{display:grid;gap:14px;color:#17221b}.da-flow-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.da-flow-head h2{margin:0}.da-flow-note{padding:12px 14px;border-radius:12px;background:#f4f8f5;color:#536159;font-size:13px}.da-flow-layout{display:grid;grid-template-columns:minmax(230px,.7fr) minmax(0,1.3fr);gap:12px}.da-flow-panel{border:1px solid #e1e7e3;background:#fff;border-radius:14px;padding:14px;min-width:0}.da-flow-panel h3{margin:0 0 10px;font-size:16px}.da-flow-size-list,.da-flow-step-list{display:grid;gap:8px}.da-flow-size{display:grid;grid-template-columns:22px minmax(0,1fr) 74px;gap:8px;align-items:center;padding:10px;border:1px solid #e1e7e3;border-radius:11px}.da-flow-size.selected{border:2px solid #176b43;background:#f5faf6}.da-flow-size-main{min-width:0;cursor:pointer}.da-flow-size-main strong{display:block}.da-flow-size-main small{display:block;color:#68756d;margin-top:3px}.da-flow-size input[type=number],.da-flow-order,.da-flow-max{width:74px;min-height:38px;border:1px solid #d7e0da;border-radius:8px;padding:6px;text-align:center;background:#fff}.da-flow-switch{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800;color:#536159}.da-flow-subhead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0 10px}.da-flow-subhead strong{font-size:14px}.da-flow-step{border:1px solid #e1e7e3;border-radius:12px;background:#fff;overflow:hidden}.da-flow-step-head{display:grid;grid-template-columns:28px minmax(120px,1fr) 70px minmax(120px,.8fr) 64px minmax(64px,max-content);gap:7px;align-items:center;padding:9px}.da-flow-step-name strong{display:block}.da-flow-step-name small{display:block;color:#657169;font-size:11px;margin-top:2px}.da-flow-step-head>button{white-space:nowrap;min-width:64px}.da-flow-step select{min-height:38px;border:1px solid #d7e0da;border-radius:8px;padding:5px;background:#fff}.da-flow-step button,.da-flow-admin button{min-height:38px;border:1px solid #dce4df;border-radius:9px;background:#fff;padding:0 10px;font-weight:800;cursor:pointer}.da-flow-admin button.primary{background:#176b43;border-color:#176b43;color:#fff}.da-flow-admin button:disabled{opacity:.55;cursor:wait}.da-flow-options{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;padding:0 10px 10px}.da-flow-position-labels{padding:0 10px 10px}.da-flow-position-labels label{display:block;color:#536159;font-size:12px;font-weight:800}.da-flow-position-labels textarea{display:block;width:100%;min-height:76px;margin-top:5px;border:1px solid #d7e0da;border-radius:8px;padding:8px;font:inherit;font-size:12px;resize:vertical}.da-flow-option{border:1px solid #e1e7e3;border-radius:10px;padding:8px;min-width:0}.da-flow-option img{width:100%;height:94px;object-fit:contain;background:#f6f8f6;border-radius:7px}.da-flow-option strong{display:block;font-size:12px;line-height:1.3;margin-top:5px}.da-flow-option small{display:block;color:#66716a;font-size:11px;margin-top:3px}.da-flow-price{font-weight:900;color:#176b43}.da-flow-muted{color:#758078;font-size:12px}.da-flow-save{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}.da-flow-preview{display:grid;gap:10px}.da-flow-preview-top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.da-flow-preview-step{border:1px solid #e1e7e3;border-radius:12px;padding:12px;background:#fff}.da-flow-preview-step-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.da-flow-preview-products{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;margin-top:10px}.da-flow-preview-product{display:grid;grid-template-columns:64px minmax(0,1fr);gap:8px;align-items:center;border:1px solid #e1e7e3;border-radius:10px;padding:8px}.da-flow-preview-product img{width:62px;height:62px;object-fit:contain;background:#f6f8f6;border-radius:7px}.da-flow-preview-product strong{display:block;font-size:12px;line-height:1.25}.da-flow-preview-product small{display:block;color:#66716a;font-size:10px;margin-top:3px}.da-flow-preview-product input{grid-column:1/-1;width:100%;min-height:38px;border:1px solid #d7e0da;border-radius:8px;padding:6px 9px}.da-flow-total{position:sticky;bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;background:#173b29;color:#fff;font-weight:900;box-shadow:0 5px 18px #12251a30}.da-flow-status{padding:10px 12px;border-radius:10px;background:#f1f5f2;color:#536159;font-size:12px}.da-flow-status.warn{background:#fff4e5;color:#845400}.da-flow-error{padding:12px;border:1px solid #edc8c4;border-radius:10px;background:#fff7f6;color:#922a31}.da-flow-empty{padding:20px;text-align:center;color:#66716a;border:1px dashed #d2dbd5;border-radius:10px}@media(max-width:1100px){.da-flow-layout{grid-template-columns:1fr}}@media(max-width:780px){.da-flow-step-head{grid-template-columns:26px minmax(0,1fr) 62px 64px}.da-flow-step-head select{grid-column:2/5;grid-row:2}.da-flow-step-head .da-flow-max{grid-column:2/5;grid-row:3;width:100%}.da-flow-option img{height:80px}}';
    document.head.appendChild(s);
  }
  function checkConfiguration(){
    const warnings=[];
    const mappedLabels=new Map();
    for(const type of productTypes()){
      const labels=Array.isArray(type.position_labels)?type.position_labels:[];
      if(labels.length>20||labels.some(x=>String(x).trim().length>120))warnings.push(type.name+': os rótulos de posição devem ter até 20 linhas e 120 caracteres cada.');
      for(const label of labels){const key=normalize(label);if(!key)continue;const prior=mappedLabels.get(key);if(prior&&prior!==String(type.id))warnings.push('O rótulo “'+label+'” está associado a mais de um tipo do Flow.');else mappedLabels.set(key,String(type.id))}
    }
    for(const basket of basketTypes()){
      if(basket.flow_enabled&&(!basket.linked_template_id||basket.template_active!==true))warnings.push(basket.name+': vincule um modelo comercial ativo antes de habilitar no Flow.');
      if(basket.flow_enabled&&(!Number.isInteger(Number(basket.public_composition_count))||Number(basket.public_composition_count)<1||Number(basket.public_composition_count)>6))warnings.push(basket.name+': o Flow aceita de uma a seis combinações por tamanho.');
    }
    for(const type of productTypes()){
      const activeOptions=(type.options||[]).filter(p=>p.is_active===true);
      if(type.flow_enabled&&!activeOptions.length)warnings.push(type.name+': não há produto ativo configurado.');
      if(type.flow_enabled&&activeOptions.some(p=>!p.image_url))warnings.push(type.name+': há produto ativo sem foto.');
      if(number(type.max_quantity,10)<1||number(type.max_quantity,10)>10)warnings.push(type.name+': quantidade máxima deve ficar entre 1 e 10.');
    }
    return [...new Set(warnings)];
  }
  function invalidatePreviewQuote(){
    if(state.quoteTimer)clearTimeout(state.quoteTimer);
    state.quoteTimer=null;
    state.quoteRequestId++;
  }
  function markSettingsDirty(){
    state.settingsDirty=true;
    state.preview=null;
    state.previewError='';
    state.previewLoading=false;state.previewRequestId++;
    invalidatePreviewQuote();
    const saveButtons=state.root?.querySelectorAll('[data-flow-save]')||[];
    saveButtons.forEach(button=>{if(!state.busy)button.textContent='Salvar alterações'});
    const previewButton=state.root?.querySelector('[data-flow-preview-start]');
    if(previewButton)previewButton.disabled=true;
    const previewHost=state.root?.querySelector('[data-flow-preview]');
    if(previewHost)previewHost.innerHTML='<div class="da-flow-empty">Salve as alterações para abrir uma prévia com a configuração atual.</div>';
  }
  function render(){
    const root=state.root,c=state.config;if(!root||!c)return;style();
    const sizes=basketTypes(),types=productTypes(),selected=selectedBasket();
    const activeSteps=types.filter(x=>x.flow_enabled).length,warnings=checkConfiguration();
    const sizeHtml=sizes.map(b=>{
      const selectedState=String(b.id)===String(state.selectedBasketId);
      const valid=Boolean(b.linked_template_id)&&b.template_active===true;
      return '<div class="da-flow-size '+(selectedState?'selected':'')+'"><input type="checkbox" data-flow-basket-enabled="'+esc(b.id)+'" '+(b.flow_enabled?'checked':'')+' aria-label="Habilitar '+esc(b.name)+' no Flow" '+(!valid?'disabled':'')+'><div class="da-flow-size-main" data-flow-basket="'+esc(b.id)+'" role="button" tabindex="0"><strong>'+esc(b.name)+'</strong><small>'+(valid?'Modelo comercial ativo · '+Number(b.public_composition_count||0)+' combinação(ões)':(b.linked_template_id?'Modelo inativo no site':'Sem modelo comercial vinculado'))+'</small><small class="da-flow-price" data-flow-size-price="'+esc(b.id)+'">'+esc(startingPriceLabel(b))+'</small></div><input class="da-flow-order" type="number" min="0" max="1000" data-flow-basket-order="'+esc(b.id)+'" value="'+esc(b.flow_sort_order)+'" aria-label="Ordem do tamanho '+esc(b.name)+'"></div>';
    }).join('');
    const typeHtml=types.map((t,index)=>{
      const options=t.options||[],open=String(t.id)===String(state.openTypeId);
      const optionHtml=options.length?options.map(p=>'<article class="da-flow-option"><img src="'+esc(p.image_url||'/img/sem-foto.svg')+'" alt=""><strong>'+esc(p.name||'Produto')+'</strong><small>'+esc([p.brand,p.packaging,p.sku].filter(Boolean).join(' · ')||'Sem marca informada')+'</small><small class="da-flow-price">'+money(p.price_cents)+'</small><small>'+(p.is_active?'Ativo no catálogo':'Inativo no catálogo')+'</small></article>').join(''):'<div class="da-flow-empty">Nenhum produto vinculado a este tipo.</div>';
      return '<article class="da-flow-step"><div class="da-flow-step-head"><input type="checkbox" data-flow-type-enabled="'+esc(t.id)+'" '+(t.flow_enabled?'checked':'')+' aria-label="Incluir '+esc(t.name)+' no Flow"><div class="da-flow-step-name"><strong>'+esc(t.name)+'</strong><small>'+esc(t.category)+' · '+options.length+' opção(ões)</small></div><input class="da-flow-order" type="number" min="0" max="1000" data-flow-type-order="'+esc(t.id)+'" value="'+esc(t.flow_sort_order)+'" aria-label="Ordem da etapa '+esc(t.name)+'"><select data-flow-mode="'+esc(t.id)+'" aria-label="Tipo de seleção em '+esc(t.name)+'"><option value="multiple" '+(t.selection_mode==='multiple'?'selected':'')+'>Várias opções por posição</option><option value="single" '+(t.selection_mode==='single'?'selected':'')+'>Uma opção por posição</option></select><input class="da-flow-max" type="number" min="1" max="10" data-flow-max="'+esc(t.id)+'" value="'+esc(t.max_quantity)+'" aria-label="Quantidade máxima por opção em '+esc(t.name)+'"><button type="button" data-flow-expand="'+esc(t.id)+'">'+(open?'Fechar':'Fotos')+'</button></div>'+(open?(Array.isArray(t.position_labels)?'<div class="da-flow-position-labels"><label>Rótulos das posições do molde que pertencem a este tipo (copie o texto da prévia, um por linha; até 20 rótulos)<textarea maxlength="2419" data-flow-position-labels="'+esc(t.id)+'" aria-label="Rótulos de posição de '+esc(t.name)+'">'+esc((t.position_labels||[]).join('\n'))+'</textarea></label><small class="da-flow-muted">Esse mapeamento afeta apenas a configuração do Flow; não altera o molde público.</small></div>':'<div class="da-flow-status warn">O mapeamento aparecerá após a migração de configuração do Flow.</div>')+'<div class="da-flow-options">'+optionHtml+'</div>':'')+'</article>';
    }).join('');
    root.innerHTML='<section class="da-flow-admin"><div class="da-flow-head"><h2>Atendimento por Flow</h2><span style="flex:1"></span><button type="button" data-flow-save class="primary" '+(state.busy?'disabled':'')+'>'+(state.busy?'Salvando…':state.settingsDirty?'Salvar alterações':'Salvar configuração')+'</button></div><div class="da-flow-note"><strong>Configuração do atendimento</strong> · A ordem, as opções, os limites e os rótulos ficam separados da vitrine pública. Preços, fotos e estoque vêm do catálogo atual; esta tela não edita preço, estoque nem pedidos. Salve as alterações antes de abrir a prévia. A atualização do runtime e a homologação do Flow V2 ainda são necessárias para refletir esta configuração no atendimento.</div><div class="da-flow-status warn"><strong>Experiência configurada para o Flow V2:</strong> tamanho, uma etapa por tipo de produto, alternativas com foto e preço individual, quantidade por opção e total recalculado pela cotação atual. A conclusão registra uma solicitação para conferência humana; não cria pedido nem reserva estoque.</div><div class="da-flow-layout"><aside class="da-flow-panel"><h3>Tamanhos da cesta</h3><div class="da-flow-size-list">'+(sizeHtml||'<div class="da-flow-empty">Nenhum tamanho cadastrado.</div>')+'</div><div class="da-flow-subhead" style="margin-top:16px"><strong>Prévia de atendimento</strong></div><p class="da-flow-muted">Os tamanhos mostram o menor preço entre as combinações disponíveis, calculado no catálogo atual.</p><button type="button" data-flow-prices-refresh '+(state.priceLoading?'disabled':'')+'>'+(state.priceLoading?'Atualizando valores…':'Atualizar preços dos tamanhos')+'</button><button type="button" data-flow-preview-start '+(!selected||!selected.flow_enabled||state.previewLoading||state.settingsDirty?'disabled':'')+'>Calcular e abrir prévia</button></aside><main class="da-flow-panel"><div class="da-flow-subhead"><h3 style="margin:0">Etapas de produtos</h3><span class="da-flow-muted">'+activeSteps+' tipo(s) habilitado(s) · ordene as etapas ao lado do nome</span></div><div class="da-flow-step-list">'+(typeHtml||'<div class="da-flow-empty">Nenhum tipo de produto configurado.</div>')+'</div><div class="da-flow-save" style="margin-top:12px"><button type="button" class="primary" data-flow-save '+(state.busy?'disabled':'')+'>Salvar configuração</button></div></main></div><div class="da-flow-panel"><h3>Simulador do atendimento</h3><div data-flow-preview></div></div>'+(warnings.length?'<div class="da-flow-status warn"><strong>Revisar antes de usar:</strong><br>'+warnings.map(esc).join('<br>')+'</div>':'<div class="da-flow-status">Configuração sem impedimentos básicos. Confirme fotos, preços, estoque e limites no simulador antes de homologar o Flow.</div>')+'</section>';
    root.onclick=event=>{
      const t=event.target.closest('[data-flow-basket],[data-flow-expand],[data-flow-save],[data-flow-preview-start],[data-flow-prices-refresh],[data-flow-step-prev],[data-flow-step-next]');
      if(!t)return;
      if(t.dataset.flowBasket){state.selectedBasketId=t.dataset.flowBasket;state.preview=null;state.previewError='';state.previewLoading=false;state.previewRequestId++;invalidatePreviewQuote();render()}
      else if(t.dataset.flowExpand){state.openTypeId=String(state.openTypeId)===String(t.dataset.flowExpand)?'':t.dataset.flowExpand;render()}
      else if(t.hasAttribute('data-flow-save'))void save()
      else if(t.hasAttribute('data-flow-prices-refresh'))void loadStartingPrices()
      else if(t.hasAttribute('data-flow-preview-start'))void loadPreview()
      else if(t.hasAttribute('data-flow-step-prev')){if(state.preview)state.preview.index=Math.max(0,state.preview.index-1);renderPreview()}
      else if(t.hasAttribute('data-flow-step-next')){if(state.preview)state.preview.index=Math.min(state.preview.steps.length-1,state.preview.index+1);renderPreview()}
    };
    root.onkeydown=event=>{if(!event.target.matches('[data-flow-basket]')||!['Enter',' '].includes(event.key))return;event.preventDefault();state.selectedBasketId=event.target.dataset.flowBasket;state.preview=null;state.previewError='';state.previewLoading=false;state.previewRequestId++;invalidatePreviewQuote();render()};
    root.onchange=event=>{
      const t=event.target;
      if(t.dataset.flowBasketEnabled){const row=sizes.find(x=>String(x.id)===String(t.dataset.flowBasketEnabled));if(row)row.flow_enabled=t.checked;markSettingsDirty()}
      else if(t.dataset.flowBasketOrder){const row=sizes.find(x=>String(x.id)===String(t.dataset.flowBasketOrder));if(row)row.flow_sort_order=Math.max(0,Math.min(1000,Math.trunc(number(t.value))));markSettingsDirty()}
      else if(t.dataset.flowTypeOrder){const row=types.find(x=>String(x.id)===String(t.dataset.flowTypeOrder));if(row)row.flow_sort_order=Math.max(0,Math.min(1000,Math.trunc(number(t.value))));markSettingsDirty()}
      else if(t.dataset.flowTypeEnabled){const row=types.find(x=>String(x.id)===String(t.dataset.flowTypeEnabled));if(row)row.flow_enabled=t.checked;markSettingsDirty()}
      else if(t.dataset.flowMode){const row=types.find(x=>String(x.id)===String(t.dataset.flowMode));if(row)row.selection_mode=t.value;markSettingsDirty()}
      else if(t.dataset.flowMax){const row=types.find(x=>String(x.id)===String(t.dataset.flowMax));if(row)row.max_quantity=Math.max(1,Math.min(10,Math.trunc(number(t.value,10))));markSettingsDirty()}
      else if(t.dataset.flowPositionLabels){const row=types.find(x=>String(x.id)===String(t.dataset.flowPositionLabels));if(row)row.position_labels=String(t.value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);markSettingsDirty()}
      else if(t.dataset.previewQty){updatePreviewQuantity(t)}
      if(t.matches('[data-flow-basket-enabled],[data-flow-type-enabled],[data-flow-mode],[data-preview-qty]')){if(t.dataset.previewQty)renderPreview();else render()}
    };
    root.oninput=event=>{
      const t=event.target;
      if(t.dataset.previewQty){
        updatePreviewQuantity(t);
        root.querySelectorAll('[data-preview-qty]').forEach(input=>{if(input!==t)input.value=String(number(state.preview?.quantities[input.dataset.previewQty]))});
        refreshPreviewQuoteUi();
      }else if(t.dataset.flowBasketOrder){const row=sizes.find(x=>String(x.id)===String(t.dataset.flowBasketOrder));if(row)row.flow_sort_order=Math.max(0,Math.min(1000,Math.trunc(number(t.value))));markSettingsDirty()}
      else if(t.dataset.flowTypeOrder){const row=types.find(x=>String(x.id)===String(t.dataset.flowTypeOrder));if(row)row.flow_sort_order=Math.max(0,Math.min(1000,Math.trunc(number(t.value))));markSettingsDirty()}
      else if(t.dataset.flowMax){const row=types.find(x=>String(x.id)===String(t.dataset.flowMax));if(row)row.max_quantity=Math.max(1,Math.min(10,Math.trunc(number(t.value,10))));markSettingsDirty()}
    };
    renderPreview();
  }
  async function save(){
    if(state.busy)return;
    const warnings=checkConfiguration();
    if(warnings.some(x=>x.includes('vincule um modelo comercial ativo')))return api().toast(warnings[0]);
    try{
      state.busy=true;render();
      const configuration={
        basket_types:basketTypes().map(b=>({id:b.id,flow_enabled:b.flow_enabled===true,flow_sort_order:Math.max(0,Math.min(1000,Math.trunc(number(b.flow_sort_order))))})),
        product_types:productTypes().map(t=>({id:t.id,flow_enabled:t.flow_enabled===true,flow_sort_order:Math.max(0,Math.min(1000,Math.trunc(number(t.flow_sort_order)))),selection_mode:t.selection_mode==='single'?'single':'multiple',max_quantity:Math.max(1,Math.min(10,Math.trunc(number(t.max_quantity,10)))),position_labels:Array.isArray(t.position_labels)?t.position_labels:[]}))
      };
      state.config=await api().saveFlowSettings(configuration);
      state.settingsDirty=false;state.preview=null;state.previewError='';state.previewLoading=false;state.previewRequestId++;invalidatePreviewQuote();
      api().toast('Configuração do Flow salva sem alterar a vitrine pública.');
    }catch(error){api().toast(error.message||'Não foi possível salvar a configuração do Flow.')}
    finally{state.busy=false;render()}
  }
  function normalize(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
  function findType(label){
    const key=normalize(label),types=productTypes();
    const explicit=types.find(t=>(t.position_labels||[]).some(x=>normalize(x)===key));
    if(explicit)return explicit;
    return types.find(t=>[t.name,...(t.legacy_labels||[])].some(x=>normalize(x)===key||key.startsWith(normalize(x))))||null;
  }
  async function loadStartingPrices(){
    if(state.priceLoading)return;
    const baskets=basketTypes().filter(b=>b.linked_template_id&&b.template_active===true);
    if(!baskets.length)return;
    state.priceLoading=true;
    const requestId=++state.priceRequestId;
    render();
    try{
      for(const basket of baskets){
        if(requestId!==state.priceRequestId)return;
        const key=String(basket.id);
        try{
          const count=Math.max(1,Math.min(6,Number(basket.public_composition_count||3)));
          const quotes=await api().loadBasketCompositions(basket.linked_template_id,count);
          const available=quotes.filter(q=>Number.isSafeInteger(Number(q.basket?.display_price_cents))&&Number(q.basket?.stock_quantity)>0);
          available.sort((a,b)=>Number(a.basket.display_price_cents)-Number(b.basket.display_price_cents)||a.composition_number-b.composition_number);
          state.startingPrices[key]=available.length?{cents:Number(available[0].basket.display_price_cents),compositionNumber:available[0].composition_number}:{error:'Nenhuma combinação disponível'};
        }catch(error){state.startingPrices[key]={error:'Não foi possível consultar o preço'};}
        state.root?.querySelectorAll('[data-flow-size-price]').forEach(el=>{if(String(el.dataset.flowSizePrice)===key)el.textContent=startingPriceLabel(basket)});
      }
    }finally{
      if(requestId===state.priceRequestId){state.priceLoading=false;render()}
    }
  }
  async function loadPreview(){
    const basket=selectedBasket();if(!basket?.linked_template_id||basket.template_active!==true||state.settingsDirty)return;
    invalidatePreviewQuote();
    const requestId=++state.previewRequestId;
    state.previewLoading=true;state.previewError='';state.preview=null;render();
    try{
      const count=Math.max(1,Math.min(6,Number(basket.public_composition_count||3)));
      const quotes=await api().loadBasketCompositions(basket.linked_template_id,count);
      if(requestId!==state.previewRequestId)return;
      const available=quotes.filter(q=>Number.isSafeInteger(Number(q.basket?.display_price_cents))&&Number(q.basket?.stock_quantity)>0);
      if(!available.length)throw new Error('Nenhuma combinação está disponível para esta cesta.');
      available.sort((a,b)=>Number(a.basket.display_price_cents)-Number(b.basket.display_price_cents)||a.composition_number-b.composition_number);
      const cheapest=available[0];
      state.startingPrices[String(basket.id)]={cents:Number(cheapest.basket.display_price_cents),compositionNumber:cheapest.composition_number};
      const runtime=await api().loadFlowRuntimeConfiguration(basket.linked_template_id,cheapest.composition_number);
      if(requestId!==state.previewRequestId)return;
      const runtimeTypes=Array.isArray(runtime.product_types)?runtime.product_types:[];
      const typesById=new Map(runtimeTypes.map(type=>[String(type.id),type]));
      const positionRows=(runtime.positions||[]).map(position=>{
        const type=typesById.get(String(position.type_id))||null;
        const item={position_id:position.position_id,label:position.label,quantity:position.base_quantity,product_id:position.base?.product_id,name:position.base?.name,brand:position.base?.brand,packaging:position.base?.packaging,image_url:position.base?.image_url,price_cents:position.base?.price_cents,stock_quantity:position.base?.stock_quantity};
        const alternatives=(position.options||[]).filter(option=>Number(option.stock_quantity)>0);
        return {item,type,alternatives,alternative_count:alternatives.length,reason:position.reason||(!type?'Sem tipo de produto correspondente no Admin':''),editable:position.editable===true&&Boolean(type)};
      });
      const grouped=new Map();
      for(const row of positionRows){
        if(!row.editable)continue;
        const key=String(row.type.id),group=grouped.get(key)||{type:row.type,positions:[]};
        group.positions.push(row);grouped.set(key,group);
      }
      const steps=[...grouped.values()].sort((a,b)=>Number(a.type.flow_sort_order||0)-Number(b.type.flow_sort_order||0)||String(a.type.name).localeCompare(String(b.type.name),'pt-BR'));
      const quantities={};
      for(const step of steps){
        for(const row of step.positions){
          const baseProduct=String(row.item.product_id||'');
          for(const option of row.alternatives){
            const key=String(row.item.position_id)+'|'+String(option.product_id);
            const cap=Math.min(number(step.type.max_quantity,10),number(option.stock_quantity,0));
            quantities[key]=String(option.product_id)===baseProduct?Math.min(cap,Math.max(0,number(row.item.quantity))):0;
          }
        }
      }
      state.preview={basketId:basket.linked_template_id,compositionNumber:cheapest.composition_number,basket:runtime.basket||cheapest.basket,items:runtime.positions||[],steps,quantities,index:0,fixedItems:positionRows.filter(row=>!row.editable),quote:null,quoteLoading:true,quoteError:''};
      const preview=state.preview;
      const quote=await api().quoteFlow(basket.linked_template_id,cheapest.composition_number,previewSelections(preview));
      if(requestId!==state.previewRequestId||state.preview!==preview)return;
      preview.quote=quote;preview.quoteLoading=false;
    }catch(error){
      if(requestId!==state.previewRequestId)return;
      if(state.preview){state.preview.quoteLoading=false;state.preview.quoteError=error.message||'Não consegui calcular a cotação do Flow.'}
      else state.previewError=error.message||'Não consegui carregar a prévia do Flow.';
    }
    finally{if(requestId===state.previewRequestId){state.previewLoading=false;render()}}
  }
  function previewSelections(preview){
    return preview.steps.flatMap(step=>step.positions.map(row=>({
      position_id:String(row.item.position_id),
      selections:row.alternatives.map(option=>({product_id:String(option.product_id),quantity:Math.max(0,Math.trunc(number(preview.quantities[String(row.item.position_id)+'|'+String(option.product_id)]))) }))
    })));
  }
  function queuePreviewQuote(){
    const preview=state.preview;if(!preview)return;
    if(state.quoteTimer)clearTimeout(state.quoteTimer);
    const requestId=++state.quoteRequestId;
    preview.quoteLoading=true;preview.quoteError='';refreshPreviewQuoteUi();
    state.quoteTimer=setTimeout(async()=>{
      state.quoteTimer=null;
      try{
        const quote=await api().quoteFlow(preview.basketId,preview.compositionNumber,previewSelections(preview));
        if(requestId!==state.quoteRequestId||state.preview!==preview)return;
        preview.quote=quote;preview.quoteError='';
      }catch(error){
        if(requestId!==state.quoteRequestId||state.preview!==preview)return;
        preview.quoteError=error.message||'Não foi possível calcular a cotação atual.';
      }finally{
        if(requestId===state.quoteRequestId&&state.preview===preview){preview.quoteLoading=false;refreshPreviewQuoteUi()}
      }
    },220);
  }
  function updatePreviewQuantity(input){
    const preview=state.preview;if(!preview)return;
    const key=String(input.dataset.previewQty||''),parts=key.split('|'),positionId=parts[0],id=parts[1];
    const step=preview.steps[preview.index],row=step?.positions.find(x=>String(x.item.position_id)===positionId);
    if(!row||!id)return;
    const option=row.alternatives.find(x=>String(x.product_id)===id);
    const max=Math.min(number(step.type?.max_quantity,10),number(option?.stock_quantity,0));
    const qty=Math.max(0,Math.min(max,Math.trunc(number(input.value))));
    input.value=String(qty);
    if(step.type?.selection_mode==='single'&&qty>0){
      for(const alternative of row.alternatives)preview.quantities[positionId+'|'+String(alternative.product_id)]=String(alternative.product_id)===id?qty:0;
    }else preview.quantities[key]=qty;
    queuePreviewQuote();
  }
  function previewTotal(){return Math.max(0,Math.round(number(state.preview?.quote?.total_cents,state.preview?.basket?.display_price_cents||0)))}
  function refreshPreviewQuoteUi(){
    const preview=state.preview,root=state.root;if(!preview||!root)return;
    const label=root.querySelector('[data-flow-total-label]');if(label)label.textContent=preview.quoteLoading?'Atualizando cotação…':'Total da cotação';
    const total=root.querySelector('[data-flow-total-value]');if(total)total.textContent=money(previewTotal());
    const error=root.querySelector('[data-flow-quote-error]');
    if(error){error.textContent=preview.quoteError||'';error.hidden=!preview.quoteError}
  }
  function renderPreview(){
    const host=state.root?.querySelector('[data-flow-preview]');if(!host)return;
    const preview=state.preview,basket=selectedBasket();
    if(state.previewLoading){host.innerHTML='<div class="da-flow-empty">Consultando preços, estoque e opções atuais…</div>';return}
    if(state.previewError){host.innerHTML='<div class="da-flow-error">'+esc(state.previewError)+'</div>';return}
    if(!preview){host.innerHTML='<div class="da-flow-empty">'+(state.settingsDirty?'Salve as alterações para abrir uma prévia com a configuração atual.':basket?'A prévia escolhe a combinação disponível mais barata e agrupa as etapas por tipo de produto.':'Escolha um tamanho na coluna ao lado.')+'</div>';return}
    const fixedItemsHtml=(preview.fixedItems||[]).length?'<div class="da-flow-preview-step"><strong>Posições que ficam fixas</strong><div class="da-flow-preview-products">'+preview.fixedItems.map(row=>{const item=row.item,qty=Math.max(0,number(item.quantity)),unit=number(item.price_cents);return '<article class="da-flow-preview-product"><img src="'+esc(item.image_url||'/img/sem-foto.svg')+'" alt=""><div><strong>'+esc(item.name||item.label||'Produto')+'</strong><small>'+esc(item.label||'Posição da cesta')+'</small><small>'+qty+' × '+money(unit)+' = '+money(qty*unit)+'</small><small class="da-flow-muted">'+esc(row.reason)+'</small></div></article>'}).join('')+'</div></div>':'';
    if(!preview.steps.length){host.innerHTML='<div class="da-flow-preview">'+fixedItemsHtml+'<div class="da-flow-empty">Nenhum tipo de produto está habilitado para escolha.</div><div class="da-flow-total"><span data-flow-total-label>'+(preview.quoteLoading?'Atualizando cotação…':'Total da cotação')+'</span><span data-flow-total-value>'+money(previewTotal())+'</span></div>'+(preview.quoteError?'<div class="da-flow-status warn" data-flow-quote-error>'+esc(preview.quoteError)+'</div>':'<div class="da-flow-status warn" data-flow-quote-error hidden></div>')+'</div>';return}
    const step=preview.steps[preview.index],type=step?.type;
    if(!step){host.innerHTML='<div class="da-flow-empty">Esta combinação não possui etapas de produto.</div>';return}
    const maxStep=preview.steps.length;
    const warnings=[];
    if((preview.fixedItems||[]).length)warnings.push((preview.fixedItems||[]).length+' posição(ões) ficam fixas porque não têm um tipo Flow habilitado e mapeado.');
    const positionSections=step.positions.map(row=>{
      const cards=row.alternatives.map(option=>{
        const key=String(row.item.position_id)+'|'+String(option.product_id),qty=number(preview.quantities[key]);
        const max=Math.max(0,Math.min(number(type?.max_quantity,10),number(option.stock_quantity)));
        return '<article class="da-flow-preview-product"><img src="'+esc(option.image_url||'/img/sem-foto.svg')+'" alt=""><div><strong>'+esc(option.name)+'</strong><small>'+esc([option.brand,option.packaging].filter(Boolean).join(' · '))+'</small><small class="da-flow-price">'+money(option.price_cents)+' cada</small><small>Disponível: '+esc(option.stock_quantity)+'</small></div><label style="grid-column:1/-1;font-size:11px;font-weight:800;color:#536159">Quantidade<input type="number" min="0" max="'+max+'" step="1" data-preview-qty="'+esc(key)+'" value="'+esc(qty)+'" aria-label="Quantidade de '+esc(option.name)+'"></label></article>';
      }).join('');
      return '<div style="border:1px solid #e1e7e3;border-radius:10px;padding:9px;margin-top:9px"><strong>'+esc(row.item.label||type?.name||'Produto')+'</strong><div class="da-flow-muted">Quantidade-base: '+esc(row.item.quantity)+'</div><div class="da-flow-preview-products">'+(cards||'<div class="da-flow-empty">Nenhuma opção disponível em estoque.</div>')+'</div></div>';
    }).join('');
    const currentCombo=money(preview.basket.display_price_cents);
    host.innerHTML='<div class="da-flow-preview"><div class="da-flow-preview-top"><div><strong>'+esc(type?.name||'Escolha os produtos')+'</strong><div class="da-flow-muted">Etapa '+(preview.index+1)+' de '+maxStep+' · combinação mais barata nº '+preview.compositionNumber+' ('+currentCombo+')</div></div><div><button type="button" data-flow-step-prev '+(preview.index===0?'disabled':'')+'>Anterior</button> <button type="button" data-flow-step-next '+(preview.index>=maxStep-1?'disabled':'')+'>Próxima etapa</button></div></div><div class="da-flow-preview-step"><div class="da-flow-preview-step-head"><strong>'+esc(type?.name||'Tipo de produto')+'</strong><span class="da-flow-muted">'+(type?.selection_mode==='multiple'?'Pode escolher várias opções; cada uma tem quantidade própria':'Escolha uma opção por item')+'</span></div>'+positionSections+'</div>'+fixedItemsHtml+(warnings.length?'<div class="da-flow-status warn">'+warnings.map(esc).join('<br>')+'</div>':'')+'<div class="da-flow-total"><span data-flow-total-label>'+(preview.quoteLoading?'Atualizando cotação…':'Total da cotação')+'</span><span data-flow-total-value>'+money(previewTotal())+'</span></div>'+(preview.quoteError?'<div class="da-flow-status warn" data-flow-quote-error>'+esc(preview.quoteError)+'</div>':'<div class="da-flow-status warn" data-flow-quote-error hidden></div>')+'<div class="da-flow-muted">A composição e as opções vêm do mesmo endpoint usado pelo Flow. A cotação consulta preços e estoque atuais, sem criar pedido ou reservar estoque.</div></div>';
  }
  async function open(root){
    state.root=root;root.innerHTML='<div class="da-flow-empty">Carregando configuração do Flow…</div>';
    try{
      state.config=await api().flowList();
      if(!state.config||!Array.isArray(state.config.basket_types)||!Array.isArray(state.config.product_types))throw new Error('flow_configuration_unavailable');
      const first=basketTypes().find(x=>x.linked_template_id);
      if(!state.selectedBasketId&&first)state.selectedBasketId=first.id;
      render();
      void loadStartingPrices();
    }catch(error){root.innerHTML='<div class="da-flow-error">Não consegui carregar a configuração do Flow. <button type="button" data-flow-retry>Tentar novamente</button></div>';root.querySelector('[data-flow-retry]')?.addEventListener('click',()=>open(root))}
  }
  window.DonaAntoniaBasketAdminFlow={open};
})();