(()=>{
'use strict';

const API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-store-baskets-v1';
const KIT_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-kit-builder-v1';
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const qty=v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(Number(v||0));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numberValue=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:null};

let state={
  root:null,baskets:[],kits:[],draft:null,quantity:1,preview:null,builds:[],busy:false,
  componentEditor:null,replacementProducts:[],replacementBusy:false
};

const bridge=()=>window.DonaAntoniaAdminBridge||{};
const toast=m=>typeof bridge().toast==='function'?bridge().toast(m):alert(m);
const operator=()=>typeof bridge().operator==='function'?(bridge().operator()||'Operação'):'Operação';
async function token(){if(typeof bridge().token!=='function')throw new Error('Sessão administrativa indisponível.');return bridge().token()}

async function storeCall(action,payload={}){
  const t=await token();
  const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify({action,...payload}),cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||d.ok===false){const e=new Error(d.message||d.error||'Falha na operação.');e.data=d;throw e}
  return d;
}

async function kitCall(action='kits',payload={},method='GET'){
  const t=await token();
  const verb=String(method||'GET').toUpperCase();
  let url=KIT_API+'?action='+encodeURIComponent(action);
  const options={method:verb,headers:{Authorization:'Bearer '+t},cache:'no-store'};
  if(verb==='GET'){
    const q=new URLSearchParams();
    Object.entries(payload||{}).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')q.set(k,String(v))});
    const text=q.toString();if(text)url+='&'+text;
  }else{
    options.headers['Content-Type']='application/json';
    options.body=JSON.stringify(payload||{});
  }
  const r=await fetch(url,options);
  const d=await r.json().catch(()=>({}));
  if(!r.ok||d.ok===false){const e=new Error(d.message||d.error||'Falha ao carregar dados de kits.');e.data=d;throw e}
  return d;
}

