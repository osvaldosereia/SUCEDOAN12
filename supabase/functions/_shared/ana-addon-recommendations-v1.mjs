// Deterministic on-site quick-add ranking. Call only with canonical server-side rows.
// This function never fetches customer data, invents prices or performs outbound marketing.
const normalize=value=>String(value??'').trim().toLowerCase();
const numeric=value=>{const n=Number(value);return Number.isFinite(n)?n:null};
const asSet=values=>new Set((Array.isArray(values)?values:[]).map(normalize).filter(Boolean));

export function rankAnaAddonProducts({
  products=[],orderProductIds=[],basketComplementIds=[],coPurchaseCounts={},
  interestCategories=[],limit=10
}={}){
  const already=asSet(orderProductIds);
  const complements=asSet(basketComplementIds);
  const interests=asSet(interestCategories);
  const safeLimit=Math.max(1,Math.min(12,Math.trunc(Number(limit)||10)));
  const seen=new Set();
  const ranked=[];

  for(const product of Array.isArray(products)?products:[]){
    const id=normalize(product?.id||product?.product_id);
    const name=String(product?.name||'').trim();
    const stock=numeric(product?.loose_sellable_stock);
    const price=numeric(product?.effective_price);
    if(!id||!name||seen.has(id)||product?.is_active!==true||stock===null||stock<=0||price===null||price<0)continue;
    seen.add(id);

    const reasons=[];
    let score=0;
    if(complements.has(id)){score+=90;reasons.push('basket_complement')}
    const purchases=Math.max(0,Math.min(100,numeric(coPurchaseCounts?.[id])||0));
    if(purchases>0){score+=40+Math.min(30,purchases*2);reasons.push('co_purchase')}
    if(interests.has(normalize(product?.category))){score+=25;reasons.push('interest')}
    if(product?.is_offer===true&&numeric(product?.offer_price)!==null&&numeric(product?.offer_price)>=0){
      score+=15;reasons.push('offer');
    }
    if(stock>=10)score+=10;
    else if(stock>=3)score+=5;
    if(already.has(id))score-=60;
    if(reasons.length===0)reasons.push('available');
    ranked.push({product_id:id,name,score,reasons,already_in_order:already.has(id)});
  }

  ranked.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'pt-BR')||a.product_id.localeCompare(b.product_id));
  return ranked.slice(0,safeLimit);
}
