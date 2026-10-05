from pathlib import Path

# Edge API
p=Path('supabase/functions/admin-basket-guided-v1/index.ts')
s=p.read_text(encoding='utf-8')
old='''async function modelEditor(input:any){const basketId=uuid(input?.basket_id);if(!basketId)return {error:"invalid_basket",status:400};const q=await db.rpc("basket_commercial_model_editor_v1",{p_basket_id:basketId});if(q.error)return rpcError(q.error);return {model:q.data};}\nasync function modelSave(input:any){const basketId=uuid(input?.basket_id),positions=list(input?.positions);if(!basketId)return {error:"invalid_basket",status:400};if(!positions||!positions.length)return {error:"basket_positions_invalid",status:400};const q=await db.rpc("save_basket_commercial_model_composition_v1",{p_basket_id:basketId,p_positions:positions,p_operator:operator(input)});if(q.error)return rpcError(q.error);return {model:q.data};}'''
new='''async function modelEditor(input:any){
  const basketId=uuid(input?.basket_id);if(!basketId)return {error:"invalid_basket",status:400};
  const [q,categories]=await Promise.all([
    db.rpc("basket_commercial_model_editor_v1",{p_basket_id:basketId}),
    db.from("basket_categories").select("id,name,slug,sort_order,is_active").eq("is_active",true).order("sort_order").order("name")
  ]);
  if(q.error)return rpcError(q.error);if(categories.error)throw categories.error;
  return {model:q.data,categories:categories.data||[]};
}
async function modelSave(input:any){
  const basketId=uuid(input?.basket_id),positions=list(input?.positions),commercial=input?.commercial||{};
  const name=clean(commercial?.name,180),categoryId=uuid(commercial?.category_id),basePrice=money(commercial?.base_price),imageUrl=clean(commercial?.image_url,1000);
  if(!basketId)return {error:"invalid_basket",status:400};
  if(!positions||!positions.length)return {error:"basket_positions_invalid",status:400};
  if(!name)return {error:"basket_name_invalid",status:400};
  if(!categoryId)return {error:"basket_category_required",status:400};
  if(basePrice===null)return {error:"basket_price_invalid",status:400};
  const q=await db.rpc("save_basket_commercial_model_v2",{
    p_basket_id:basketId,p_name:name,p_category_id:categoryId,p_base_price:basePrice,p_image_url:imageUrl||null,
    p_positions:positions,p_operator:operator(input)
  });
  if(q.error)return rpcError(q.error);return {model:q.data};
}'''
if s.count(old)!=1: raise SystemExit(f'edge model block match={s.count(old)}')
s=s.replace(old,new,1)
# Extend domain error recognition so UI gets clean 400 codes.
s=s.replace('"basket_positions_invalid","position_product_invalid"','"basket_positions_invalid","basket_name_invalid","basket_category_required","basket_price_invalid","basket_image_invalid","position_product_invalid"',1)
p.write_text(s,encoding='utf-8')

# Guided UI
p=Path('vitrine/admin/basket-guided-builder.js')
s=p.read_text(encoding='utf-8')
old="async function loadModel(){const r=await call('model_editor',{basket_id:state.basketId});state.model=r.editor||r.model||{};const data=state.model;state.positions=(data.positions||[]).map(normalizePosition);state.preview=null;return data}"
new="async function loadModel(){const r=await call('model_editor',{basket_id:state.basketId});state.model=r.editor||r.model||{};state.categories=Array.isArray(r.categories)?r.categories:[];const data=state.model;state.positions=(data.positions||[]).map(normalizePosition);state.preview=null;return data}"
if s.count(old)!=1: raise SystemExit(f'loadModel match={s.count(old)}')
s=s.replace(old,new,1)

anchor='  function syncForm(){'
idx=s.find(anchor)
if idx<0: raise SystemExit('syncForm anchor missing')
helper='''  function syncCommercialForm(){
    if(!state?.model?.basket)return;
    const basket=state.model.basket;
    const name=document.getElementById('bgCommercialName');
    const category=document.getElementById('bgCommercialCategory');
    const price=document.getElementById('bgCommercialPrice');
    const image=document.getElementById('bgCommercialImage');
    if(name)basket.name=name.value.trim();
    if(category)basket.category_id=category.value;
    if(price){const n=Number(String(price.value||'').replace(',','.'));if(Number.isFinite(n)&&n>=0)basket.base_price=n}
    if(image)basket.image_url=image.value.trim();
  }

'''
s=s[:idx]+helper+s[idx:]
old_sync="function syncForm(){if(!state)return;document.querySelectorAll('#basketGuidedDialog [data-bg-index]')"
new_sync="function syncForm(){if(!state)return;syncCommercialForm();document.querySelectorAll('#basketGuidedDialog [data-bg-index]')"
if s.count(old_sync)!=1: raise SystemExit(f'syncForm start match={s.count(old_sync)}')
s=s.replace(old_sync,new_sync,1)

