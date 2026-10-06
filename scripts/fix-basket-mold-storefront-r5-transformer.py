from pathlib import Path
p=Path('scripts/apply-basket-mold-storefront-r5.py')
s=p.read_text(encoding='utf-8')
s=s.replace("const name=basketName(b.name),region='basket-products-'+b.id;","const name=basketName(b.name),category=String(b.category_name||'').trim(),region='basket-products-'+b.id;")
s=s.replace("const name=basketName(b.name),key=String(b.card_key||b.id),region='basket-products-'+key.replace(/[^a-zA-Z0-9_-]/g,'-');/* R5_MOLD_CARD_KEY_V1 */","const name=basketName(b.name),category=String(b.category_name||'').trim(),key=String(b.card_key||b.id),region='basket-products-'+key.replace(/[^a-zA-Z0-9_-]/g,'-');/* R5_MOLD_CARD_KEY_V1 */")
s=s.replace("if(!id){adjustedItems.push({kind,id:\"\",name:\"Item\",action:\"removed\",requested,available:0,reason:\"id_invalido\"});continue;}\\n    if(kind===\"product\"){","if(!id){adjustedItems.push({kind,id:\"\",name:kind===\"basket\"?\"Cesta\":\"Produto\",action:\"removed\",requested,available:0,reason:\"item_invalido\"});continue}\\n    if(kind===\"product\"){")
s=s.replace("if(!id){adjustedItems.push({kind,id:\"\",name:\"Item\",action:\"removed\",requested,available:0,reason:\"id_invalido\"});continue;}\\n    if(kind===\"basket_mold\"){adjusted.push({...raw,type:\"basket_mold\",id,qty:requested});continue;}\\n    if(kind===\"product\"){","if(!id){adjustedItems.push({kind,id:\"\",name:kind===\"basket\"?\"Cesta\":\"Produto\",action:\"removed\",requested,available:0,reason:\"item_invalido\"});continue}\\n    if(kind===\"basket_mold\"){adjusted.push({...raw,type:\"basket_mold\",id,qty:requested});continue;}\\n    if(kind===\"product\"){")
p.write_text(s,encoding='utf-8')
print('R5 transformer anchors aligned')