function style(){
  if(document.getElementById('storeBasketsBuilderStyles'))return;
  const s=document.createElement('style');s.id='storeBasketsBuilderStyles';s.textContent=`
.sb{display:grid;gap:12px;color:#17221b}.sb button{min-height:40px;border:1px solid #d9e1dc;border-radius:10px;background:#fff;padding:0 12px;font-weight:800;cursor:pointer}.sb button.primary{background:#176b43;color:#fff;border-color:#176b43}.sb button.danger{color:#a12638}.sb button.soft{background:#f4f7f5}.sb button:disabled{opacity:.55;cursor:not-allowed}.sb-top,.sb-actions,.sb-oper{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.sb-top h2{margin:0}.sb-grow{flex:1}.sb-grid{display:grid;grid-template-columns:310px minmax(0,1fr);gap:12px}.sb-panel{background:#fff;border:1px solid #e1e7e3;border-radius:14px;padding:12px;min-width:0}.sb-list{display:grid;gap:7px;max-height:72vh;overflow:auto}.sb-card{text-align:left}.sb-card.active{border:2px solid #176b43;background:#f5faf7}.sb-card small{display:block;color:#69746d;margin-top:3px}.sb-fields{display:grid;grid-template-columns:1.4fr .6fr;gap:8px}.sb-fields .wide{grid-column:1/-1}.sb label span{display:block;font-size:10px;font-weight:800;color:#68736c;margin-bottom:3px}.sb input,.sb select{width:100%;min-height:42px;border:1px solid #d9e1dc;border-radius:9px;padding:8px}.sb-image-editor{display:grid;grid-template-columns:116px minmax(0,1fr);gap:10px;align-items:center}.sb-basket-image{width:116px;height:92px;object-fit:contain;border:1px solid #e2e7e4;border-radius:10px;background:#fafcfb}.sb-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:10px 0}.sb-stat{background:#f4f7f5;border-radius:9px;padding:9px}.sb-stat small{display:block;color:#68736c}.sb-kit{display:grid;grid-template-columns:minmax(0,1fr) 100px auto auto;gap:8px;align-items:end;border:1px solid #e3e8e5;border-radius:10px;padding:9px;margin:7px 0}.sb-kit-main small{display:block;color:#68736c;margin-top:3px}.sb-recipe-note{margin:8px 0 12px;padding:9px 10px;border:1px solid #dfe8e2;border-radius:10px;background:#f7faf8;color:#536159;font-size:11px;line-height:1.4}.sb-section-head{display:flex;align-items:end;justify-content:space-between;gap:10px;margin:18px 0 8px}.sb-section-head h3{margin:0}.sb-section-head small{color:#68736c}.sb-product-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.sb-product-card{border:1px solid #dfe6e1;border-radius:12px;background:#fff;padding:9px;min-width:0;display:flex;flex-direction:column}.sb-product-card>img{width:100%;height:116px;object-fit:contain;background:#fafcfb;border-radius:9px}.sb-product-card h4{font-size:12px;line-height:1.25;margin:8px 0 3px}.sb-product-meta{font-size:9px;color:#69746d;min-height:24px;overflow-wrap:anywhere}.sb-product-qty{margin:7px 0;padding:7px 8px;border-radius:8px;background:#eff6f1;font-size:11px}.sb-product-qty strong{font-size:14px}.sb-kit-sources{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:7px}.sb-kit-source{display:inline-flex;border-radius:999px;background:#edf3ef;color:#315b43;padding:4px 6px;font-size:8px;font-weight:800;line-height:1.2}.sb-product-metrics{display:grid;grid-template-columns:1fr 1fr;gap:4px}.sb-product-metric{background:#f6f8f6;border-radius:7px;padding:5px;min-width:0}.sb-product-metric small{display:block;color:#69746d;font-size:8px}.sb-product-metric strong{font-size:10px}.sb-product-actions{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:7px}.sb-product-actions button{min-height:32px;padding:0 7px;font-size:9px}.sb-product-actions .wide{grid-column:1/-1}.sb-oper{padding:12px;background:#f7faf8;border:1px solid #dfe7e2;border-radius:12px;margin-top:10px}.sb-oper label{width:150px}.sb-history{display:grid;gap:7px;margin-top:8px}.sb-build{display:grid;grid-template-columns:1fr auto;gap:8px;border:1px solid #e1e7e3;border-radius:10px;padding:10px}.sb-badge{display:inline-block;padding:4px 8px;border-radius:999px;background:#fff1cf;color:#765500;font-size:10px;font-weight:900}.sb-badge.done{background:#e8f5ed;color:#145b38}.sb-badge.cancel{background:#f2f2f2;color:#666}.sb-empty{padding:18px;text-align:center;border:1px dashed #ccd5cf;border-radius:10px;color:#68736c}.sb-preview{font-size:11px;overflow:auto}.sb-preview table{width:100%;border-collapse:collapse}.sb-preview td,.sb-preview th{padding:6px;border-bottom:1px solid #eee;text-align:right}.sb-preview td:first-child,.sb-preview th:first-child{text-align:left}.sb-modal-backdrop{position:fixed;inset:0;background:rgba(16,31,23,.5);z-index:10030;display:grid;place-items:center;padding:18px}.sb-modal{width:min(720px,100%);max-height:min(760px,92vh);overflow:auto;background:#fff;border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.25);padding:16px}.sb-modal-head{display:flex;gap:12px;align-items:start}.sb-modal-head img{width:74px;height:74px;object-fit:contain;background:#fafafa;border-radius:10px}.sb-modal-head h3{margin:0 0 4px}.sb-modal-head p{margin:0;color:#68736c;font-size:11px}.sb-modal-fields{display:grid;gap:9px;margin-top:14px}.sb-modal-note{padding:9px 10px;border-radius:9px;background:#f4f8f5;color:#536159;font-size:11px;line-height:1.4}.sb-replacement-search{display:flex;gap:7px}.sb-replacement-search input{flex:1}.sb-replacement-results{display:grid;gap:7px;margin-top:8px}.sb-replacement{display:grid;grid-template-columns:54px minmax(0,1fr) auto;gap:8px;align-items:center;text-align:left;padding:7px!important;min-height:68px!important}.sb-replacement.selected{border:2px solid #176b43;background:#f2f8f4}.sb-replacement img{width:54px;height:54px;object-fit:contain;background:#fafafa;border-radius:8px}.sb-replacement small{display:block;color:#68736c;font-weight:500}.sb-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
@media(max-width:1280px){.sb-product-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:1050px){.sb-product-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:880px){.sb-grid,.sb-fields,.sb-kit,.sb-build,.sb-image-editor{grid-template-columns:1fr}.sb-summary{grid-template-columns:1fr 1fr}.sb-fields .wide{grid-column:auto}.sb-basket-image{width:100%;height:150px}.sb-kit button{width:100%}}
@media(max-width:560px){.sb-product-grid{grid-template-columns:1fr}.sb-summary{grid-template-columns:1fr 1fr}.sb-replacement{grid-template-columns:50px minmax(0,1fr)}}
`;
  document.head.appendChild(s);
}

function summary(){
  let cost=0,sale=0;
  for(const k of state.draft?.kits||[]){const q=Number(k.quantity||1);cost+=Number(k.unit_cost_total??k.cost_total??0)*q;sale+=Number(k.unit_sale_total??k.sale_total??0)*q}
  const final=Number(state.draft?.basket?.sale_price||0);
  return{cost,sale,final,hidden:final-sale};
}

