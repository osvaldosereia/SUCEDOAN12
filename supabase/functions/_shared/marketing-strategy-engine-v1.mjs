export const DEFAULT_STRATEGY_WEIGHTS_V1=Object.freeze({
  availability_stock:25,
  seasonality:20,
  audience_fit:20,
  historical_performance:20,
  exploration:10,
  operational_quality:5,
});

const finiteNumber=(value)=>{
  const n=Number(value);
  return Number.isFinite(n)?n:null;
};
const clamp01=(value)=>{
  const n=finiteNumber(value);
  if(n===null)return 0;
  return Math.max(0,Math.min(1,n));
};
const round2=(value)=>Math.round((value+Number.EPSILON)*100)/100;

export function isEligibleOffer(row,minimum=75){
  const reasons=[];
  if(row?.model_active!==true)reasons.push('model_inactive');
  if(row?.category_active!==true)reasons.push('category_inactive');
  const available=finiteNumber(row?.public_available);
  if(available===null||available<=0)reasons.push('out_of_stock');
  if(String(row?.availability_reason||'')!=='available')reasons.push('unavailable');
  const price=finiteNumber(row?.sale_price);
  if(price===null||price<0)reasons.push('invalid_price');
  else if(price<Number(minimum||75))reasons.push('below_minimum_order');
  if(!String(row?.public_lot_id||'').trim())reasons.push('missing_public_lot');
  if(!String(row?.public_name||row?.model_name||'').trim())reasons.push('missing_public_name');
  return {eligible:reasons.length===0,reasons};
}

export function scoreOffer(input={},weights=DEFAULT_STRATEGY_WEIGHTS_V1){
  const signals=input?.signals&&typeof input.signals==='object'?input.signals:{};
  const breakdown={};
  const reasons=[];
  for(const key of Object.keys(DEFAULT_STRATEGY_WEIGHTS_V1)){
    const weight=Math.max(0,finiteNumber(weights?.[key])??0);
    const raw=signals?.[key];
    if(key==='historical_performance'&&(raw===undefined||raw===null||!Number.isFinite(Number(raw)))){
      reasons.push('no_historical_evidence');
    }
    breakdown[key]=round2(weight*clamp01(raw));
  }
  const total=round2(Math.max(0,Math.min(100,Object.values(breakdown).reduce((sum,value)=>sum+value,0))));
  return {total,breakdown,reasons};
}

export function rankOffers(inputs=[],weights=DEFAULT_STRATEGY_WEIGHTS_V1,options={}){
  const minimum=finiteNumber(options?.minimum)??75;
  const ranked=[];
  for(let index=0;index<inputs.length;index++){
    const row=inputs[index]||{};
    const eligibility=isEligibleOffer(row,minimum);
    if(!eligibility.eligible)continue;
    const score=scoreOffer(row,weights);
    ranked.push({...row,eligible:true,eligibility_reasons:eligibility.reasons,total:score.total,breakdown:score.breakdown,reasons:score.reasons,_strategy_index:index});
  }
  ranked.sort((a,b)=>(b.total-a.total)||(a._strategy_index-b._strategy_index));
  const limit=Number.isInteger(options?.limit)&&options.limit>0?options.limit:null;
  return (limit?ranked.slice(0,limit):ranked).map(({_strategy_index,...row})=>row);
}

export function chooseFormat(scored=[],context={}){
  const valid=scored.filter(row=>row&&row.eligible!==false&&String(row.commercial_id||'').trim());
  if(!valid.length)return {format:'single',offer_ids:[]};
  const preferCarousel=context?.preferCarousel===true||context?.coldStart===true;
  if(preferCarousel&&valid.length>=2){
    const requested=Number(context?.maxCards);
    const maxCards=Number.isInteger(requested)?Math.max(2,Math.min(10,requested)):4;
    return {format:'carousel',offer_ids:valid.slice(0,maxCards).map(row=>String(row.commercial_id))};
  }
  return {format:'single',offer_ids:[String(valid[0].commercial_id)]};
}

export function canAdvertiseFreeDelivery(context={}){
  if(context?.free_delivery_enabled!==true)return {ok:false,reason:'free_delivery_disabled'};
  if(context?.destination_in_service_area!==true)return {ok:false,reason:'destination_outside_service_area'};
  if(context?.offer_delivery_eligible!==true)return {ok:false,reason:'offer_not_delivery_eligible'};
  return {ok:true,reason:'eligible'};
}
