import assert from 'node:assert/strict';

const url='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/storefront-v2';
const apikey='sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8';
async function call(action,payload={}){
  const response=await fetch(url,{method:'POST',headers:{apikey,'Content-Type':'application/json',Origin:'https://donaantonia.com.br'},body:JSON.stringify({action,...payload})});
  const data=await response.json();
  assert.equal(response.ok,true,`${action} HTTP ${response.status}: ${JSON.stringify(data)}`);
  assert.equal(data.ok,true,`${action} falhou: ${JSON.stringify(data)}`);
  return data;
}

const health=await call('health');
assert.ok(Number(health.version)>=2);
const baskets=await call('list_baskets');
assert.ok(Array.isArray(baskets.baskets)&&baskets.baskets.length>0,'sem cestas ativas');
const ready=baskets.baskets.find(b=>b.ready);
assert.ok(ready,'nenhuma cesta pronta para venda');
const basket=await call('get_basket',{id:ready.id});
assert.ok(Array.isArray(basket.items)&&basket.items.length>0,'cesta sem itens');
const sections=await call('list_sections');
assert.ok(Array.isArray(sections.sections)&&sections.sections.length>0,'sem seções');
const products=await call('list_products',{section:sections.sections[0].name,page:1,limit:8});
assert.ok(Array.isArray(products.products),'lista de produtos inválida');
console.log(JSON.stringify({health:health.version,baskets:baskets.baskets.length,ready_basket:ready.name,basket_items:basket.items.length,sections:sections.sections.length,products_sample:products.products.length}));