function buildStatus(b){
  const s=String(b.status||b.state||'').toLowerCase();
  if(s.includes('cancel'))return['Cancelado','cancel'];
  if(s.includes('mount')||s.includes('sell')||s.includes('ready'))return['Montado','done'];
  return['Em montagem',''];
}

function historyHtml(){
  if(!state.draft?.basket?.id)return'';
  if(!state.builds.length)return'<div class="sb-empty" data-store-builds>Nenhuma montagem registrada.</div>';
  return'<div class="sb-history" data-store-builds>'+state.builds.map(b=>{
    const st=buildStatus(b),id=b.lot_id||b.id,q=b.quantity_built??b.quantity??b.qty??b.units??0;
    const physical=st[0]==='Em montagem'?'<button data-store-mount="'+esc(id)+'">Marcar como montado</button><button class="danger" data-store-cancel="'+esc(id)+'">Cancelar reserva</button>':'';
    const print=st[0]!=='Cancelado'?'<button data-store-print="'+esc(id)+'">Imprimir A4</button>':'';
    return'<div class="sb-build"><div><strong>'+esc(b.code||b.lot_code||'Lote')+'</strong> · '+esc(q)+' cesta(s)<br><span class="sb-badge '+st[1]+'">'+st[0]+'</span></div><div class="sb-actions">'+print+physical+'</div></div>';
  }).join('')+'</div>';
}

function previewHtml(){
  const p=state.preview;if(!p)return'';
  return'<div class="sb-preview"><table><tr><th>Produto</th><th>Necessário</th><th>Avulso</th><th>Saldo</th></tr>'+((p.requirements||[]).map(r=>'<tr><td>'+esc(r.name||r.product_id)+'</td><td>'+esc(r.required)+'</td><td>'+esc(r.available)+'</td><td>'+esc(r.balance_after)+'</td></tr>').join(''))+'</table></div>';
}

function listHtml(){
  return state.baskets.length?state.baskets.map(b=>'<button class="sb-card '+(String(state.draft?.basket?.id||'')===String(b.id)?'active':'')+'" data-store-basket-card="'+esc(b.id)+'"><strong>'+esc(b.name)+'</strong><small>'+money(b.sale_price)+' · '+Number(b.kit_count||b.kits?.length||0)+' kit(s)</small></button>').join(''):'<div class="sb-empty">Nenhuma Cesta do Site configurada.</div>';
}

function productSource(product,kitId){
  const sources=Array.isArray(product?.kit_sources)?product.kit_sources:[];
  return sources.find(x=>String(x.kit_id)===String(kitId))||sources[0]||null;
}

function linkedKit(kitId){return (state.draft?.kits||[]).find(k=>String(k.kit_id)===String(kitId))||null}

function rawQuantity(product,kitId){
  const source=productSource(product,kitId);if(!source)return Number(product?.quantity_per_basket||1);
  const multiplier=Math.max(.001,Number(linkedKit(source.kit_id)?.quantity||1));
  return Number(source.quantity||0)/multiplier||Number(product?.quantity_per_basket||1)/multiplier||1;
}

function productGridHtml(){
  const rows=Array.isArray(state.draft?.products)?state.draft.products:[];
  if(!state.draft?.basket?.id)return'<div class="sb-empty">Salve a receita para visualizar a composição consolidada.</div>';
  if(!rows.length)return'<div class="sb-empty">Esta cesta ainda não possui produtos em sua receita.</div>';
  return'<div class="sb-product-grid" data-store-product-grid>'+rows.map(p=>{
    const sources=Array.isArray(p.kit_sources)?p.kit_sources:[];
    const sourceHtml=sources.map(k=>'<span class="sb-kit-source">'+esc(k.name||'Kit')+'</span>').join('');
    return'<article class="sb-product-card" data-store-product-card="'+esc(p.product_id)+'">'+
      '<img src="'+esc(p.image_url||'/img/sem-foto.svg')+'" alt=""><h4>'+esc(p.name||'Produto')+'</h4><div class="sb-product-meta">'+esc([p.sku,p.gtin,p.packaging].filter(Boolean).join(' · '))+'</div>'+
      '<div class="sb-product-qty">Qtd. na cesta: <strong>'+esc(qty(p.quantity_per_basket))+'</strong></div><div class="sb-kit-sources">'+sourceHtml+'</div>'+
      '<div class="sb-product-metrics"><div class="sb-product-metric"><small>Livre</small><strong>'+esc(qty(p.loose_sellable_stock))+'</strong></div><div class="sb-product-metric"><small>Reservado</small><strong>'+esc(qty(p.basket_locked_quantity))+'</strong></div><div class="sb-product-metric"><small>Custo</small><strong>'+esc(money(p.cost_price))+'</strong></div><div class="sb-product-metric"><small>Venda</small><strong>'+esc(money(p.sale_price))+'</strong></div></div>'+
      '<div class="sb-product-actions"><button type="button" data-store-product-qty-edit="'+esc(p.product_id)+'">Editar quantidade</button><button type="button" data-store-product-replace="'+esc(p.product_id)+'">Substituir</button><button type="button" class="danger wide" data-store-product-remove="'+esc(p.product_id)+'">Remover desta cesta</button></div></article>';
  }).join('')+'</div>';
}

