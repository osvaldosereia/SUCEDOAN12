from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old,new,1)

admin_path=Path('vitrine/admin/index.html')
admin=admin_path.read_text()
helper="""  function basketBusinessTypeForCategory(categoryId){
    const c=(state.basketCategories||[]).find(x=>String(x.id)===String(categoryId||''));
    const bySlug={
      'cestas-completas':'basic_complete',
      'cestas-so-alimento':'basic_food',
      'kits-limpeza-e-higiene':'cleaning_hygiene',
      'kits-limpeza':'cleaning',
      'kits-higiene':'hygiene'
    };
    return bySlug[String(c?.slug||'')]||'';
  }
"""
admin=replace_once(admin,'  function startBasketKitLotDraft(sourceLotId=null){',helper+'  function startBasketKitLotDraft(sourceLotId=null){','business type helper')
admin=replace_once(admin,
"      business_type:String(source?.business_type||(d.kit.kind==='food'?'basic_food':'cleaning_hygiene')),",
"      business_type:String(source?.business_type||basketBusinessTypeForCategory(d.kit?.basket?.category_id)||(d.kit.kind==='food'?'basic_food':'cleaning_hygiene')),",
'business type default')
admin_path.write_text(admin)

for p in [Path('index.html'),Path('vitrine/index.html')]:
    s=p.read_text()
    s=replace_once(s,
"    function basketGroupTitle(group){return group==='food'?'Alimentos':group==='hygiene'?'Limpeza e higiene':'Itens da cesta'}",
"    function basketGroupTitle(group,basket){const slug=String(basket?.category_slug||'');if(group==='food')return slug.startsWith('kits-')?'Itens do kit':'Alimentos';return group==='hygiene'?'Limpeza e higiene':'Itens da cesta'}",
'public group title')
    s=replace_once(s,"basketGroupTitle(group)+'</","basketGroupTitle(group,b)+'</",'public group title call')
    p.write_text(s)

if Path('index.html').read_text()!=Path('vitrine/index.html').read_text():
    raise SystemExit('public storefronts diverged')
