const PROJECT_URL='https://ssbesxgaijknwsjbsbcz.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8';
const READ_ACTIONS=new Set(['products']);

export function normalizePublicProduct(p={}){return {id:String(p.id||''),name:String(p.name||''),sku:String(p.sku||''),gtin:String(p.gtin||''),brand:String(p.brand||''),packaging:String(p.packaging||''),image_url:String(p.image_url||''),category:String(p.category||p.subcategory||''),sale_price_cents:Math.max(0,Number(p.price_cents||0)),stock_quantity:Math.max(0,Number(p.stock_quantity||0)),active:p.is_active===true}}
export function normalizePublicBasket(){return null}
export async function requestPreview(action,params={},fetchImpl=fetch){
 if(!READ_ACTIONS.has(action))throw new Error('Ação não permitida: somente leitura');
 const query=new URLSearchParams();
 for(const key of ['limit','offset','q','category','subcategory'])if(params[key]!==undefined&&params[key]!==null&&String(params[key]).trim()!=='')query.set(key,String(params[key]));
 query.set('action',action);
 const response=await fetchImpl(`${PROJECT_URL}/functions/v1/storefront-v2?${query}`,{method:'GET',headers:{apikey:PUBLISHABLE_KEY,Accept:'application/json'},cache:'no-store'});
 if(!response.ok)throw new Error('Falha ao consultar catálogo ('+response.status+')');
 const result=await response.json();if(result?.ok!==true)throw new Error(result?.error||'Falha ao consultar catálogo');
 return result;
}
