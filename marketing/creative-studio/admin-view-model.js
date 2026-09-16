const money=v=>Number.isFinite(Number(v))?Number(v):null;

export function buildCreativeStudioViewModel({product={},plan={},assets={},cost={}}={}){
  const summary=assets.summary||{total:0,ready:0,missing:0,blocked:0};
  const total=Number(summary.total||0),ready=Number(summary.ready||0),missing=Number(summary.missing||0),blocked=Number(summary.blocked||0);
  const requiresApproval=cost.requiresApproval===true;
  return {
    product:{id:product.id||null,name:product.name||'',imageUrl:product.image_url||product.image_ai_url||product.image_original_url||null},
    commercial:{price:money(product.price),offerPrice:product.is_offer?money(product.offer_price):null,isOffer:product.is_offer===true},
    idea:{territory:plan.territory||'',concept:plan.concept||'',emotions:Array.isArray(plan.emotions)?plan.emotions:[],hook:plan.hook||'',payoff:plan.payoff||'',duration:Number(plan.duration||0),productRole:plan.product_role||'',scenes:(plan.scenes||[]).map((s,i)=>({number:i+1,summary:s.summary||'',beat:s.beat||''}))},
    assets:{total,ready,missing,blocked,readyLabel:`${ready}/${total} prontos`},
    cost:{estimated:Number(cost.estimated||0),requiresApproval},
    actions:{produceEnabled:total>0&&ready===total&&missing===0&&blocked===0&&!requiresApproval,otherIdeaEnabled:true,adjustEnabled:true}
  };
}
