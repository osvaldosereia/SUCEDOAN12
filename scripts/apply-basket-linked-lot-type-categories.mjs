import fs from 'node:fs';

function replaceOnce(source, search, replacement, label){
  const i=source.indexOf(search);
  if(i<0) throw new Error(`patch target not found: ${label}`);
  if(source.indexOf(search,i+1)>=0) throw new Error(`patch target duplicated: ${label}`);
  return source.slice(0,i)+replacement+source.slice(i+search.length);
}

const adminPath='vitrine/admin/index.html';
let admin=fs.readFileSync(adminPath,'utf8');

admin=replaceOnce(admin,
`    const linkableLots=(d.linkable_lots||d.hygiene_lots||[]).filter(x=>String(x.id)!==String(draft.draft_lot_id||draft.source_lot_id||''));
    const linkedLot=linkableLots.find(x=>String(x.id)===String(draft.linked_lot_id||''))||null;
    const financial=basketKitDraftFinancials(draft,linkableLots);`,
`    const linkableLots=(d.linkable_lots||d.hygiene_lots||[]).filter(x=>String(x.id)!==String(draft.draft_lot_id||draft.source_lot_id||''));
    const linkedLot=linkableLots.find(x=>String(x.id)===String(draft.linked_lot_id||''))||null;
    const lotBusinessTypes=[['basic_complete','Cestas Completas'],['basic_food','Cestas Só Alimento'],['cleaning_hygiene','Kits Limpeza e Higiene'],['cleaning','Kits Limpeza'],['hygiene','Kits Higiene']];
    if(!draft.linked_lot_type&&linkedLot?.business_type)draft.linked_lot_type=String(linkedLot.business_type);
    const linkedType=String(draft.linked_lot_type||'');
    const linkableLotsByType=linkedType?linkableLots.filter(x=>String(x.business_type||'')===linkedType):[];
    const financial=basketKitDraftFinancials(draft,linkableLots);`,
'linked lot type state');

admin=replaceOnce(admin,
`[['basic_complete','Cesta Básica Completa'],['basic_food','Cesta Básica Só os Alimentos'],['cleaning_hygiene','Kit Limpeza e Higiene'],['cleaning','Kit Limpeza'],['hygiene','Kit Higiene']].map(x=>'<option value="'+x[0]+'" '+(draft.business_type===x[0]?'selected':'')+'>'+x[1]+'</option>').join('')`,
`lotBusinessTypes.map(x=>'<option value="'+x[0]+'" '+(draft.business_type===x[0]?'selected':'')+'>'+x[1]+'</option>').join('')`,
'business type options');

admin=replaceOnce(admin,
`      '<div class="basket-composer-summary" style="margin-top:10px"><label><span>Vincular outro lote (opcional)</span><select id="kitLotLinkedLot"><option value="">Sem lote vinculado</option>'+linkableLots.map(h=>'<option value="'+esc(h.id)+'" '+(String(h.id)===String(draft.linked_lot_id||'')?'selected':'')+'>'+esc((h.public_name||h.short_code||h.lot_code||'Lote')+' · '+(h.short_code||h.lot_code||'—')+' · '+fmtQty(h.quantity_available||0)+' disponível(is)')+'</option>').join('')+'</select><small>Se escolhido, estoque e valores comerciais dos dois lotes permanecem vinculados.</small></label>'+`,
`      '<div class="basket-composer-summary" style="margin-top:10px"><label><span>Tipo do lote vinculado (opcional)</span><select id="kitLotLinkedType"><option value="">Sem lote vinculado</option>'+lotBusinessTypes.map(x=>'<option value="'+x[0]+'" '+(linkedType===x[0]?'selected':'')+'>'+x[1]+'</option>').join('')+'</select><small>Primeiro escolha o tipo. Depois selecione um lote disponível desse tipo.</small></label>'+\n        '<label><span>Escolher lote</span><select id="kitLotLinkedLot" '+(!linkedType?'disabled':'')+'><option value="">'+(linkedType?'Selecione um lote':'Escolha o tipo primeiro')+'</option>'+linkableLotsByType.map(h=>'<option value="'+esc(h.id)+'" '+(String(h.id)===String(draft.linked_lot_id||'')?'selected':'')+'>'+esc((h.public_name||h.short_code||h.lot_code||'Lote')+' · '+(h.short_code||h.lot_code||'—')+' · '+fmtQty(h.quantity_available||0)+' disponível(is)')+'</option>').join('')+'</select><small>'+esc(linkedType?(linkableLotsByType.length?linkableLotsByType.length+' lote(s) disponível(is) neste tipo.':'Nenhum lote disponível neste tipo.'):'Selecione o tipo para carregar os lotes disponíveis.')+'</small></label>'+`,
'linked lot selectors');