function componentEditorHtml(){
  const e=state.componentEditor;if(!e)return'';
  const p=(state.draft?.products||[]).find(x=>String(x.product_id)===String(e.productId));
  if(!p)return'';
  const sources=Array.isArray(p.kit_sources)?p.kit_sources:[];
  const source=productSource(p,e.kitId);
  const modeTitle=e.mode==='replace'?'Substituir produto':'Editar quantidade';
  const sourceSelect=sources.length>1?'<label><span>Kit de origem a editar</span><select data-store-component-kit>'+sources.map(k=>'<option value="'+esc(k.kit_id)+'" '+(String(k.kit_id)===String(e.kitId)?'selected':'')+'>'+esc(k.name||'Kit')+'</option>').join('')+'</select></label>':'<div class="sb-modal-note">Kit de origem: <strong>'+esc(source?.name||'Kit')+'</strong></div>';
  let body='';
  if(e.mode==='quantity'){
    body='<label><span>Quantidade dentro do kit</span><input data-store-component-quantity type="number" min="0.001" max="999" step="0.001" value="'+esc(Number(e.quantity||1))+'"></label><small>A quantidade efetiva da cesta considera também o multiplicador do kit.</small>';
  }else{
    const results=state.replacementProducts||[];
    body='<div class="sb-replacement-search"><input data-store-component-search placeholder="Buscar produto por nome, código ou EAN" value="'+esc(e.search||'')+'"><button type="button" data-store-component-search-go '+(state.replacementBusy?'disabled':'')+'>Buscar</button></div><div class="sb-replacement-results">'+(results.map(r=>'<button type="button" class="sb-replacement '+(String(e.selectedProductId)===String(r.id)?'selected':'')+'" data-store-replacement-product="'+esc(r.id)+'"><img src="'+esc(r.image_url||'/img/sem-foto.svg')+'" alt=""><span><strong>'+esc(r.name||'Produto')+'</strong><small>'+esc([r.sku,r.gtin,r.packaging].filter(Boolean).join(' · '))+'</small><small>Livre '+esc(qty(r.loose_sellable_stock))+' · '+esc(money(r.sale_price))+'</small></span><span>Selecionar</span></button>').join('')||'<div class="sb-empty">Busque o produto substituto.</div>')+'</div>';
  }
  return'<div class="sb-modal-backdrop" data-store-component-editor><div class="sb-modal" role="dialog" aria-modal="true"><div class="sb-modal-head"><img src="'+esc(p.image_url||'/img/sem-foto.svg')+'" alt=""><div><h3>'+modeTitle+'</h3><p>'+esc(p.name||'Produto')+'</p></div></div><div class="sb-modal-fields">'+sourceSelect+body+'<div class="sb-modal-note">Esta edição é <strong>basket_only</strong>: vale somente para esta cesta. Se o kit for compartilhado, o sistema cria uma <strong>cópia exclusiva</strong> automaticamente. Lotes já reservados ou montados permanecem inalterados.</div></div><div class="sb-modal-actions"><button type="button" data-store-component-close>Cancelar</button><button type="button" class="primary" data-store-component-save '+(e.mode==='replace'&&!e.selectedProductId?'disabled':'')+'>'+(e.mode==='replace'?'Substituir produto':'Salvar quantidade')+'</button></div></div></div>';
}

