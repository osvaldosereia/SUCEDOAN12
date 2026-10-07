(()=>{
'use strict';

const API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-basket-molds-v1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const qty=v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(Number(v||0));
const bridge=()=>window.DonaAntoniaAdminBridge||{};
const toast=m=>typeof bridge().toast==='function'?bridge().toast(m):alert(m);
const operator=()=>typeof bridge().operator==='function'?(bridge().operator()||'Operação'):'Operação';
async function token(){if(typeof bridge().token!=='function')throw new Error('Sessão administrativa indisponível.');return bridge().token()}

let state={root:null,baskets:[],categories:[],subcategories:[],draft:null,busy:false,search:{},results:{},conditionalSearch:'',conditionalResults:[]};

async function call(action,payload={}){
  const t=await token();
  const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify({action,...payload}),cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||d.ok===false){const e=new Error(d.message||d.error||'Falha em Cestas Molde.');e.data=d;throw e}
  return d;
}

function style(){
  if(document.getElementById('basketMoldAdminStyles'))return;
  const s=document.createElement('style');s.id='basketMoldAdminStyles';s.textContent=`
.bm{display:grid;gap:12px;color:#17221b}.bm button{min-height:40px;border:1px solid #dce4df;border-radius:10px;background:#fff;padding:0 12px;font-weight:800;cursor:pointer}.bm button.primary{background:#176b43;border-color:#176b43;color:#fff}.bm button.danger{color:#a12638}.bm button.soft{background:#f4f7f5}.bm button:disabled{opacity:.55;cursor:not-allowed}.bm-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.bm-top h2{margin:0}.bm-grow{flex:1}.bm-grid{display:grid;grid-template-columns:300px minmax(0,1fr);gap:12px}.bm-panel{background:#fff;border:1px solid #e1e7e3;border-radius:14px;padding:12px;min-width:0}.bm-list{display:grid;gap:7px;max-height:72vh;overflow:auto;margin-top:8px}.bm-basket{text-align:left}.bm-basket.active{border:2px solid #176b43;background:#f4faf6}.bm-basket small{display:block;color:#68736c;margin-top:3px}.bm-status{display:inline-flex;margin-top:5px;padding:3px 7px;border-radius:999px;background:#eef3ef;color:#456052;font-size:9px}.bm-status.ready{background:#e7f4ec;color:#155d39}.bm-fields{display:grid;grid-template-columns:1.2fr .8fr .9fr .7fr;gap:8px}.bm label span{display:block;font-size:10px;font-weight:900;color:#68736c;margin-bottom:3px}.bm input,.bm select{width:100%;min-height:42px;border:1px solid #d9e1dc;border-radius:9px;padding:8px;background:#fff}.bm-note{margin:10px 0;padding:9px 10px;border:1px solid #dfe8e2;border-radius:10px;background:#f7faf8;color:#536159;font-size:11px;line-height:1.45}.bm-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:16px 0 8px}.bm-head h3{margin:0}.bm-position{border:1px solid #dfe6e1;border-radius:13px;padding:11px;margin-bottom:10px;background:#fff}.bm-position-top{display:grid;grid-template-columns:minmax(0,1fr) 120px auto;gap:8px;align-items:end}.bm-options{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.bm-selected{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:7px;align-items:center;border:1px solid #dce5df;border-radius:10px;padding:6px;background:#f8faf9}.bm-selected img,.bm-result img{width:42px;height:42px;object-fit:contain;background:#fff;border-radius:7px}.bm-selected small,.bm-result small{display:block;color:#68736c;font-size:9px}.bm-search{display:flex;gap:7px}.bm-search input{flex:1}.bm-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:7px}.bm-result{display:grid!important;grid-template-columns:42px minmax(0,1fr) auto;gap:7px;align-items:center;text-align:left;padding:6px!important;min-height:58px!important}.bm-empty{padding:18px;text-align:center;border:1px dashed #ccd5cf;border-radius:10px;color:#68736c}.bm-conditional{margin:12px 0;padding:12px;border:1px solid #dfe6e1;border-radius:13px;background:#fbfcfb}.bm-conditional.is-off{background:#f7f8f7}.bm-cond-head{display:grid;grid-template-columns:minmax(0,1fr) 190px;gap:10px;align-items:end}.bm-switch{display:flex;align-items:center;gap:9px;min-height:42px;font-weight:900}.bm-switch input{width:auto;min-height:0;transform:scale(1.1)}.bm-cond-product{margin-top:10px}.bm-cond-product-title{font-size:10px;font-weight:900;color:#68736c;margin-bottom:5px}.bm-cond-selected{margin-bottom:8px}.bm-conditional .bm-note{margin-bottom:0}.bm-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap}
@media(max-width:980px){.bm-grid,.bm-fields,.bm-position-top,.bm-cond-head{grid-template-columns:1fr}.bm-results{grid-template-columns:1fr}.bm-list{max-height:none}.bm-actions button{flex:1}}
`;
  document.head.appendChild(s);
}

function normalizeEditor(e){
  const cp=e?.conditional_hidden_product||null;
  return{
    basket_id:e?.basket_id||'',
    category_id:e?.category_id||'',
    subcategory_id:e?.subcategory_id||'',
    name:e?.basket_name||'',
    hidden_adjustment:Number(e?.hidden_adjustment||0),
    conditional_hidden_enabled:e?.conditional_hidden_enabled===true,
    conditional_hidden_product_id:e?.conditional_hidden_product_id||cp?.product_id||'',
    conditional_hidden_adjustment:Number(e?.conditional_hidden_adjustment||0),
    conditional_hidden_product:cp?{product_id:cp.product_id||cp.id,name:cp.name||'Produto',sku:cp.sku||'',gtin:cp.gtin||'',image_url:cp.image_url||'',packaging:cp.packaging||''}:null,
    public_composition_count:Number(e?.public_composition_count||2),
    positions:(Array.isArray(e?.positions)?e.positions:[]).map(p=>({
      position_id:p.position_id||null,label:p.label||'',quantity:Number(p.quantity||1),
      options:(Array.isArray(p.options)?p.options:[]).map(o=>({product_id:o.product_id||o.id,name:o.name||'Produto',sku:o.sku||'',gtin:o.gtin||'',image_url:o.image_url||'',loose_sellable_stock:Number(o.loose_sellable_stock||0)}))
    }))
  };
}

function listHtml(){
  if(!state.baskets.length)return'<div class="bm-empty">Nenhuma cesta comercial cadastrada.</div>';
  return state.baskets.map(b=>'<button type="button" class="bm-basket '+(String(state.draft?.basket_id||'')===String(b.id)?'active':'')+'" data-mold-basket-card="'+esc(b.id)+'"><strong>'+esc(b.name)+'</strong><small>'+esc(b.category_name||'Categoria não definida')+' · '+esc(Number(b.public_composition_count||2))+' composição(ões)</small><span class="bm-status '+(b.mold_configured?'ready':'')+'">'+(b.mold_configured?'Molde configurado':'A configurar')+'</span></button>').join('');
}

function selectedOptionHtml(o,pi,oi){
  return'<div class="bm-selected" data-mold-selected-product><img src="'+esc(o.image_url||'/img/sem-foto.svg')+'" alt=""><span><strong>'+esc(o.name||'Produto')+'</strong><small>'+esc([o.sku,o.gtin].filter(Boolean).join(' · '))+'</small></span><button type="button" class="danger" data-mold-remove-option="'+pi+'" data-option-index="'+oi+'">Remover</button></div>';
}

function resultHtml(p,pi){
  return'<button type="button" class="bm-result" data-mold-product-option="'+esc(p.id)+'" data-position-index="'+pi+'"><img src="'+esc(p.image_url||'/img/sem-foto.svg')+'" alt=""><span><strong>'+esc(p.name||'Produto')+'</strong><small>'+esc([p.sku,p.gtin,p.packaging].filter(Boolean).join(' · '))+'</small><small>Estoque livre: '+esc(qty(p.loose_sellable_stock))+'</small></span><span>Adicionar</span></button>';
}

function positionHtml(p,pi){
  const results=state.results[pi]||[];
  return'<article class="bm-position" data-mold-position="'+pi+'"><div class="bm-position-top"><label><span>Nome da posição</span><input data-mold-position-label="'+pi+'" value="'+esc(p.label||'')+'" placeholder="Ex.: Arroz 5 kg"></label><label><span>Quantidade</span><input data-mold-position-quantity="'+pi+'" type="number" min="0.001" max="999" step="0.001" value="'+esc(p.quantity||1)+'"></label><button type="button" class="danger" data-mold-remove-position="'+pi+'">Remover posição</button></div><div class="bm-options">'+((p.options||[]).map((o,oi)=>selectedOptionHtml(o,pi,oi)).join('')||'<span class="bm-status">Nenhum produto permitido ainda.</span>')+'</div><div class="bm-search"><input data-mold-product-search="'+pi+'" value="'+esc(state.search[pi]||'')+'" placeholder="Buscar produto por nome, código ou EAN"><button type="button" data-mold-product-search-go="'+pi+'">Buscar</button></div><div class="bm-results">'+results.map(r=>resultHtml(r,pi)).join('')+'</div></article>';
}

function conditionalProductHtml(){
  const p=state.draft?.conditional_hidden_product;
  if(!p)return'<div class="bm-empty">Nenhum produto vinculado ao acréscimo.</div>';
  return'<div class="bm-selected bm-cond-selected"><img src="'+esc(p.image_url||'/img/sem-foto.svg')+'" alt=""><span><strong>'+esc(p.name||'Produto')+'</strong><small>'+esc([p.sku,p.gtin,p.packaging].filter(Boolean).join(' · '))+'</small></span><button type="button" class="danger" data-mold-conditional-product-clear>Remover</button></div>';
}

function conditionalResultsHtml(){
  return(state.conditionalResults||[]).map(p=>'<button type="button" class="bm-result" data-mold-conditional-product-option="'+esc(p.id)+'"><img src="'+esc(p.image_url||'/img/sem-foto.svg')+'" alt=""><span><strong>'+esc(p.name||'Produto')+'</strong><small>'+esc([p.sku,p.gtin,p.packaging].filter(Boolean).join(' · '))+'</small><small>Estoque livre: '+esc(qty(p.loose_sellable_stock))+'</small></span><span>Selecionar</span></button>').join('');
}

function editorHtml(){
  const d=state.draft;if(!d)return'<div class="bm-empty">Escolha uma cesta para configurar o molde.</div>';
  const enabled=d.conditional_hidden_enabled===true;
  return'<div data-mold-editor><div class="bm-fields"><label><span>Nome da cesta</span><input data-mold-name value="'+esc(d.name||'')+'"></label><label><span>Valor oculto fixo (somado ao preço)</span><input data-mold-hidden-adjustment type="number" step="0.01" value="'+esc(Number(d.hidden_adjustment||0).toFixed(2))+'"></label><label><span>Categoria na vitrine</span><select data-mold-category><option value="">Selecione uma categoria</option>'+state.categories.map(c=>'<option value="'+esc(c.id)+'" '+(String(d.category_id)===String(c.id)?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label><label><span>Subcategoria na vitrine</span><select data-mold-subcategory><option value="">Selecione uma subcategoria</option>'+state.subcategories.filter(s=>String(s.category_id)===String(d.category_id)).map(c=>'<option value="'+esc(c.id)+'" '+(String(d.subcategory_id)===String(c.id)?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label><label><span>Composições no site</span><select data-mold-composition-count><option value="1" '+(d.public_composition_count===1?'selected':'')+'>1 composição</option><option value="2" '+(d.public_composition_count===2?'selected':'')+'>2 composições</option><option value="3" '+(d.public_composition_count===3?'selected':'')+'>3 composições</option><option value="4" '+(d.public_composition_count===4?'selected':'')+'>4 composições</option></select></label></div><div class="bm-conditional '+(enabled?'':'is-off')+'"><div class="bm-cond-head"><label class="bm-switch"><input type="checkbox" data-mold-conditional-enabled '+(enabled?'checked':'')+'><span>Ativar acréscimo oculto por produto</span></label><label><span>Valor do acréscimo</span><input data-mold-conditional-hidden-adjustment type="number" min="0" step="0.01" value="'+esc(Number(d.conditional_hidden_adjustment||0).toFixed(2))+'" '+(enabled?'':'disabled')+'></label></div><div class="bm-cond-product"><div class="bm-cond-product-title">Produto que ativa o acréscimo</div>'+conditionalProductHtml()+'<div class="bm-search"><input data-mold-conditional-product-search value="'+esc(state.conditionalSearch||'')+'" placeholder="Buscar produto por nome, código ou EAN" '+(enabled?'':'disabled')+'><button type="button" data-mold-conditional-product-search-go '+(enabled?'':'disabled')+'>Buscar</button></div><div class="bm-results">'+(enabled?conditionalResultsHtml():'')+'</div></div><div class="bm-note">Quando o produto selecionado estiver na cesta com quantidade maior que zero, o valor acima será somado uma única vez ao preço. Se o cliente retirar esse produto ou trocar por outro, o acréscimo deixa de ser aplicado. O cliente vê somente o valor final da cesta.</div></div><div class="bm-note">Cada posição representa o que precisa existir na cesta. Em cada posição, selecione todos os produtos que podem ser usados como variação. O valor oculto fixo permanece o mesmo entre as composições e futuras substituições do cliente.</div><div class="bm-head"><h3>Posições do molde</h3><span class="bm-grow"></span><button type="button" data-mold-add-position>+ Adicionar posição</button></div>'+((d.positions||[]).map(positionHtml).join('')||'<div class="bm-empty">Adicione a primeira posição do molde.</div>')+'<div class="bm-actions"><button type="button" class="primary" data-mold-save '+(state.busy?'disabled':'')+'>Salvar molde</button></div></div>';
}

function render(){
  if(!state.root)return;style();
  state.root.innerHTML='<section class="bm"><div class="bm-top"><div><h2>Cestas Molde</h2><small>Defina posições e produtos permitidos. O sistema cuida das composições.</small></div><span class="bm-grow"></span></div><div class="bm-grid"><aside class="bm-panel"><strong>Cestas</strong><div class="bm-list">'+listHtml()+'</div></aside><main class="bm-panel">'+editorHtml()+'</main></div></section>';
  bind();
}

function sync(){
  if(!state.draft||!state.root)return;const q=s=>state.root.querySelector(s);
  state.draft.name=q('[data-mold-name]')?.value.trim()||'';
  state.draft.category_id=q('[data-mold-category]')?.value||'';
  state.draft.subcategory_id=q('[data-mold-subcategory]')?.value||'';
  state.draft.hidden_adjustment=Number(q('[data-mold-hidden-adjustment]')?.value||0);
  state.draft.conditional_hidden_enabled=q('[data-mold-conditional-enabled]')?.checked===true;
  state.draft.conditional_hidden_adjustment=Number(q('[data-mold-conditional-hidden-adjustment]')?.value||state.draft.conditional_hidden_adjustment||0);
  state.conditionalSearch=q('[data-mold-conditional-product-search]')?.value||state.conditionalSearch||'';
  state.draft.public_composition_count=Number(q('[data-mold-composition-count]')?.value||2);
  (state.draft.positions||[]).forEach((p,i)=>{p.label=q('[data-mold-position-label="'+i+'"]')?.value.trim()||'';p.quantity=Number(q('[data-mold-position-quantity="'+i+'"]')?.value||0);state.search[i]=q('[data-mold-product-search="'+i+'"]')?.value||state.search[i]||''});
}

async function loadList(){const r=await call('list');state.baskets=Array.isArray(r.baskets)?r.baskets:[];state.categories=Array.isArray(r.categories)?r.categories:[];state.subcategories=Array.isArray(r.subcategories)?r.subcategories:[]}
async function openBasket(id){try{const r=await call('editor',{basket_id:id});state.draft=normalizeEditor(r.editor||{});state.search={};state.results={};state.conditionalSearch='';state.conditionalResults=[];render()}catch(e){toast(e.message)}}

function addPosition(){sync();state.draft.positions.push({position_id:null,label:'',quantity:1,options:[]});render()}
function removePosition(i){sync();state.draft.positions.splice(i,1);delete state.search[i];delete state.results[i];render()}
function removeOption(pi,oi){sync();state.draft.positions[pi]?.options.splice(oi,1);render()}

async function searchProducts(pi){
  sync();const query=String(state.search[pi]||'').trim();
  try{const r=await call('products',{q:query,limit:24}),used=new Set((state.draft.positions[pi]?.options||[]).map(x=>String(x.product_id)));state.results[pi]=(Array.isArray(r.products)?r.products:[]).filter(p=>!used.has(String(p.id)));render()}catch(e){toast(e.message)}
}

async function searchConditionalProduct(){
  sync();const query=String(state.conditionalSearch||'').trim();
  if(!state.draft?.conditional_hidden_enabled)return;
  try{const r=await call('products',{q:query,limit:24}),selected=String(state.draft.conditional_hidden_product_id||'');state.conditionalResults=(Array.isArray(r.products)?r.products:[]).filter(p=>String(p.id)!==selected);render()}catch(e){toast(e.message)}
}

function selectConditionalProduct(id){
  sync();const p=(state.conditionalResults||[]).find(x=>String(x.id)===String(id));if(!p)return;
  state.draft.conditional_hidden_product_id=p.id;
  state.draft.conditional_hidden_product={product_id:p.id,name:p.name,sku:p.sku,gtin:p.gtin,image_url:p.image_url,packaging:p.packaging};
  state.conditionalResults=[];state.conditionalSearch='';render();
}

function clearConditionalProduct(){
  sync();state.draft.conditional_hidden_product_id='';state.draft.conditional_hidden_product=null;state.conditionalResults=[];state.conditionalSearch='';render();
}

function addOption(pi,id){
  sync();const p=(state.results[pi]||[]).find(x=>String(x.id)===String(id));if(!p)return;
  const pos=state.draft.positions[pi];if(!pos)return;
  if(pos.options.some(x=>String(x.product_id)===String(id)))return toast('Este produto já está permitido nesta posição.');
  pos.options.push({product_id:p.id,name:p.name,sku:p.sku,gtin:p.gtin,image_url:p.image_url,loose_sellable_stock:p.loose_sellable_stock});
  state.results[pi]=state.results[pi].filter(x=>String(x.id)!==String(id));render();
}

async function save(){
  if(state.busy)return;sync();const d=state.draft;
  if(!d.name)return toast('Informe o nome da cesta.');
  if(!d.category_id)return toast('Escolha a categoria da cesta na vitrine.');
  if(!d.subcategory_id)return toast('Escolha a subdivisão da cesta na vitrine.');
  if(![1,2,3,4].includes(Number(d.public_composition_count)))return toast('Escolha de 1 a 4 composições.');
  if(d.conditional_hidden_enabled&&!d.conditional_hidden_product_id)return toast('Escolha o produto que ativa o acréscimo oculto.');
  if(d.conditional_hidden_enabled&&(!Number.isFinite(Number(d.conditional_hidden_adjustment))||Number(d.conditional_hidden_adjustment)<=0))return toast('Informe um valor maior que zero para o acréscimo oculto por produto.');
  if(!d.positions.length)return toast('Adicione pelo menos uma posição.');
  for(const p of d.positions){if(!p.label)return toast('Informe o nome de todas as posições.');if(!Number.isFinite(Number(p.quantity))||Number(p.quantity)<=0)return toast('Informe quantidades válidas.');if(!p.options.length)return toast('Selecione pelo menos um produto em cada posição.');}
  state.busy=true;render();
  try{
    await call('save',{basket_id:d.basket_id,category_id:d.category_id,subcategory_id:d.subcategory_id,name:d.name,hidden_adjustment:Number(d.hidden_adjustment||0),conditional_hidden_enabled:d.conditional_hidden_enabled===true,conditional_hidden_product_id:d.conditional_hidden_product_id||null,conditional_hidden_adjustment:Number(d.conditional_hidden_adjustment||0),public_composition_count:Number(d.public_composition_count),positions:d.positions.map(p=>({label:p.label,quantity:Number(p.quantity),options:p.options.map(o=>({product_id:o.product_id}))})),operator:operator()});
    const id=d.basket_id;await loadList();await openBasket(id);toast('Molde salvo.');
  }catch(e){toast(e.message)}finally{state.busy=false;render()}
}

function bind(){
  if(!state.root)return;
  state.root.querySelector('[data-mold-category]')?.addEventListener('change',()=>{sync();state.draft.subcategory_id='';render()});
  state.root.querySelector('[data-mold-conditional-enabled]')?.addEventListener('change',()=>{sync();state.conditionalResults=[];render()});
  state.root.querySelector('[data-mold-conditional-product-search-go]')?.addEventListener('click',searchConditionalProduct);
  state.root.querySelector('[data-mold-conditional-product-search]')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchConditionalProduct()}});
  state.root.querySelectorAll('[data-mold-conditional-product-option]').forEach(x=>x.addEventListener('click',()=>selectConditionalProduct(x.dataset.moldConditionalProductOption)));
  state.root.querySelector('[data-mold-conditional-product-clear]')?.addEventListener('click',clearConditionalProduct);
  state.root.querySelectorAll('[data-mold-basket-card]').forEach(x=>x.addEventListener('click',()=>openBasket(x.dataset.moldBasketCard)));
  state.root.querySelector('[data-mold-add-position]')?.addEventListener('click',addPosition);
  state.root.querySelectorAll('[data-mold-remove-position]').forEach(x=>x.addEventListener('click',()=>removePosition(Number(x.dataset.moldRemovePosition))));
  state.root.querySelectorAll('[data-mold-remove-option]').forEach(x=>x.addEventListener('click',()=>removeOption(Number(x.dataset.moldRemoveOption),Number(x.dataset.optionIndex))));
  state.root.querySelectorAll('[data-mold-product-search-go]').forEach(x=>x.addEventListener('click',()=>searchProducts(Number(x.dataset.moldProductSearchGo))));
  state.root.querySelectorAll('[data-mold-product-search]').forEach(x=>x.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchProducts(Number(x.dataset.moldProductSearch))}}));
  state.root.querySelectorAll('[data-mold-product-option]').forEach(x=>x.addEventListener('click',()=>addOption(Number(x.dataset.positionIndex),x.dataset.moldProductOption)));
  state.root.querySelector('[data-mold-save]')?.addEventListener('click',save);
}

async function open(target){
  const root=typeof target==='string'?document.querySelector(target):target;if(!root)throw new Error('basket_mold_root_not_found');
  state={root,baskets:[],categories:[],subcategories:[],draft:null,busy:false,search:{},results:{},conditionalSearch:'',conditionalResults:[]};root.innerHTML='<div class="bm-empty">Carregando Cestas Molde…</div>';
  try{await loadList();render()}catch(e){root.innerHTML='<div class="bm-empty">Não foi possível carregar Cestas Molde.</div>';toast(e.message)}
}

async function refresh(){if(!state.root)return;const id=state.draft?.basket_id;await loadList();if(id){await openBasket(id);return}render()}

window.DonaAntoniaBasketMolds={open,refresh,openBasket};
})();