old_render="""function render(){if(!state)return;const d=ensureShell(),m=state.model||{},basket=m.basket||{};d.querySelector('#bgTitle').textContent=(basket.name||'Cesta/Kit')+' · montagem guiada';const body=d.querySelector('#bgBody');body.innerHTML='<section class="bg-section"><h3>Dados comerciais</h3><p>O modelo define o que a Cesta/Kit é. Salvar estes dados e os itens não reserva estoque.</p><div class="bg-commercial"><div class="bg-stat"><small>Nome</small><strong>'+esc(basket.name||'—')+'</strong></div><div class="bg-stat"><small>Preço final</small><strong>'+money(basket.base_price)+'</strong></div><div class="bg-stat"><small>Status</small><strong>'+(basket.is_active===false?'Inativo':'Ativo')+'</strong></div></div></section>'+lotOpsHtml()+"""
new_render="""function render(){if(!state)return;const d=ensureShell(),m=state.model||{},basket=m.basket||{};d.querySelector('#bgTitle').textContent=(basket.name||'Cesta/Kit')+' · montagem guiada';const categories=state.categories||[];const body=d.querySelector('#bgBody');body.innerHTML='<section class="bg-section"><h3>Dados comerciais</h3><p>O modelo define o que a Cesta/Kit é. Salvar estes dados e os itens não reserva estoque.</p><div class="bg-commercial"><label><span>Nome</span><input id="bgCommercialName" maxlength="180" value="'+esc(basket.name||'')+'"></label><label><span>Categoria</span><select id="bgCommercialCategory">'+categories.map(c=>'<option value="'+esc(c.id)+'" '+(String(c.id)===String(basket.category_id)?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label><label><span>Preço final</span><input id="bgCommercialPrice" type="number" min="0" step="0.01" value="'+esc(Number(basket.base_price||0).toFixed(2))+'"></label><label style="grid-column:1/-1"><span>Imagem</span><input id="bgCommercialImage" maxlength="1000" placeholder="URL da imagem" value="'+esc(basket.image_url||'')+'"></label></div><div class="bg-legacy-note">Status: '+(basket.is_active===false?'Inativo':'Ativo')+'. Alterar o modelo não reserva estoque.</div></section>'+lotOpsHtml()+"""
if s.count(old_render)!=1: raise SystemExit(f'render prefix match={s.count(old_render)}')
s=s.replace(old_render,new_render,1)

old_save="""try{await call('model_save',{basket_id:state.basketId,positions,operator:operator()});await loadModel();toast('Modelo salvo. Nenhum estoque foi reservado.');render();return true}catch(e){toast(e.data?.message||e.message||'Não consegui salvar o modelo.');return false}"""
new_save="""try{syncCommercialForm();const basket=state.model?.basket||{};await call('model_save',{basket_id:state.basketId,commercial:{name:basket.name||'',category_id:basket.category_id||'',base_price:Number(basket.base_price||0),image_url:basket.image_url||''},positions,operator:operator()});await loadModel();toast('Modelo salvo. Nenhum estoque foi reservado.');render();return true}catch(e){toast(e.data?.message||e.message||'Não consegui salvar o modelo.');return false}"""
if s.count(old_save)!=1: raise SystemExit(f'save block match={s.count(old_save)}')
s=s.replace(old_save,new_save,1)

old_state="state={basketId:String(basketId),mode:options.mode||'model',commercial:options.commercial||null,model:null,positions:[],lotQuantity:1,preview:null,lot:options.lot||null,duplicateLot:options.duplicateLot||null}"
new_state="state={basketId:String(basketId),mode:options.mode||'model',commercial:options.commercial||null,model:null,categories:[],positions:[],lotQuantity:1,preview:null,lot:options.lot||null,duplicateLot:options.duplicateLot||null}"
if s.count(old_state)!=1: raise SystemExit(f'state match={s.count(old_state)}')
s=s.replace(old_state,new_state,1)

p.write_text(s,encoding='utf-8')
print('commercial edit v2 patch applied')
