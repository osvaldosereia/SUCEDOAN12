// Canonical product projection for 1018: pure, read-only, fail closed.
// Caller must supply rows already authorized by Vitrine/Admin catalog policy.
const validCents=n=>Number.isSafeInteger(n)&&n>=0;
const text=(x,max)=>String(x??'').trim().slice(0,max);
export function project1018Catalog({products=[],limit=30,query='',category=''}={}){
 if(!Array.isArray(products)||products.length>10000)return {ok:false,reason:'invalid_source'};
 if(!Number.isInteger(limit)||limit<1||limit>50)return {ok:false,reason:'invalid_limit'};
 const q=text(query,80).toLocaleLowerCase('pt-BR'),cat=text(category,80).toLocaleLowerCase('pt-BR');
 const rows=[];let omitted=0;
 for(const p of products){
  if(!p||p.active!==true||!Number.isSafeInteger(p.stock)||p.stock<1){omitted++;continue}
  const id=text(p.id,90),name=text(p.name,100),kind=p.kind==='basket'?'basket':'product';
  const price=kind==='basket'?p.customerBasketPriceCents:p.priceCents;
  if(!id||!name||!validCents(price)){omitted++;continue}
  const group=text(p.category,80);
  if(q&&!name.toLocaleLowerCase('pt-BR').includes(q))continue;
  if(cat&&group.toLocaleLowerCase('pt-BR')!==cat)continue;
  if(rows.length>=limit)continue;
  rows.push({id,name,kind,category:group,priceCents:price,available:true,
   imageUrl:/^https:\/\//.test(String(p.imageUrl||''))?text(p.imageUrl,500):null});
 }
 return {ok:true,readOnly:true,rows,omitted,hasMore:products.length>rows.length+omitted};
}
