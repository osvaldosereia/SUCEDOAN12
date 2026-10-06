from pathlib import Path
p=Path('scripts/apply-basket-mold-storefront-r5.py')
s=p.read_text(encoding='utf-8')

# Align guarded transformer with the current storefront source. These edits only
# change transformer anchors; production files remain fail-closed until all
# expected current-source fragments match exactly.
s=s.replace("const name=basketName(b.name),region='basket-products-'+b.id;","const name=basketName(b.name),category=String(b.category_name||'').trim(),region='basket-products-'+b.id;")
s=s.replace("const name=basketName(b.name),key=String(b.card_key||b.id),region='basket-products-'+key.replace(/[^a-zA-Z0-9_-]/g,'-');/* R5_MOLD_CARD_KEY_V1 */","const name=basketName(b.name),category=String(b.category_name||'').trim(),key=String(b.card_key||b.id),region='basket-products-'+key.replace(/[^a-zA-Z0-9_-]/g,'-');/* R5_MOLD_CARD_KEY_V1 */")
s=s.replace("if(!id){adjustedItems.push({kind,id:\"\",name:\"Item\",action:\"removed\",requested,available:0,reason:\"id_invalido\"});continue;}\\n    if(kind===\"product\"){","if(!id){adjustedItems.push({kind,id:\"\",name:kind===\"basket\"?\"Cesta\":\"Produto\",action:\"removed\",requested,available:0,reason:\"item_invalido\"});continue}\\n    if(kind===\"product\"){")
s=s.replace("if(!id){adjustedItems.push({kind,id:\"\",name:\"Item\",action:\"removed\",requested,available:0,reason:\"id_invalido\"});continue;}\\n    if(kind===\"basket_mold\"){adjusted.push({...raw,type:\"basket_mold\",id,qty:requested});continue;}\\n    if(kind===\"product\"){","if(!id){adjustedItems.push({kind,id:\"\",name:kind===\"basket\"?\"Cesta\":\"Produto\",action:\"removed\",requested,available:0,reason:\"item_invalido\"});continue}\\n    if(kind===\"basket_mold\"){adjusted.push({...raw,type:\"basket_mold\",id,qty:requested});continue;}\\n    if(kind===\"product\"){")

old_quote = '''    quote_anchor = 'if(req.method===\"POST\"&&action===\"basket_quote\"){const p=await req.json();const r=await quote(p);return json(req,r,r?.status||200,{\"Cache-Control\":\"no-store\"})}'\n    s = replace_once(s, quote_anchor, quote_anchor+'\\n    if(req.method===\"POST\"&&action===\"basket_mold_quote\"){const p=await req.json();const r=await moldQuote(p);return json(req,r,r?.status||200,{\"Cache-Control\":\"no-store\"})}', 'mold_quote_route')'''
new_quote = '''    quote_anchor = 'if(req.method===\"POST\"&&action===\"basket_quote\"){const r=await quote(body);return r.error?json(req,{ok:false,...r},r.status||400,{\"Cache-Control\":\"no-store\"}):json(req,r,200,{\"Cache-Control\":\"no-store\"})}'\n    mold_quote_route = 'if(req.method===\"POST\"&&action===\"basket_mold_quote\"){const r=await moldQuote(body);return r.error?json(req,{ok:false,...r},r.status||400,{\"Cache-Control\":\"no-store\"}):json(req,r,200,{\"Cache-Control\":\"no-store\"})}'\n    s = replace_once(s, quote_anchor, quote_anchor+'\\n    '+mold_quote_route, 'mold_quote_route')'''
if old_quote not in s:
    raise SystemExit('transformer_quote_definition_missing')
s=s.replace(old_quote,new_quote,1)

p.write_text(s,encoding='utf-8')
print('R5 transformer anchors aligned')