function editorHtml(){
  if(!state.draft)return'<div class="sb-empty">Escolha uma cesta ou crie uma nova.</div>';
  const b=state.draft.basket||{},s=summary(),used=new Set((state.draft.kits||[]).map(k=>String(k.kit_id))),avail=state.kits.filter(k=>!used.has(String(k.id))),products=state.draft.products||[];
  const linked=(state.draft.kits||[]).map((k,i)=>'<div class="sb-kit"><div class="sb-kit-main"><strong>'+esc(k.name||'Kit')+'</strong><small>'+esc(k.type||'')+'</small></div><label><span>Quantidade</span><input data-store-kit-qty data-store-index="'+i+'" type="number" min=".001" step=".001" value="'+esc(k.quantity||1)+'"></label><button type="button" class="soft" data-store-edit-kit="'+esc(k.kit_id)+'">Editar kit base</button><button type="button" class="danger" data-store-kit-remove="'+i+'">Remover</button></div>').join('');
  return'<div data-store-basket-editor><div class="sb-fields"><label><span>Nome da cesta</span><input data-store-name value="'+esc(b.name||'')+'"></label><label><span>Valor de venda</span><input data-store-sale-price type="number" step="0.01" min="0" value="'+esc(Number(b.sale_price||0).toFixed(2))+'"></label><div class="wide sb-image-editor"><img class="sb-basket-image" src="'+esc(b.image_url||'/img/sem-foto.svg')+'" alt="Imagem da cesta"><label><span>Imagem da cesta</span><input data-store-image value="'+esc(b.image_url||'')+'" placeholder="URL da imagem"><small>A imagem atual aparece ao lado.</small></label></div></div><div class="sb-summary"><div class="sb-stat"><small>Custo dos produtos</small><b>'+money(s.cost)+'</b></div><div class="sb-stat"><small>Venda dos produtos</small><b>'+money(s.sale)+'</b></div><div class="sb-stat"><small>Valor final</small><b>'+money(s.final)+'</b></div><div class="sb-stat"><small>Valor oculto</small><b>'+money(s.hidden)+'</b></div></div><h3>Kits internos</h3><div class="sb-recipe-note">Editar o kit base altera o próprio kit. Já as ações nos cards de produto abaixo são protegidas para esta cesta: se o kit for compartilhado, será criada uma cópia exclusiva.</div>'+linked+'<div class="sb-kit"><select data-store-kit-select><option value="">Escolha um kit...</option>'+avail.map(k=>'<option value="'+esc(k.id)+'">'+esc(k.name)+'</option>').join('')+'</select><span></span><span></span><button data-store-kit-add type="button">+ Adicionar kit</button></div><div class="sb-actions"><button class="primary" data-store-save type="button">Salvar receita</button></div><div class="sb-section-head"><div><h3>Produtos desta cesta</h3><small>Composição atual salva · '+esc(products.length)+' produto(s)</small></div></div>'+productGridHtml()+'<h3>Montagem</h3><div class="sb-oper"><label><span>Quantidade a montar</span><input data-store-quantity type="number" min="1" max="500" value="'+esc(state.quantity)+'"></label><button data-store-preview type="button" '+(!b.id?'disabled':'')+'>Calcular prévia</button><button class="primary" data-store-reserve type="button" '+(!b.id||state.busy?'disabled':'')+'>Montar / Reservar</button><small>A reserva retira os componentes do estoque avulso. Ao terminar fisicamente, marque como montado.</small></div>'+previewHtml()+'<h3>Histórico de montagem</h3>'+historyHtml()+'</div>';
}

function render(){
  if(!state.root)return;style();
  state.root.innerHTML='<section class="sb"><div class="sb-top"><div><h2>Cestas do Site</h2><small>Receita, reserva física e montagem no mesmo lugar.</small></div><span class="sb-grow"></span><button class="primary" data-store-new type="button">+ Nova cesta</button></div><div class="sb-grid"><aside class="sb-panel"><strong>Cestas configuradas</strong><div class="sb-list" data-store-basket-list>'+listHtml()+'</div></aside><main class="sb-panel">'+editorHtml()+'</main></div>'+componentEditorHtml()+'</section>';
  bind();
}

function sync(){
  if(!state.draft)return;const q=s=>state.root.querySelector(s);
  state.draft.basket.name=q('[data-store-name]')?.value.trim()||'';
  state.draft.basket.image_url=q('[data-store-image]')?.value.trim()||'';
  state.draft.basket.sale_price=Math.max(0,Number(q('[data-store-sale-price]')?.value||0));
  state.quantity=Math.max(1,Math.min(500,Math.trunc(Number(q('[data-store-quantity]')?.value||1))));
  state.root.querySelectorAll('[data-store-kit-qty]').forEach(el=>{const k=state.draft.kits[Number(el.dataset.storeIndex)];if(k)k.quantity=Math.max(.001,Number(el.value||1))});
}

