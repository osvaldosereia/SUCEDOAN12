from pathlib import Path
import re

ADMIN = Path('vitrine/admin/index.html')
EDGE = Path('supabase/functions/admin-products-live-v1/index.ts')

admin = ADMIN.read_text(encoding='utf-8')
edge = EDGE.read_text(encoding='utf-8')

# 1) Remove only the old automatic-suggestion list/settings/generator UI.
pattern = re.compile(
    r"\n  function basketAutoStatusLabel\(v\)\{.*?\n  async function openBasketSubstitutionCatalog\(\)\{",
    re.S,
)
admin, n = pattern.subn("\n  async function openBasketSubstitutionCatalog(){", admin, count=1)
assert n == 1, f'old automatic suggestions block not found: {n}'

# 2) Product-suggestion catalog becomes the direct and only entry point.
admin = admin.replace("$('#editorTitle').textContent='Produtos substituíveis';", "$('#editorTitle').textContent='Sugestões de produtos';")
admin = admin.replace(
    "$('#editorActions').innerHTML='<button class=\"secondary\" id=\"basketFamilyBack\" type=\"button\">Voltar</button>';\n    $('#basketFamilyBack').onclick=()=>openBasketAutoSuggestions(state.basketAutoStatus||'pending');",
    "$('#editorActions').innerHTML='<button class=\"secondary\" id=\"basketFamilyClose\" type=\"button\">Fechar</button>';\n    $('#basketFamilyClose').onclick=()=>$('#editor').close();"
)
admin = admin.replace(
    "<div class=\"rule-notice\"><strong>Lista explícita</strong><div>A automação só troca produtos que estiverem autorizados dentro da mesma família. Preço, embalagem e estoque continuam sendo conferidos.</div></div>",
    "<div class=\"rule-notice\"><strong>Regra simples por família</strong><div>Produtos da mesma família aparecem como sugestões de troca entre si. A família define as opções; estoque e preço são exibidos para você decidir.</div></div>"
)
admin = admin.replace("<label><span>Automação</span><select id=\"basketFamilyEnabled\">", "<label><span>Status da família</span><select id=\"basketFamilyEnabled\">")
admin = admin.replace(
    "Somente estes produtos poderão substituir uns aos outros nesta família. Ao adicionar um produto que esteja em outra família, ele será movido para esta.",
    "Todos estes produtos aparecem como sugestões de troca entre si. Ao adicionar um produto que esteja em outra família, ele será movido para esta."
)

old_header = "<button class=\"secondary\" id=\"basketCategoriesManage\" type=\"button\">Categorias de cestas</button><button class=\"secondary\" id=\"basketAutoSuggestions\" type=\"button\">Sugestões automáticas</button><button class=\"secondary\" id=\"refreshBaskets\" type=\"button\">Atualizar</button>"
new_header = "<button class=\"secondary\" id=\"basketCategoriesManage\" type=\"button\">Categorias de cestas</button><button class=\"secondary\" id=\"basketProductSuggestions\" type=\"button\">Sugestões de produtos</button><button class=\"secondary\" id=\"refreshBaskets\" type=\"button\">Atualizar</button>"
assert old_header in admin, 'basket header old button not found'
admin = admin.replace(old_header, new_header, 1)
old_handler = "$('#basketAutoSuggestions').onclick=()=>openBasketAutoSuggestions('pending');"
assert old_handler in admin, 'old basket auto handler not found'
admin = admin.replace(old_handler, "$('#basketProductSuggestions').onclick=openBasketSubstitutionCatalog;", 1)

# 3) Make the lot product picker language match the family rule.
admin = admin.replace("<h3>Alternativas cadastradas</h3>", "<h3>Sugestões da família</h3>")
admin = admin.replace(
    "Nenhuma alternativa compatível com saldo. Você pode buscar outro produto abaixo.",
    "Nenhum outro produto cadastrado nesta família. Você pode buscar outro produto abaixo."
)

# Show price and make zero-stock suggestions visible but not selectable.
old_card = """    return '<article class=\"basket-product-picker-card '+(stock<=0?'zero-stock':'')+'\">'+
      '<div class=\"basket-product-picker-photo\"><img loading=\"lazy\" src=\"'+esc(photo)+'\" alt=\"\" onerror=\"this.onerror=null;this.src=\\'/img/sem-foto.svg\\'\"></div>'+
      '<div class=\"basket-product-picker-name\">'+esc(p?.name||'Produto')+'</div>'+
      '<div class=\"basket-product-picker-code\"><strong>Código: '+esc(code)+'</strong>'+(ean?'<br>EAN: '+esc(ean):'')+'</div>'+
      '<div class=\"basket-product-picker-stock\"><span>Estoque solto</span><strong>'+esc(fmtQty(stock))+'</strong></div>'+
      '<button class=\"secondary basket-product-picker-action\" type=\"button\" '+attr+'=\"'+esc(p.id)+'\">'+esc(label)+'</button>'+
    '</article>';"""
