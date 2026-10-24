const PRODUCTS=[
 {id:'demo-arroz',name:'Arroz tipo 1',sku:'DEMO-001',gtin:'7890000000010',brand:'Dona Antônia',packaging:'5 kg',category:'Mercearia',image_url:'',price_cents:2590,stock_quantity:18,is_active:true},
 {id:'demo-feijao',name:'Feijão carioca',sku:'DEMO-002',gtin:'7890000000027',brand:'Dona Antônia',packaging:'1 kg',category:'Mercearia',image_url:'',price_cents:899,stock_quantity:24,is_active:true},
 {id:'demo-oleo',name:'Óleo de soja',sku:'DEMO-003',gtin:'7890000000034',brand:'Dona Antônia',packaging:'900 ml',category:'Mercearia',image_url:'',price_cents:749,stock_quantity:12,is_active:true}
];
const BASKETS=[
 {id:'demo-cesta-grande',name:'Cesta Básica Grande',image_url:'',display_price_cents:28990,carousel_items:[{quantity:12},{quantity:8}]},
 {id:'demo-cesta-media',name:'Cesta Básica Média',image_url:'',display_price_cents:18990,carousel_items:[{quantity:9},{quantity:6}]},
 {id:'demo-cesta-pequena',name:'Cesta Básica Pequena',image_url:'',display_price_cents:12990,carousel_items:[{quantity:7},{quantity:4}]}
];
export function normalizePublicProduct(p={}){return {id:String(p.id||''),name:String(p.name||''),sku:String(p.sku||''),gtin:String(p.gtin||''),brand:String(p.brand||''),packaging:String(p.packaging||''),image_url:String(p.image_url||''),category:String(p.category||''),sale_price_cents:Math.max(0,Number(p.price_cents||0)),stock_quantity:Math.max(0,Number(p.stock_quantity||0)),active:p.is_active===true}}
export function normalizePublicBasket(b={}){const items=Array.isArray(b.carousel_items)?b.carousel_items:[];return {id:String(b.id||''),name:String(b.name||''),image_url:String(b.image_url||''),sku:'',base_price_cents:Math.max(0,Number(b.display_price_cents||0)),template_item_count:items.reduce((n,x)=>n+Math.max(0,Number(x.quantity||0)),0),is_active:true}}
export async function requestPreview(action,params={}){if(action==='products'){const q=String(params.q||'').toLocaleLowerCase('pt-BR'),products=PRODUCTS.filter(p=>!q||[p.name,p.sku,p.gtin,p.brand].some(v=>v.toLocaleLowerCase('pt-BR').includes(q)));return {products:products.slice(Number(params.offset)||0,(Number(params.offset)||0)+(Number(params.limit)||36)).map(normalizePublicProduct),next_offset:null}}if(action==='home')return {baskets:BASKETS.map(normalizePublicBasket)};throw new Error('preview_action_not_allowed')}
