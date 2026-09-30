from pathlib import Path
import re

ADMIN=Path('vitrine/admin/index.html')
IMAGE=Path('supabase/functions/product-image-openai-v1/index.ts')

def one(text,old,new,label):
    n=text.count(old)
    if n!=1: raise RuntimeError(f'{label}: expected 1 occurrence, found {n}')
    return text.replace(old,new,1)

def rx(text,pattern,repl,label):
    out,n=re.subn(pattern,repl,text,count=1,flags=re.S)
    if n!=1: raise RuntimeError(f'{label}: expected 1 match, found {n}')
    return out

image=IMAGE.read_text(encoding='utf-8')
image=one(image,
    'select("id,name,brand,packaging,gtin,price,cost,category,sales_category,storefront_category,image_url,image_original_url,image_ai_url,image_ai_status,image_ai_attempts")',
    'select("id,name,brand,packaging,gtin,price,cost,category,sales_category,storefront_category,image_url,image_original_url,image_ai_url,image_ai_status,image_ai_attempts,metadata")',
    'keep product metadata')
image=one(image,
    'metadata:{visual_identity:{confidence,notes:clean(parsed?.notes,240),model:VALIDATOR_MODEL,identified_at:new Date().toISOString()}}',
    'metadata:{...obj(product.metadata),visual_identity:{confidence,notes:clean(parsed?.notes,240),model:VALIDATOR_MODEL,identified_at:new Date().toISOString()}}',
    'merge visual metadata')
IMAGE.write_text(image,encoding='utf-8')

admin=ADMIN.read_text(encoding='utf-8')
admin=one(admin,
'''  function setBalanceMode(mode){
    state.balanceMode=mode==='incident'?'incident':'count';''',
'''  function setBalanceMode(mode){
    stopBalanceCamera();
    state.balanceMode=mode==='incident'?'incident':'count';''',
'stop camera on mode change')

admin=rx(admin,
r'''  function selectBalanceProduct\(p,metaInfo=\{\}\)\{.*?\n  \}\n  async function uploadBalanceProductPhoto''',
r'''  function selectBalanceProduct(p,metaInfo={}){
    const same=state.balanceProduct?.id===p?.id;
    const keepQty=same?state.balanceQty:'';
    const keepGondola=same?state.balanceGondola:'';
    const keepValidity=same?state.balanceValidity:'';
    const keepLot=same?state.balanceLotId:'';
    state.balanceProduct=p;
    state.balanceQty=keepQty;
    state.balanceGondola=keepGondola||String(p.gondola_number??p.gondola??'').replace(/\D+/g,'');
    state.balanceValidity=keepValidity||p.expiration_date||p.validity_date||'';
    state.balanceLotId=keepLot;
    state.balanceNeedsPhoto=metaInfo.photo_required===true;
    state.balanceReadiness=metaInfo.readiness||metaInfo.commercial_readiness||null;
    paintBalance();
  }
  async function uploadBalanceProductPhoto''',
'preserve balance draft on product refresh')
ADMIN.write_text(admin,encoding='utf-8')
print('balance camera fixups applied')