new_card = """    const price=Number(p?.price??p?.sale_price_cents/100??0),zero=stock<=0;
    return '<article class=\"basket-product-picker-card '+(zero?'zero-stock':'')+'\">'+
      '<div class=\"basket-product-picker-photo\"><img loading=\"lazy\" src=\"'+esc(photo)+'\" alt=\"\" onerror=\"this.onerror=null;this.src=\\'/img/sem-foto.svg\\'\"></div>'+
      '<div class=\"basket-product-picker-name\">'+esc(p?.name||'Produto')+'</div>'+
      '<div class=\"basket-product-picker-code\"><strong>Código: '+esc(code)+'</strong>'+(ean?'<br>EAN: '+esc(ean):'')+'<br>Preço: '+esc(price.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))+'</div>'+
      '<div class=\"basket-product-picker-stock\"><span>Estoque solto</span><strong>'+esc(fmtQty(stock))+'</strong></div>'+
      '<button class=\"secondary basket-product-picker-action\" type=\"button\" '+(zero?'disabled ':'' )+attr+'=\"'+esc(p.id)+'\">'+esc(zero?'Sem estoque':label)+'</button>'+
    '</article>';"""
assert old_card in admin, 'basket product picker card block not found'
admin = admin.replace(old_card, new_card, 1)

# Authorized-family list also displays the current price alongside loose stock.
old_authorized = "<small>'+esc(p.sku||p.gtin||'')+' · '+esc(p.packaging||'')+' · '+esc(fmtQty(p.loose_stock||0))+' solto</small>"
new_authorized = "<small>'+esc(p.sku||p.gtin||'')+' · '+esc(p.packaging||'')+' · '+esc(fmtQty(p.loose_stock||0))+' solto · '+esc(Number(p.price||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))+'</small>"
assert old_authorized in admin, 'authorized family product details not found'
admin = admin.replace(old_authorized, new_authorized, 1)

# 4) Backend: every other active product explicitly registered in the same enabled family is returned.
api_pattern = re.compile(
    r"async function basketKitProductSuggestions\(u:URL\)\{.*?\nfunction nextBasketKitShortCodeFromLots",
    re.S,
)
new_api = r'''async function basketKitProductSuggestions(u:URL){
  const pid=id(u.searchParams.get("product_id"));if(!pid)return {error:"invalid_product",status:400};
  const quantity=Number(u.searchParams.get("quantity_per_kit")||1);
  if(!Number.isInteger(quantity)||quantity<1||quantity>100)return {error:"invalid_quantity",status:400};
  const membership=await db.from("basket_lot_substitution_products").select("family_key").eq("product_id",pid).maybeSingle();
  if(membership.error)throw membership.error;
  const family=membership.data?.family_key;if(!family)return {family_key:null,suggestions:[]};
  const [rule,members]=await Promise.all([
    db.from("basket_lot_substitution_rules").select("enabled,label").eq("family_key",family).maybeSingle(),
    db.from("basket_lot_substitution_products").select("product_id").eq("family_key",family).order("product_id")
  ]);
  if(rule.error)throw rule.error;if(members.error)throw members.error;
  if(rule.data?.enabled!==true)return {family_key:family,family_label:rule.data?.label||family,suggestions:[]};
  const ids=(members.data||[]).map((m:any)=>String(m.product_id)),products:any[]=[];
  for(let i=0;i<ids.length;i+=60){
    const q=await db.from("products").select("id,name,sku,gtin,image_url,price,packaging,unit,brand").eq("is_active",true).in("id",ids.slice(i,i+60));
    if(q.error)throw q.error;products.push(...(q.data||[]));
  }
  const base=products.find(p=>String(p.id)===pid);if(!base)return {family_key:family,family_label:rule.data?.label||family,suggestions:[]};
  const loose=await basketLooseStockMap(products.map(p=>p.id));
  const basePrice=Number(base.price||0);
  const suggestions=products.filter(p=>String(p.id)!==pid).map((cand:any)=>{
    const available=Number(loose.get(String(cand.id))?.loose_sellable_stock||0),candidatePrice=Number(cand.price||0);
    return {...cand,loose_stock:available,price_cents:Math.round(candidatePrice*100),capacity:quantity>0?Math.floor(available/quantity):0,price_delta_pct:basePrice>0?Math.abs(candidatePrice-basePrice)/basePrice*100:null};
  });
  suggestions.sort((a:any,b:any)=>{
    const aa=Number(a.loose_stock||0)>0?1:0,bb=Number(b.loose_stock||0)>0?1:0;
    const ad=Number.isFinite(Number(a.price_delta_pct))?Number(a.price_delta_pct):Number.POSITIVE_INFINITY;
    const bd=Number.isFinite(Number(b.price_delta_pct))?Number(b.price_delta_pct):Number.POSITIVE_INFINITY;
    return bb-aa||Number(b.loose_stock||0)-Number(a.loose_stock||0)||ad-bd||String(a.name).localeCompare(String(b.name),"pt-BR");
  });
  return {family_key:family,family_label:rule.data?.label||family,suggestions};
}
function nextBasketKitShortCodeFromLots'''
edge, n = api_pattern.subn(new_api, edge, count=1)
assert n == 1, f'basketKitProductSuggestions block not found: {n}'

# Guardrails: old automatic generator must no longer be exposed by the admin.
for forbidden in [
    'Sugestões automáticas de lotes',
    'Gerar sugestões agora',
    'Automação segura',
    "basket_lot_suggestion_generate_now_v1",
    "basket_lot_suggestions_admin_v1",
]:
    assert forbidden not in admin, f'legacy automatic suggestion UI remains: {forbidden}'

ADMIN.write_text(admin, encoding='utf-8')
EDGE.write_text(edge, encoding='utf-8')
print('BASKET_PRODUCT_SUGGESTIONS_FAMILY_ONLY_PATCH_OK')