async function loadCatalog(){const r=await storeCall('list');state.baskets=Array.isArray(r.baskets)?r.baskets:[]}
async function loadKits(){const r=await kitCall('kits',{limit:200},'GET');state.kits=Array.isArray(r.kits)?r.kits:[]}
async function loadBuilds(){const id=state.draft?.basket?.id;if(!id){state.builds=[];return}const r=await storeCall('builds',{basket_id:id});state.builds=Array.isArray(r.builds)?r.builds:[]}

async function openBasket(id,{resetQuantity=true}={}){
  try{
    state.preview=null;if(resetQuantity)state.quantity=1;state.componentEditor=null;state.replacementProducts=[];
    const r=await storeCall('editor',{basket_id:id}),e=r.editor||{};
    state.draft={basket:{...(e.basket||{})},kits:(e.recipe_kits||[]).map(k=>({...k,quantity:Number(k.quantity||1)})),products:Array.isArray(e.products)?e.products:[]};
    await loadBuilds();render();
  }catch(e){toast(e.message)}
}

function newBasket(){state.preview=null;state.builds=[];state.quantity=1;state.componentEditor=null;state.replacementProducts=[];state.draft={basket:{id:null,name:'',image_url:'',sale_price:0},kits:[],products:[]};render()}

async function save(){
  sync();const b=state.draft.basket,k=state.draft.kits;
  if(!b.name)return toast('Informe o nome da cesta.');if(!k.length)return toast('Adicione pelo menos um kit interno.');
  try{
    const r=await storeCall('save',{basket_id:b.id||null,name:b.name,sale_price:b.sale_price,image_url:b.image_url,kits:k.map((x,i)=>({kit_id:x.kit_id,quantity:Number(x.quantity||1),is_required:true,sort_order:i})),operator:operator()}),id=r.result?.basket_id||b.id;
    await loadCatalog();if(id)await openBasket(id);toast('Cesta salva.');
  }catch(e){toast(e.message)}
}

async function preview(){sync();try{const r=await storeCall('preview',{basket_id:state.draft.basket.id,quantity:state.quantity});state.preview=r.preview||null;render()}catch(e){toast(e.message)}}

async function reserve(){
  if(state.busy)return;sync();if(!confirm('Reservar '+state.quantity+' cesta(s) para montagem? Os produtos sairão do estoque avulso.'))return;
  state.busy=true;render();
  try{await storeCall('reserve',{basket_id:state.draft.basket.id,quantity:state.quantity,operator:operator()});await Promise.all([loadCatalog(),loadBuilds()]);state.preview=null;toast('Reserva criada. Status: Em montagem.')}catch(e){toast(e.message)}finally{state.busy=false;render()}
}

async function mount(id){if(state.busy||!confirm('Confirmar que este lote foi fisicamente montado?'))return;state.busy=true;try{await storeCall('mount',{lot_id:id,operator:operator()});await Promise.all([loadCatalog(),loadBuilds()]);toast('Lote marcado como montado e disponível.')}catch(e){toast(e.message)}finally{state.busy=false;render()}}
async function cancel(id){if(state.busy||!confirm('Cancelar esta reserva e devolver os produtos ao estoque avulso?'))return;state.busy=true;try{await storeCall('cancel',{lot_id:id,operator:operator(),reason:'Cancelado pela operação em Cestas do Site'});await Promise.all([loadCatalog(),loadBuilds()]);toast('Reserva cancelada. Estoque avulso devolvido.')}catch(e){toast(e.message)}finally{state.busy=false;render()}}

function openComponentEditor(productId,mode){
  const p=(state.draft?.products||[]).find(x=>String(x.product_id)===String(productId));if(!p)return;
  const source=(Array.isArray(p.kit_sources)?p.kit_sources:[])[0];if(!source){toast('Não encontrei o kit de origem deste produto.');return}
  state.replacementProducts=[];
  state.componentEditor={productId:String(productId),mode,kitId:String(source.kit_id),quantity:rawQuantity(p,source.kit_id),search:'',selectedProductId:null};
  render();
}

function closeComponentEditor(){state.componentEditor=null;state.replacementProducts=[];render()}

function changeComponentKit(kitId){
  const e=state.componentEditor;if(!e)return;
  const p=(state.draft?.products||[]).find(x=>String(x.product_id)===String(e.productId));if(!p)return;
  e.kitId=String(kitId||'');e.quantity=rawQuantity(p,e.kitId);e.selectedProductId=null;render();
}

async function searchReplacementProducts(){
  const e=state.componentEditor;if(!e||e.mode!=='replace')return;
  const input=state.root.querySelector('[data-store-component-search]');e.search=String(input?.value||'').trim();
  state.replacementBusy=true;render();
  try{
    // Substituição usa o catálogo canônico action=products.
    const r=await kitCall('products',{q:e.search,limit:12},'GET');
    state.replacementProducts=(Array.isArray(r.products)?r.products:[]).filter(p=>String(p.id)!==String(e.productId));
  }catch(err){toast(err.message||'Não consegui buscar produtos.')}finally{state.replacementBusy=false;render()}
}