admin=replaceOnce(admin,
`      (linkedLot?'<div class="panel" style="margin-top:10px;padding:12px"><div class="kit-section-title" style="margin:0 0 8px"><div><h2 style="font-size:15px">Itens do lote vinculado</h2><p>'+esc((linkedLot.public_name||linkedLot.short_code||'Lote')+' · '+(linkedLot.short_code||linkedLot.lot_code||'—'))+'</p></div></div><div class="basket-lot-inline-strip">'+(linkedLot.items||[]).map(x=>{const raw=x.product||x||{},p=Array.isArray(raw)?(raw[0]||{}):raw;return '<div class="basket-lot-component-card"><div><strong>'+esc(p.name||'Produto')+'</strong><small>'+esc(fmtQty(x.quantity_per_kit||x.quantity_per_basket||0))+'× por kit</small><small>Custo un. '+money(cents(p.cost||0))+' · Venda un. '+money(cents(p.price||0))+'</small></div></div>'}).join('')+'</div></div>':'')+`,
`      (linkedLot?'<div class="panel" style="margin-top:10px;padding:12px"><div class="kit-section-title" style="margin:0 0 8px"><div><h2 style="font-size:15px">Itens do lote vinculado</h2><p>'+esc((linkedLot.public_name||linkedLot.short_code||'Lote')+' · '+(linkedLot.short_code||linkedLot.lot_code||'—'))+'</p></div></div><div class="kit-draft-list linked-lot-items">'+(linkedLot.items||[]).map(x=>{const raw=x.product||x||{},p=Array.isArray(raw)?(raw[0]||{}):raw;return '<div class="kit-draft-line kit-linked-line"><img class="kit-draft-photo" loading="lazy" src="'+esc(p.image_url||'/img/sem-foto.svg')+'" alt=""><div class="basket-choice"><strong>'+esc(p.name||'Produto')+'</strong><small>'+esc(p.sku||'')+(p.packaging?' · '+esc(p.packaging):'')+'</small><small>Custo un. '+money(cents(p.cost||0))+' · Venda un. '+money(cents(p.price||0))+'</small></div><div><span class="sub">Qtd. por kit</span><strong>'+esc(fmtQty(x.quantity_per_kit||x.quantity_per_basket||0))+'</strong></div><div class="basket-stock-box"><span class="sub">Estoque avulso</span><strong>'+esc(fmtQty(x.loose_stock||0))+'</strong><small>Produto do lote vinculado</small></div><div class="basket-row-actions"><span class="pill">Vinculado</span></div></div>'}).join('')+'</div></div>':'')+`,
'linked lot items layout');

admin=replaceOnce(admin,
`    if($('#kitLotBusinessType'))$('#kitLotBusinessType').onchange=e=>draft.business_type=e.currentTarget.value;
    if($('#kitLotPublicName'))$('#kitLotPublicName').oninput=e=>draft.public_name=e.currentTarget.value;`,
`    if($('#kitLotBusinessType'))$('#kitLotBusinessType').onchange=e=>draft.business_type=e.currentTarget.value;
    if($('#kitLotLinkedType'))$('#kitLotLinkedType').onchange=e=>{draft.linked_lot_type=e.currentTarget.value||'';draft.linked_lot_id=null;paintBasketKitLotComposer()};
    if($('#kitLotPublicName'))$('#kitLotPublicName').oninput=e=>draft.public_name=e.currentTarget.value;`,
'linked type change handler');

