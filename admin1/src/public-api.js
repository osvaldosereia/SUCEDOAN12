const PROJECT_URL='https://ssbesxgaijknwsjbsbcz.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8';
const READ_ACTIONS=new Set(['products','product']);

export function normalizePublicProduct(p={}){return {id:String(p.id||''),name:String(p.name||''),sku:String(p.sku||''),gtin:String(p.gtin||''),brand:String(p.brand||''),packaging:String(p.packaging||''),image_url:String(p.image_url||''),category:String(p.category||p.subcategory||''),sale_price_cents:Math.max(0,Number(p.price_cents||0)),stock_quantity:Math.max(0,Number(p.stock_quantity||0)),active:p.is_active===true,description:String(p.description||''),characteristics:Array.isArray(p.characteristics)?p.characteristics.filter(x=>x&&typeof x==='object').map(x=>({label:String(x.label||''),value:String(x.value||'')})):[]}}
export function normalizePublicBasket(){return null}
export async function requestPreview(action,params={},fetchImpl=fetch){
 if(!READ_ACTIONS.has(action))throw new Error('Ação não permitida: somente leitura');
 const query=new URLSearchParams();
 for(const key of ['limit','offset','q','category','subcategory','product_id'])if(params[key]!==undefined&&params[key]!==null&&String(params[key]).trim()!=='')query.set(key,String(params[key]));
 query.set('action',action);
 const response=await fetchImpl(`${PROJECT_URL}/functions/v1/storefront-v2?${query}`,{method:'GET',headers:{apikey:PUBLISHABLE_KEY,Accept:'application/json'},cache:'no-store'});
 if(!response.ok)throw new Error('Falha ao consultar catálogo ('+response.status+')');
 const result=await response.json();if(result?.ok!==true)throw new Error(result?.error||'Falha ao consultar catálogo');
 return result;
}

const ADMIN_READ_ACTIONS=new Set(['products','product','matches','categories']);
export function normalizeAdminProduct(p={}) {
 const price=Number(p.price||0);
 return {
  id:String(p.id||''),name:String(p.name||''),sku:String(p.sku||''),gtin:String(p.gtin||''),
  ncm:String(p.ncm||''),brand:String(p.brand||''),packaging:String(p.packaging||''),
  image_url:String(p.image_url||''),category:String(p.category||''),subcategory:String(p.subcategory||''),
  unit:String(p.unit||''),sale_price_cents:Math.max(0,Math.round((Number.isFinite(price)?price:0)*100)),
  stock_quantity:Math.max(0,Number(p.stock||0)),active:p.is_active===true,
  description:String(p.description_long||p.description_short||''),tags:Array.isArray(p.tags)?p.tags.map(String):[],
  min_stock:Math.max(0,Number(p.min_stock||0))
 };
}
export async function requestAdminCatalog(action,params={},fetchImpl=fetch) {
 if(!ADMIN_READ_ACTIONS.has(action))throw new Error('Somente leitura: ação de gravação bloqueada.');
 const query=new URLSearchParams();
 query.set('action',action);
 for(const key of ['limit','offset','q','category','status','stock','product_id']) {
  const value=params[key];
  if(value!==undefined&&value!==null&&String(value).trim()!=='')query.set(key,String(value));
 }
 for(const key of ['gtin','sku']) for(const value of params[key]||[]) {
  if(String(value||'').trim())query.append(key,String(value).trim());
 }
 const response=await fetchImpl(`${PROJECT_URL}/functions/v1/admin1-products-read-v1?${query}`,{method:'GET',headers:{apikey:PUBLISHABLE_KEY,Accept:'application/json'},cache:'no-store'});
 if(!response.ok)throw new Error('Falha ao consultar produtos ('+response.status+')');
 const result=await response.json();
 if(result?.ok!==true)throw new Error(result?.error||'Falha ao consultar catálogo');
 return result;
}

