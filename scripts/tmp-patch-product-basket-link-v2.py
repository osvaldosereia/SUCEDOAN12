from pathlib import Path

p=Path('supabase/functions/admin-products-live-v1/index.ts')
s=p.read_text(encoding='utf-8')
old='db.from("basket_kit_templates").select("id,name,kind,is_active").in("id",kitIds)'
new='db.from("basket_kit_templates").select("id,name,kind,is_active,basket_id").in("id",kitIds)'
if s.count(old)!=1: raise SystemExit(f'kit select match={s.count(old)}')
s=s.replace(old,new,1)
old='o.linked_kits.push({id:k.id,name:k.name||"Kit",kind:k.kind||null,active:k.is_active!==false})'
new='o.linked_kits.push({id:k.id,basket_id:k.basket_id||null,name:k.name||"Kit",kind:k.kind||null,active:k.is_active!==false})'
if s.count(old)!=1: raise SystemExit(f'linked kit push match={s.count(old)}')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

p=Path('vitrine/admin/index.html')
s=p.read_text(encoding='utf-8')
old="return '<details class=\"product-kit-menu '+(compact?'mobile-product-kit-count':'')+'\"><summary>'+esc(kits.length)+' '+(kits.length===1?'kit':'kits')+'</summary><div class=\"product-kit-popover\">'+kits.map(k=>'<button type=\"button\" class=\"product-kit-link\" data-open-product-kit=\"'+esc(k.id)+'\">'+esc(k.name||'Kit')+'</button>').join('')+'</div></details>';"
new="return '<details class=\"product-kit-menu '+(compact?'mobile-product-kit-count':'')+'\"><summary>'+esc(kits.length)+' '+(kits.length===1?'cesta/kit':'cestas/kits')+'</summary><div class=\"product-kit-popover\">'+kits.map(k=>k.basket_id?'<button type=\"button\" class=\"product-kit-link\" data-open-product-basket=\"'+esc(k.basket_id)+'\">'+esc(k.name||'Cesta/Kit')+'</button>':'<span class=\"product-kit-link\" aria-disabled=\"true\">'+esc(k.name||'Cesta/Kit')+'</span>').join('')+'</div></details>';"
if s.count(old)!=1: raise SystemExit(f'productKitLinks match={s.count(old)}')
s=s.replace(old,new,1)
old="host.querySelectorAll('[data-open-product-kit]').forEach(el=>el.onclick=ev=>{ev.preventDefault();ev.stopPropagation();openBasketKitAdmin(el.dataset.openProductKit)});"
new="host.querySelectorAll('[data-open-product-basket]').forEach(el=>el.onclick=ev=>{ev.preventDefault();ev.stopPropagation();const basketId=el.dataset.openProductBasket;if(window.DonaAntoniaBasketGuided?.open&&basketId)window.DonaAntoniaBasketGuided.open(basketId,{mode:'model'});else toast('O editor de Cestas/Kits não carregou. Atualize a página e tente novamente.')});"
if s.count(old)!=1: raise SystemExit(f'product basket binding match={s.count(old)}')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('product -> canonical basket link patch applied')