async function submitComponentEdit(){
  const e=state.componentEditor;if(!e||state.busy)return;
  const basketId=state.draft?.basket?.id;if(!basketId)return;
  const payload={basket_id:basketId,kit_id:e.kitId,product_id:e.productId,operator:operator()};
  if(e.mode==='quantity'){
    const n=numberValue(state.root.querySelector('[data-store-component-quantity]')?.value);
    if(n===null||n<=0||n>999){toast('Informe uma quantidade válida.');return}
    payload.edit_action='set_quantity';payload.quantity=Math.round(n*1000)/1000;
  }else{
    if(!e.selectedProductId){toast('Escolha o produto substituto.');return}
    payload.edit_action='replace';payload.new_product_id=e.selectedProductId;
  }
  state.busy=true;render();
  try{
    const r=await storeCall('component_edit',payload);const cloned=r.result?.cloned===true;const keepQty=state.quantity;
    await Promise.all([loadCatalog(),loadKits()]);await openBasket(basketId,{resetQuantity:false});state.quantity=keepQty;
    toast((payload.edit_action==='replace'?'Produto substituído.':'Quantidade atualizada.')+(cloned?' Cópia exclusiva criada para esta cesta.':''));render();
  }catch(err){toast(err.message||'Não consegui editar este produto.')}finally{state.busy=false;render()}
}

async function removeComponent(productId){
  const p=(state.draft?.products||[]).find(x=>String(x.product_id)===String(productId));if(!p)return;
  const sources=Array.isArray(p.kit_sources)?p.kit_sources:[];
  if(sources.length>1){openComponentEditor(productId,'quantity');toast('Este produto vem de mais de um kit. Escolha o kit e ajuste sua receita.');return}
  const source=sources[0];if(!source)return toast('Não encontrei o kit de origem deste produto.');
  if(!confirm('Remover '+(p.name||'este produto')+' desta cesta nas próximas montagens? Lotes já montados não serão alterados.'))return;
  state.busy=true;render();
  try{
    const r=await storeCall('component_edit',{basket_id:state.draft.basket.id,kit_id:source.kit_id,product_id:p.product_id,edit_action:'remove',operator:operator()});const cloned=r.result?.cloned===true;const basketId=state.draft.basket.id,keepQty=state.quantity;
    await Promise.all([loadCatalog(),loadKits()]);await openBasket(basketId,{resetQuantity:false});state.quantity=keepQty;
    toast('Produto removido desta cesta.'+(cloned?' Cópia exclusiva criada para esta cesta.':''));render();
  }catch(err){toast(err.message||'Não consegui remover este produto.')}finally{state.busy=false;render()}
}

async function editKit(kitId){
  const controller=window.DonaAntoniaBasketAdmin;
  if(controller&&typeof controller.setTab==='function')await controller.setTab('kits');
  for(let i=0;i<20;i++){
    const mod=window.DonaAntoniaKitBuilder;
    if(mod&&typeof mod.loadKit==='function'){await mod.loadKit(kitId);return}
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  toast('Abra o Criador de Kits para editar este kit base.');
}

async function printBuild(id){
  try{
    const r=await storeCall('build_detail',{lot_id:id}),b=r.build||{},items=Array.isArray(b.items)?b.items:[],w=window.open('','_blank','noopener,noreferrer,width=1100,height=850');
    if(!w){toast('Permita pop-ups para imprimir o lote.');return}
    const cards=items.map(i=>'<article><img src="'+esc(i.image_url||'')+'" alt=""><h3>'+esc(i.name||'Produto')+'</h3><p><strong>'+esc(i.quantity_for_lot||0)+' un.</strong> no lote</p><small>'+esc(i.quantity_per_basket||0)+' por cesta</small></article>').join(''),title=esc(b.public_name||state.draft?.basket?.name||'Cesta'),code=esc(b.lot_code||'Lote'),q=esc(b.quantity_built||0);
    w.document.open();w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+title+' · '+code+'</title><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0}header{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}h1{font-size:20px;margin:0}header p{margin:2px 0;font-size:12px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}article{break-inside:avoid;border:1px solid #bbb;border-radius:8px;padding:7px;min-height:190px;text-align:center}article img{width:100%;height:108px;object-fit:contain}article h3{font-size:11px;line-height:1.2;margin:6px 0}article p{font-size:12px;margin:4px 0}article small{font-size:10px;color:#555}@media print{button{display:none}}</style></head><body><header><div><h1>'+title+'</h1><p>Lote: <strong>'+code+'</strong></p></div><div><p>Quantidade: <strong>'+q+' cesta(s)</strong></p><p>Operador: '+esc(b.built_by||operator())+'</p></div></header><main class="grid">'+cards+'</main><script>window.onload=()=>setTimeout(()=>window.print(),150)<\/script></body></html>');w.document.close();
  }catch(e){toast(e.message||'Não foi possível imprimir o lote.')}
}

