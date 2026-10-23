const MAX_REPURCHASE_CAMPAIGN_RECIPIENTS=50;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function repurchaseCampaignCustomerIds(rows){
  const ids=[],seen=new Set();
  for(const row of Array.isArray(rows)?rows:[]){
    const id=String(row?.customer_id||'').trim();
    if(row?.status!=='ready'||row?.marketing_opt_in!==true||!UUID.test(id)||seen.has(id))continue;
    seen.add(id);ids.push(id);
    if(ids.length===MAX_REPURCHASE_CAMPAIGN_RECIPIENTS)break;
  }
  return ids;
}

export {MAX_REPURCHASE_CAMPAIGN_RECIPIENTS,repurchaseCampaignCustomerIds};