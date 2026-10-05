(()=>{
  'use strict';

  const API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-store-baskets-v1';
  const KIT_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-kit-builder-v1';
  const TYPE_LABELS={food:'Alimentos',cleaning_hygiene:'Limpeza e higiene',other:'Outro'};
  const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
  const qty=v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(Number(v||0));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let state={root:null,baskets:[],kitCatalog:[],draft:null,quantity:1,preview:null,loading:false};

  function bridge(){return window.DonaAntoniaAdminBridge||{}}
  function toast(message){const b=bridge();if(typeof b.toast==='function')b.toast(message);else alert(message)}
  function operator(){const b=bridge();return typeof b.operator==='function'?(b.operator()||'Operação'):'Operação'}
  async function token(){const b=bridge();if(typeof b.token!=='function')throw new Error('admin_bridge_unavailable');return await b.token()}
  async function storeCall(action,payload={}){
    const t=await token();
    const res=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},body:JSON.stringify({action,...payload}),cache:'no-store'});
    const data=await res.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!res.ok||data?.ok===false){const e=new Error(data?.message||data?.error||'store_baskets_request_failed');e.data=data;e.status=res.status;throw e}
    return data;
  }
  async function kitCall(action,payload={}){
    const t=await token();
    const q=new URLSearchParams({action});
    Object.entries(payload||{}).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')q.set(k,String(v))});
    const res=await fetch(KIT_API+'?'+q.toString(),{method:'GET',headers:{Authorization:'Bearer '+t},cache:'no-store'});
    const data=await res.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!res.ok||data?.ok===false){const e=new Error(data?.message||data?.error||'kit_catalog_request_failed');e.data=data;e.status=res.status;throw e}
    return data;
  }

  function ensureStyle(){
    if(document.getElementById('storeBasketsBuilderStyles'))return;
    const style=document.createElement('style');style.id='storeBasketsBuilderStyles';style.textContent=`
      .sb-wrap{display:grid;gap:12px;color:#18221c}.sb-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.sb-top h2{margin:0;font-size:22px}.sb-top p{margin:2px 0 0;color:#68736c;font-size:12px}.sb-top .grow{flex:1}.sb-btn{border:1px solid #dce3de;background:#fff;border-radius:10px;min-height:40px;padding:0 12px;font-weight:800;cursor:pointer}.sb-btn.primary{background:#176b43;border-color:#176b43;color:#fff}.sb-btn.danger{color:#9d2235}.sb-grid{display:grid;grid-template-columns:minmax(250px,330px) minmax(0,1fr);gap:12px;align-items:start}.sb-panel{background:#fff;border:1px solid #e2e7e3;border-radius:14px;padding:12px}.sb-list{display:grid;gap:8px;max-height:72vh;overflow:auto;padding-right:2px}.sb-card{width:100%;text-align:left;border:1px solid #e2e7e3;border-radius:11px;background:#fff;padding:10px;cursor:pointer}.sb-card.active{border:2px solid #176b43;padding:9px;background:#f7fbf8}.sb-card strong{display:block;font-size:13px}.sb-card small{display:block;color:#68736c;margin-top:3px;line-height:1.4}.sb-chip{display:inline-block;margin:5px 4px 0 0;border-radius:999px;padding:4px 7px;background:#edf5f0;color:#135938;font-size:9px;font-weight:800}.sb-empty{border:1px dashed #cbd4ce;border-radius:11px;padding:22px;text-align:center;color:#68736c}.sb-fields{display:grid;grid-template-columns:1.4fr .6fr;gap:9px}.sb-fields label span,.sb-kit-row label span,.sb-assemble label span{display:block;font-size:10px;font-weight:800;color:#68736c;margin-bottom:3px}.sb-fields input,.sb-kit-row input,.sb-kit-add select,.sb-assemble input{width:100%;min-height:42px;border:1px solid #dce3de;border-radius:9px;padding:8px 10px;background:#fff}.sb-fields .wide{grid-column:1/-1}.sb-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:12px 0}.sb-stat{background:#f5f7f5;border-radius:9px;padding:9px}.sb-stat small{display:block;color:#68736c;font-size:9px}.sb-stat strong{display:block;margin-top:2px;font-size:14px}.sb-kits{display:grid;gap:8px}.sb-kit-row{display:grid;grid-template-columns:minmax(180px,1fr) 100px auto;gap:8px;align-items:end;border:1px solid #e5e9e6;border-radius:10px;padding:9px}.sb-kit-row h4{margin:0;font-size:13px}.sb-kit-row small{display:block;color:#68736c;margin-top:3px}.sb-kit-add{display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:8px;align-items:end;margin-top:9px}.sb-section-title{margin:15px 0 7px;font-size:15px}.sb-note{font-size:11px;color:#68736c;margin:5px 0 10px}.sb-assemble{display:grid;grid-template-columns:150px auto 1fr;gap:8px;align-items:end;margin-top:12px}.sb-preview{overflow:auto;margin-top:10px}.sb-preview table{width:100%;border-collapse:collapse;font-size:11px}.sb-preview th,.sb-preview td{padding:7px;border-bottom:1px solid #e7ebe8;text-align:right;white-space:nowrap}.sb-preview th:first-child,.sb-preview td:first-child{text-align:left}.sb-preview tr.bad{background:#fff2f2;color:#982739}.sb-status{display:inline-block;border-radius:999px;padding:5px 8px;background:#edf5f0;color:#135938;font-size:10px;font-weight:900;margin-top:8px}.sb-status.bad{background:#fff0f2;color:#96243a}.sb-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.sb-loading{padding:30px;text-align:center;color:#68736c}
      @media(max-width:880px){.sb-grid{grid-template-columns:1fr}.sb-list{max-height:260px}.sb-fields,.sb-kit-row,.sb-kit-add,.sb-assemble{grid-template-columns:1fr}.sb-summary{grid-template-columns:1fr 1fr}.sb-fields .wide{grid-column:auto}}
    `;document.head.appendChild(style);
  }

  function linkedSummary(){
    const kits=state.draft?.kits||[];let cost=0,sale=0;
    for(const k of kits){const n=Number(k.quantity||1);cost+=Number(k.unit_cost_total??k.cost_total??0)*n;sale+=Number(k.unit_sale_total??k.sale_total??0)*n}
    const final=Number(state.draft?.basket?.sale_price||0);
    return {cost,sale,hidden:final-sale};
  }
  function catalogKit(id){return state.kitCatalog.find(k=>String(k.id)===String(id))||null}
  function availableToAdd(){const used=new Set((state.draft?.kits||[]).map(k=>String(k.kit_id)));return state.kitCatalog.filter(k=>!used.has(String(k.id)))}

  function listHtml(){
    if(!state.baskets.length)return '<div class="sb-empty">Nenhuma Cesta do Site configurada.</div>';
    return state.baskets.map(b=>'<button type="button" class="sb-card '+(String(state.draft?.basket?.id||'')===String(b.id)?'active':'')+'" data-store-basket-card="'+esc(b.id)+'"><strong>'+esc(b.name)+'</strong><small>'+money(b.sale_price)+' · '+Number(b.kit_count||b.kits?.length||0)+' kit(s)</small><small>Custo '+money(b.cost_total)+' · produtos '+money(b.product_sale_total)+'</small>'+(b.kits||[]).map(k=>'<span class="sb-chip">'+esc(TYPE_LABELS[k.type]||k.type||'Kit')+': '+esc(k.name||'')+'</span>').join('')+'</button>').join('');
  }
  function kitRowsHtml(){
    const kits=state.draft?.kits||[];
    if(!kits.length)return '<div class="sb-empty">Adicione pelo menos um kit interno.</div>';
    return kits.map((k,i)=>'<div class="sb-kit-row" data-store-linked-kit="'+esc(k.kit_id)+'"><div><h4>'+esc(k.name||'Kit interno')+'</h4><small>'+esc(TYPE_LABELS[k.type]||'Outro')+' · '+Number(k.item_count||0)+' produtos · custo unit. '+money(k.unit_cost_total??k.cost_total??0)+' · venda unit. '+money(k.unit_sale_total??k.sale_total??0)+'</small></div><label><span>Quantidade</span><input type="number" min="0.001" max="100" step="0.001" data-store-kit-qty data-store-index="'+i+'" value="'+esc(k.quantity||1)+'"></label><button type="button" class="sb-btn danger" data-store-kit-remove="'+i+'">Remover</button></div>').join('');
  }
  function previewHtml(){
    const p=state.preview;if(!p)return '';
    const rows=(p.requirements||[]).map(r=>'<tr class="'+(r.ok===false?'bad':'')+'" data-store-preview-row><td>'+esc(r.name||r.product_id)+'</td><td>'+qty(r.quantity_per_basket)+'</td><td>'+qty(r.required)+'</td><td>'+qty(r.available)+'</td><td>'+qty(r.balance_after)+'</td></tr>').join('');
    return '<div class="sb-preview" data-store-preview-table><table><thead><tr><th>Produto</th><th>Por cesta</th><th>Necessário</th><th>Avulso</th><th>Saldo</th></tr></thead><tbody>'+rows+'</tbody></table><span class="sb-status '+(p.ok?'':'bad')+'">'+(p.ok?'Estoque suficiente para esta quantidade':'Estoque insuficiente')+'</span></div>';
  }
  function editorHtml(){
    if(!state.draft)return '<div class="sb-empty">Escolha uma cesta ou clique em <strong>Nova cesta</strong>.</div>';
    const b=state.draft.basket||{},s=linkedSummary(),available=availableToAdd();
    return '<div data-store-basket-editor><div class="sb-fields"><label><span>Nome da cesta</span><input data-store-name maxlength="180" value="'+esc(b.name||'')+'"></label><label><span>Valor de venda</span><input data-store-sale-price type="number" min="0" step="0.01" value="'+esc(Number(b.sale_price||0).toFixed(2))+'"></label><label class="wide"><span>Imagem (opcional)</span><input data-store-image maxlength="1000" value="'+esc(b.image_url||'')+'" placeholder="URL da imagem"></label></div><div class="sb-summary"><div class="sb-stat"><small>Custo dos produtos</small><strong>'+money(s.cost)+'</strong></div><div class="sb-stat"><small>Venda dos produtos</small><strong>'+money(s.sale)+'</strong></div><div class="sb-stat"><small>Valor final</small><strong>'+money(b.sale_price)+'</strong></div><div class="sb-stat"><small>Valor oculto</small><strong>'+money(s.hidden)+'</strong></div></div><h3 class="sb-section-title">Kits internos</h3><p class="sb-note">A cesta externa é composta somente por estes kits. Salvar a receita não reserva estoque.</p><div class="sb-kits">'+kitRowsHtml()+'</div><div class="sb-kit-add"><select data-store-kit-select><option value="">Escolha um kit...</option>'+available.map(k=>'<option value="'+esc(k.id)+'">'+esc(TYPE_LABELS[k.type]||'Outro')+' · '+esc(k.name)+' · '+money(k.sale_total)+'</option>').join('')+'</select><button type="button" class="sb-btn" data-store-kit-add>+ Adicionar kit</button></div><h3 class="sb-section-title">Montagem</h3><p class="sb-note">A quantidade abaixo serve somente para calcular o que será necessário. Esta tela ainda não reserva estoque.</p><div class="sb-assemble"><label><span>Quantidade a montar</span><input data-store-quantity type="number" min="1" max="500" step="1" value="'+esc(state.quantity||1)+'"></label><button type="button" class="sb-btn" data-store-preview '+(!b.id?'disabled title="Salve a cesta antes de calcular a prévia"':'')+'>Calcular prévia</button><small>'+(b.id?'Confira necessidade e saldo por produto antes da montagem.':'Salve a nova cesta para liberar a prévia de estoque.')+'</small></div>'+previewHtml()+'<div class="sb-actions"><button type="button" class="sb-btn primary" data-store-save>Salvar receita</button></div></div>';
  }
  function render(){
    if(!state.root)return;ensureStyle();
    state.root.innerHTML='<section class="sb-wrap"><div class="sb-top"><div><h2>Cestas do Site</h2><p>Monte as cestas externas usando somente os kits internos.</p></div><span class="grow"></span><button type="button" class="sb-btn primary" data-store-new>+ Nova cesta</button></div><div class="sb-grid"><aside class="sb-panel"><strong>Cestas configuradas</strong><div class="sb-list" data-store-basket-list>'+listHtml()+'</div></aside><section class="sb-panel">'+editorHtml()+'</section></div></section>';
    bind();
  }
  function sync(){
    if(!state.draft)return;
    const name=state.root.querySelector('[data-store-name]'),price=state.root.querySelector('[data-store-sale-price]'),image=state.root.querySelector('[data-store-image]'),amount=state.root.querySelector('[data-store-quantity]');
    if(name)state.draft.basket.name=name.value.trim();
    if(price){const n=Number(String(price.value||'').replace(',','.'));if(Number.isFinite(n)&&n>=0)state.draft.basket.sale_price=n}
    if(image)state.draft.basket.image_url=image.value.trim();
    if(amount)state.quantity=Math.max(1,Math.min(500,Math.trunc(Number(amount.value||1))));
    state.root.querySelectorAll('[data-store-kit-qty]').forEach(el=>{const i=Number(el.dataset.storeIndex),k=state.draft.kits[i];if(k)k.quantity=Math.max(.001,Math.min(100,Number(el.value||1)))})
  }
  function bind(){
    state.root.querySelector('[data-store-new]')?.addEventListener('click',newBasket);
    state.root.querySelectorAll('[data-store-basket-card]').forEach(btn=>btn.addEventListener('click',()=>openBasket(btn.dataset.storeBasketCard)));
    state.root.querySelector('[data-store-name]')?.addEventListener('input',e=>{state.draft.basket.name=e.target.value});
    state.root.querySelector('[data-store-sale-price]')?.addEventListener('input',e=>{const n=Number(String(e.target.value||'').replace(',','.'));if(Number.isFinite(n)&&n>=0){state.draft.basket.sale_price=n;render()}});
    state.root.querySelector('[data-store-image]')?.addEventListener('input',e=>{state.draft.basket.image_url=e.target.value});
    state.root.querySelectorAll('[data-store-kit-qty]').forEach(input=>input.addEventListener('change',()=>{sync();state.preview=null;render()}));
    state.root.querySelectorAll('[data-store-kit-remove]').forEach(btn=>btn.addEventListener('click',()=>{sync();state.draft.kits.splice(Number(btn.dataset.storeKitRemove),1);state.preview=null;render()}));
    state.root.querySelector('[data-store-kit-add]')?.addEventListener('click',()=>{sync();const sel=state.root.querySelector('[data-store-kit-select]'),k=catalogKit(sel?.value);if(!k)return;state.draft.kits.push({kit_id:k.id,name:k.name,type:k.type,quantity:1,is_required:true,sort_order:state.draft.kits.length,item_count:Number(k.item_count||0),unit_cost_total:Number(k.cost_total||0),unit_sale_total:Number(k.sale_total||0),cost_total:Number(k.cost_total||0),sale_total:Number(k.sale_total||0)});state.preview=null;render()});
    state.root.querySelector('[data-store-quantity]')?.addEventListener('change',()=>{sync();state.preview=null;render()});
    state.root.querySelector('[data-store-preview]')?.addEventListener('click',preview);
    state.root.querySelector('[data-store-save]')?.addEventListener('click',save);
  }

  async function loadCatalog(){const r=await storeCall('list');state.baskets=Array.isArray(r.baskets)?r.baskets:[]}
  async function loadKits(){const r=await kitCall('kits',{limit:200});state.kitCatalog=Array.isArray(r.kits)?r.kits:[]}
  async function openBasket(id){
    if(!id)return;state.preview=null;state.quantity=1;
    try{const r=await storeCall('editor',{basket_id:id});const e=r.editor||{};state.draft={basket:{...(e.basket||{})},kits:(e.recipe_kits||[]).map(k=>({...k,quantity:Number(k.quantity||1)}))};if(!state.kitCatalog.length)await loadKits();render()}catch(e){toast(e.data?.message||e.message||'Não consegui abrir esta cesta.')}
  }
  async function newBasket(){
    try{if(!state.kitCatalog.length)await loadKits();state.preview=null;state.quantity=1;state.draft={basket:{id:null,name:'',image_url:'',sale_price:0,hidden_adjustment:0},kits:[]};render()}catch(e){toast(e.data?.message||e.message||'Não consegui preparar uma nova cesta.')}
  }
  async function save(){
    sync();const b=state.draft?.basket||{},kits=state.draft?.kits||[];
    if(!b.name){toast('Informe o nome da cesta.');return}
    if(!kits.length){toast('Adicione pelo menos um kit interno.');return}
    try{
      const r=await storeCall('save',{basket_id:b.id||null,name:b.name,sale_price:Number(b.sale_price||0),image_url:b.image_url||'',kits:kits.map((k,i)=>({kit_id:k.kit_id,quantity:Number(k.quantity||1),is_required:k.is_required!==false,sort_order:i})),operator:operator()});
      const newId=r.result?.basket_id||b.id;toast('Cesta salva. A receita não reservou estoque.');await loadCatalog();if(newId)await openBasket(newId);else render();
    }catch(e){toast(e.data?.message||e.message||'Não consegui salvar a cesta.')}
  }
  async function preview(){
    sync();const id=state.draft?.basket?.id;if(!id){toast('Salve a cesta antes de calcular a prévia.');return}
    try{const r=await storeCall('preview',{basket_id:id,quantity:state.quantity});state.preview=r.preview||null;render()}catch(e){toast(e.data?.message||e.message||'Não consegui calcular a prévia.')}
  }
  async function open(target){
    const root=typeof target==='string'?document.querySelector(target):target;
    if(!root)throw new Error('store_baskets_root_not_found');
    state={root,baskets:[],kitCatalog:[],draft:null,quantity:1,preview:null,loading:true};ensureStyle();root.innerHTML='<div class="sb-loading">Carregando Cestas do Site…</div>';
    try{await Promise.all([loadCatalog(),loadKits()]);state.loading=false;render()}catch(e){state.loading=false;root.innerHTML='<div class="sb-empty">Não foi possível carregar Cestas do Site.</div>';toast(e.data?.message||e.message||'Falha ao carregar Cestas do Site.')}
  }
  async function refresh(){if(!state.root)return;await loadCatalog();render()}

  window.DonaAntoniaStoreBaskets={open,refresh,storeCall};
})();
