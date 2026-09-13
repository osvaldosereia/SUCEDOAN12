import {mergeProductUpdate,normalizeEan,normalizePrice,normalizeQuantity,buildProductCard} from './core.mjs';
const BASE='https://api.awsli.com.br/v1';
const PERSONAL_TOKEN=Deno.env.get('LOJA_INTEGRADA_PERSONAL_TOKEN')||'';
const API_KEY=Deno.env.get('LOJA_INTEGRADA_API_KEY')||'';
const APP_KEY=Deno.env.get('LOJA_INTEGRADA_APP_KEY')||'';
const allowed=new Set(['health','list_products','get_product','find_by_ean','create_product','update_product','set_active','get_stock','set_stock','get_price','set_price','add_image']);
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization, apikey, content-type','content-type':'application/json'};
function auth(){if(PERSONAL_TOKEN)return `Basic ${PERSONAL_TOKEN}`;if(API_KEY&&APP_KEY)return `chave_api ${API_KEY} aplicacao ${APP_KEY}`;throw new Error('Loja Integrada ainda não conectada.')}
async function li(path:string,init:RequestInit={}){const c=new AbortController(),t=setTimeout(()=>c.abort(),20000);try{const r=await fetch(`${BASE}${path}`,{...init,headers:{Authorization:auth(),'Content-Type':'application/json',...(init.headers||{})},signal:c.signal});const text=await r.text();let data:any={};try{data=text?JSON.parse(text):{}}catch{data={detail:text}}if(!r.ok)throw new Error(data?.detail||data?.error||`Loja Integrada: HTTP ${r.status}`);return data}finally{clearTimeout(t)}}
const getProduct=(id:number|string)=>li(`/produto/${id}`),getPrice=(id:number|string)=>li(`/produto_preco/${id}`),getStock=(id:number|string)=>li(`/produto_estoque/${id}`);
async function updateProduct(id:number|string,changes:any){const current=await getProduct(id);return li(`/produto/${id}`,{method:'PUT',body:JSON.stringify(mergeProductUpdate(current,changes))})}
async function findByEan(ean:string){const clean=normalizeEan(ean);if(!clean)return null;let offset=0;for(let page=0;page<8;page++){const d=await li(`/produto?limit=100&offset=${offset}`),items=d?.objects||d?.results||[];const hit=items.find((p:any)=>normalizeEan(p.gtin)===clean);if(hit)return hit;if(!d?.meta?.next&&!d?.next)break;offset+=100}return null}
Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response('',{headers:cors});try{const body=req.method==='GET'?Object.fromEntries(new URL(req.url).searchParams):await req.json();const action=String(body.action||'health');if(!allowed.has(action))throw new Error('Operação não permitida.');if(action==='health'){auth();return Response.json({ok:true,connected:true},{headers:cors})}let data:any;
if(action==='list_products')data=await li(`/produto?limit=${Math.min(100,Number(body.limit)||30)}&offset=${Math.max(0,Number(body.offset)||0)}`);
else if(action==='get_product'){const p=await getProduct(body.id);data={product:p,price:await getPrice(body.id),stock:await getStock(body.id)}}
else if(action==='find_by_ean'){const p=await findByEan(body.ean);if(p){const [price,stock]=await Promise.all([getPrice(p.id),getStock(p.id)]);data={product:p,price,stock,card:buildProductCard(p,price,stock)}}else data=null}
else if(action==='create_product')data=await li('/produto',{method:'POST',body:JSON.stringify(body.product||{})});
else if(action==='update_product')data=await updateProduct(body.id,body.changes||{});
else if(action==='set_active')data=await updateProduct(body.id,{ativo:Boolean(body.active)});
else if(action==='get_stock')data=await getStock(body.id);
else if(action==='set_stock'){const current=await getStock(body.id);data=await li(`/produto_estoque/${body.id}`,{method:'PUT',body:JSON.stringify({...current,quantidade:normalizeQuantity(body.quantity)})})}
else if(action==='get_price')data=await getPrice(body.id);
else if(action==='set_price')data=await li(`/produto_preco/${body.id}`,{method:'PUT',body:JSON.stringify({cheio:normalizePrice(body.price),promocional:normalizePrice(body.promotional_price)})});
else if(action==='add_image')data=await li('/produto_imagem',{method:'POST',body:JSON.stringify({produto:`/api/v1/produto/${body.id}`,imagem:body.image_url,principal:Boolean(body.primary)})});
return Response.json({ok:true,data},{headers:cors})}catch(e){return Response.json({ok:false,error:e instanceof Error?e.message:'Falha na integração.'},{status:400,headers:cors})}});