function bind(){
  if(!state.root)return;
  state.root.querySelector('[data-store-new]')?.addEventListener('click',newBasket);
  state.root.querySelectorAll('[data-store-basket-card]').forEach(x=>x.addEventListener('click',()=>openBasket(x.dataset.storeBasketCard)));
  state.root.querySelector('[data-store-kit-add]')?.addEventListener('click',()=>{sync();const id=state.root.querySelector('[data-store-kit-select]')?.value,k=state.kits.find(x=>String(x.id)===String(id));if(k){state.draft.kits.push({kit_id:k.id,name:k.name,type:k.type,quantity:1,unit_cost_total:Number(k.cost_total||0),unit_sale_total:Number(k.sale_total||0)});render()}});
  state.root.querySelectorAll('[data-store-kit-remove]').forEach(x=>x.addEventListener('click',()=>{sync();state.draft.kits.splice(Number(x.dataset.storeKitRemove),1);render()}));
  state.root.querySelectorAll('[data-store-edit-kit]').forEach(x=>x.addEventListener('click',()=>editKit(x.dataset.storeEditKit)));
  state.root.querySelector('[data-store-save]')?.addEventListener('click',save);
  state.root.querySelector('[data-store-preview]')?.addEventListener('click',preview);
  state.root.querySelector('[data-store-reserve]')?.addEventListener('click',reserve);
  state.root.querySelectorAll('[data-store-mount]').forEach(x=>x.addEventListener('click',()=>mount(x.dataset.storeMount)));
  state.root.querySelectorAll('[data-store-cancel]').forEach(x=>x.addEventListener('click',()=>cancel(x.dataset.storeCancel)));
  state.root.querySelectorAll('[data-store-print]').forEach(x=>x.addEventListener('click',()=>printBuild(x.dataset.storePrint)));
  state.root.querySelectorAll('[data-store-product-qty-edit]').forEach(x=>x.addEventListener('click',()=>openComponentEditor(x.dataset.storeProductQtyEdit,'quantity')));
  state.root.querySelectorAll('[data-store-product-replace]').forEach(x=>x.addEventListener('click',()=>openComponentEditor(x.dataset.storeProductReplace,'replace')));
  state.root.querySelectorAll('[data-store-product-remove]').forEach(x=>x.addEventListener('click',()=>removeComponent(x.dataset.storeProductRemove)));
  state.root.querySelector('[data-store-component-close]')?.addEventListener('click',closeComponentEditor);
  state.root.querySelector('[data-store-component-kit]')?.addEventListener('change',e=>changeComponentKit(e.target.value));
  state.root.querySelector('[data-store-component-search-go]')?.addEventListener('click',searchReplacementProducts);
  state.root.querySelector('[data-store-component-search]')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchReplacementProducts()}});
  state.root.querySelectorAll('[data-store-replacement-product]').forEach(x=>x.addEventListener('click',()=>{if(state.componentEditor){state.componentEditor.selectedProductId=x.dataset.storeReplacementProduct;render()}}));
  state.root.querySelector('[data-store-component-save]')?.addEventListener('click',submitComponentEdit);
}

async function open(target){
  const root=typeof target==='string'?document.querySelector(target):target;if(!root)throw new Error('store_baskets_root_not_found');
  state={root,baskets:[],kits:[],draft:null,quantity:1,preview:null,builds:[],busy:false,componentEditor:null,replacementProducts:[],replacementBusy:false};
  root.innerHTML='<div class="sb-empty">Carregando Cestas do Site…</div>';
  try{await Promise.all([loadCatalog(),loadKits()]);render()}catch(e){root.innerHTML='<div class="sb-empty">Não foi possível carregar Cestas do Site.</div>';toast(e.message)}
}

async function refresh(){if(!state.root)return;await loadCatalog();if(state.draft?.basket?.id){await openBasket(state.draft.basket.id,{resetQuantity:false});return}render()}

window.DonaAntoniaStoreBaskets={open,refresh,storeCall,openBasket,openComponentEditor,searchReplacementProducts,editKit};
})();