const categoryStart=admin.indexOf('  async function openBasketCategoriesAdmin(){');
const categoryEnd=admin.indexOf('  async function assignBasketCategory',categoryStart);
if(categoryStart<0||categoryEnd<0)throw new Error('patch target not found: categories admin function');
const newCategories=`  async function openBasketCategoriesAdmin(){
    const content=$('#content');content.innerHTML='<div class="loading">Carregando categorias…</div>';
    const fixed=[
      {slug:'cestas-completas',name:'Cestas Completas',type:'basic_complete'},
      {slug:'cestas-so-alimento',name:'Cestas Só Alimento',type:'basic_food'},
      {slug:'kits-limpeza-e-higiene',name:'Kits Limpeza e Higiene',type:'cleaning_hygiene'},
      {slug:'kits-limpeza',name:'Kits Limpeza',type:'cleaning'},
      {slug:'kits-higiene',name:'Kits Higiene',type:'hygiene'}
    ];
    try{
      const data=await api('basket_categories_admin');state.basketCategories=data.categories||[];
      const bySlug=new Map((state.basketCategories||[]).map(c=>[String(c.slug||''),c]));
      content.innerHTML='<div class="page-head"><div><button class="text" id="basketCategoriesBack" type="button">← Cestas</button><h1>Categorias de cestas</h1><p>Estas são as cinco categorias operacionais usadas para organizar cestas, kits e vínculos de lotes.</p></div></div>'+ 
        '<div class="panel" style="padding:12px"><div class="basket-category-admin-list">'+fixed.map(spec=>{const c=bySlug.get(spec.slug);return '<div class="basket-category-admin-row"><div><strong>'+esc(spec.name)+'</strong><small>'+esc(spec.type)+' · categoria fixa</small></div><span class="pill '+(c?'':'warn')+'">'+(c?esc(c.basket_count||0)+' cesta(s) vinculada(s)':'Configuração pendente')+'</span></div>'}).join('')+'</div><p class="sub" style="margin-top:10px">As categorias são fixas para evitar nomes duplicados ou classificações diferentes para o mesmo tipo de cesta/kit.</p></div>';
      $('#basketCategoriesBack').onclick=renderBaskets;
    }catch{content.innerHTML='<div class="empty">Não consegui carregar as categorias. <button class="text" id="basketCategoriesRetry">Tentar novamente</button></div>';$('#basketCategoriesRetry')?.addEventListener('click',openBasketCategoriesAdmin)}
  }
`;
admin=admin.slice(0,categoryStart)+newCategories+admin.slice(categoryEnd);

fs.writeFileSync(adminPath,admin);

const edgePath='supabase/functions/admin-products-live-v1/index.ts';
let edge=fs.readFileSync(edgePath,'utf8');
edge=replaceOnce(edge,
`    if(hi.error)throw hi.error;
    linkableLots=linkableLots.map((h:any)=>({...h,items:(hi.data||[]).filter((x:any)=>String(x.lot_id)===String(h.id)).map((x:any)=>({...x,quantity_per_kit:Number(x.quantity_per_basket||0)}))}));`,
`    if(hi.error)throw hi.error;
    const linkedStock=await basketLooseStockMap((hi.data||[]).map((x:any)=>x.product_id));
    linkableLots=linkableLots.map((h:any)=>({...h,items:(hi.data||[]).filter((x:any)=>String(x.lot_id)===String(h.id)).map((x:any)=>{const s:any=linkedStock.get(String(x.product_id))||{};return {...x,quantity_per_kit:Number(x.quantity_per_basket||0),loose_stock:Number(s.loose_sellable_stock||0)}})}));`,
'linked lot stock');
fs.writeFileSync(edgePath,edge);

console.log('applied basket linked lot type + fixed categories patch');
