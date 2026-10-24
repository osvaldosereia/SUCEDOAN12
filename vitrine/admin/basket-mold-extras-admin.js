(()=> {
  'use strict';
  const API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-basket-molds-v1';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bridge=()=>window.DonaAntoniaAdminBridge||{};
  const toast=m=>typeof bridge().toast==='function'?bridge().toast(m):alert(m);
  const state={root:null,themes:[],search:{},results:{},busy:false};

  async function call(action,payload={}) {
    if(typeof bridge().token!=='function')throw new Error('Sessão administrativa indisponível.');
    const token=await bridge().token();
    const res=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...payload}),cache:'no-store'});
    const data=await res.json().catch(()=>({}));
    if(!res.ok||data.ok===false)throw new Error(data.message||data.error||'Falha nos produtos extras.');
    return data;
  }
  function styles(){
    if(document.getElementById('basketExtraThemesAdminStyles'))return;
    const s=document.createElement('style');s.id='basketExtraThemesAdminStyles';
    s.textContent='.bet{display:grid;gap:12px;color:#17221b}.bet-panel{background:#fff;border:1px solid #e1e7e3;border-radius:14px;padding:14px;min-width:0}.bet-head,.bet-theme-head,.bet-search,.bet-actions{display:flex;gap:8px;align-items:center}.bet-head{justify-content:space-between}.bet-head h2{margin:0 0 4px;font-size:20px}.bet-note{color:#66716a;font-size:13px}.bet-theme-list{display:grid;gap:10px;margin-top:12px}.bet-theme{border:1px solid #dfe6e1;border-radius:13px;padding:12px;background:#fff}.bet-theme-head input{flex:1;min-width:0}.bet input{min-height:42px;border:1px solid #d9e1dc;border-radius:9px;padding:9px;font-size:15px}.bet button{min-height:40px;border:1px solid #dce4df;border-radius:9px;background:#fff;padding:0 12px;font-weight:800;cursor:pointer}.bet button:disabled{opacity:.5;cursor:default}.bet button.primary{background:#176b43;color:#fff;border-color:#176b43}.bet button.danger{color:#a12638}.bet-order{display:flex;gap:4px}.bet-products{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px;margin:10px 0}.bet-product{display:grid;grid-template-columns:46px minmax(0,1fr) auto;gap:8px;align-items:center;border:1px solid #dfe6e1;border-radius:10px;padding:7px;font-size:13px}.bet-product img{width:46px;height:46px;object-fit:contain}.bet-product small{display:block;color:#66716a;font-weight:500}.bet-search{margin-top:10px}.bet-search input{flex:1}.bet-results{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:7px;margin-top:8px}.bet-result{display:grid!important;grid-template-columns:40px minmax(0,1fr) auto;gap:7px;align-items:center;text-align:left;height:auto!important;padding:6px!important;font-size:12px}.bet-result img{width:40px;height:40px;object-fit:contain}.bet-result small{display:block;color:#66716a;font-weight:500}.bet-actions{justify-content:flex-end;margin-top:12px}@media(max-width:640px){.bet-head{align-items:flex-start;flex-direction:column}.bet-theme-head{flex-wrap:wrap}.bet-order{margin-left:auto}.bet-products,.bet-results{grid-template-columns:1fr}.bet-search{align-items:stretch}.bet-search input{min-width:0}}';
    document.head.appendChild(s);
  }
  function themeHtml(t,i){
    const products=t.products||[],used=new Set(products.map(p=>String(p.product_id)));
    return '<article class="bet-theme" data-theme="'+esc(t.id)+'"><div class="bet-theme-head"><input data-theme-name="'+i+'" aria-label="Nome do tema" maxlength="80" value="'+esc(t.name)+'" placeholder="Ex.: Café da manhã"><div class="bet-order"><button type="button" data-up="'+i+'" aria-label="Mover tema para cima" '+(i===0?'disabled':'')+'>↑</button><button type="button" data-down="'+i+'" aria-label="Mover tema para baixo" '+(i===state.themes.length-1?'disabled':'')+'>↓</button></div><button type="button" class="danger" data-remove-theme="'+i+'">Excluir tema</button></div><div class="bet-products">'+products.map((p,j)=>'<div class="bet-product"><img src="'+esc(p.image_url||'/img/sem-foto.svg')+'" alt=""><span>'+esc(p.name)+'<small>'+esc([p.sku,p.gtin].filter(Boolean).join(' · '))+'</small></span><button type="button" class="danger" data-remove-product="'+i+':'+j+'" aria-label="Remover '+esc(p.name)+'">×</button></div>').join('')+'</div><div class="bet-search"><input data-search="'+i+'" value="'+esc(state.search[t.id]||'')+'" placeholder="Buscar produto por nome, código ou EAN"><button type="button" data-search-go="'+i+'">Buscar</button></div><div class="bet-results">'+(state.results[t.id]||[]).filter(p=>!used.has(String(p.id))).map(p=>'<button type="button" class="bet-result" data-add-product="'+i+':'+esc(p.id)+'"><img src="'+esc(p.image_url||'/img/sem-foto.svg')+'" alt=""><span>'+esc(p.name)+'<small>'+esc([p.sku,p.gtin].filter(Boolean).join(' · '))+'</small></span><b>+</b></button>').join('')+'</div></article>';
  }
  function render(){
    if(!state.root)return;styles();
    state.root.innerHTML='<section class="bet"><div class="bet-panel"><div class="bet-head"><div><h2>Produtos extras das cestas</h2><div class="bet-note">Os temas e produtos configurados aqui aparecem em todas as cestas. A ordem abaixo define a ordem na vitrine.</div></div><button type="button" data-add-theme>+ Adicionar tema</button></div><div class="bet-theme-list">'+state.themes.map(themeHtml).join('')+'</div><div class="bet-actions"><button type="button" class="primary" data-save '+(state.busy?'disabled':'')+'>Salvar temas e produtos</button></div></div></section>';
    bind();
  }
  async function search(i){
    const t=state.themes[i];if(!t)return;
    const q=state.root.querySelector('[data-search="'+i+'"]')?.value||'';state.search[t.id]=q;
    if(q.trim().length<2){state.results[t.id]=[];render();return}
    try{const r=await call('products',{q,limit:40});state.results[t.id]=r.products||[];render()}
    catch(e){toast(e.message)}
  }
  async function save(){
    if(state.busy)return;
    if(state.themes.some(t=>!String(t.name||'').trim()))return toast('Informe o nome de todos os temas.');
    state.busy=true;render();
    try{
      const r=await call('extra_themes_save',{themes:state.themes.map(t=>({id:t.id,name:t.name.trim(),products:t.products.map(p=>({product_id:p.product_id}))}))});
      state.themes=(r.themes||[]).map(t=>({...t,products:t.products||[]}));state.results={};state.search={};toast('Temas e produtos extras salvos.');
    }catch(e){toast(e.message)}
    finally{state.busy=false;render()}
  }
  function bind(){
    state.root.querySelector('[data-add-theme]')?.addEventListener('click',()=>{state.themes.push({id:crypto.randomUUID(),name:'',products:[]});render();state.root.querySelector('[data-theme-name="'+(state.themes.length-1)+'"]')?.focus()});
    state.root.querySelectorAll('[data-theme-name]').forEach(el=>el.oninput=()=>{state.themes[Number(el.dataset.themeName)].name=el.value});
    state.root.querySelectorAll('[data-remove-theme]').forEach(b=>b.onclick=()=>{state.themes.splice(Number(b.dataset.removeTheme),1);render()});
    state.root.querySelectorAll('[data-up],[data-down]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.up??b.dataset.down),j=b.hasAttribute('data-up')?i-1:i+1;[state.themes[i],state.themes[j]]=[state.themes[j],state.themes[i]];render()});
    state.root.querySelectorAll('[data-remove-product]').forEach(b=>b.onclick=()=>{const [i,j]=b.dataset.removeProduct.split(':').map(Number);state.themes[i].products.splice(j,1);render()});
    state.root.querySelectorAll('[data-search-go]').forEach(b=>b.onclick=()=>search(Number(b.dataset.searchGo)));
    state.root.querySelectorAll('[data-search]').forEach(el=>el.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();search(Number(el.dataset.search))}});
    state.root.querySelectorAll('[data-add-product]').forEach(b=>b.onclick=()=>{const [i,...ids]=b.dataset.addProduct.split(':');const productId=ids.join(':');const t=state.themes[Number(i)],p=(state.results[t.id]||[]).find(x=>String(x.id)===productId);if(!t||!p)return;t.products.push({product_id:p.id,name:p.name,sku:p.sku,gtin:p.gtin,image_url:p.image_url,packaging:p.packaging});state.results[t.id]=state.results[t.id].filter(x=>String(x.id)!==productId);render()});
    state.root.querySelector('[data-save]')?.addEventListener('click',save);
  }
  async function open(target){
    state.root=typeof target==='string'?document.querySelector(target):target;
    if(!state.root)throw new Error('basket_extra_themes_root_not_found');
    state.root.innerHTML='<div class="bet-note">Carregando temas extras…</div>';
    try{const r=await call('extra_themes_editor');state.themes=(r.themes||[]).map(t=>({...t,products:t.products||[]}));render()}
    catch(e){state.root.innerHTML='<div class="bet-note">Não foi possível carregar os temas extras.</div>';toast(e.message)}
  }
  window.DonaAntoniaBasketExtras={open,refresh:open};
})();
