import {estimateDirectorCost} from './provider-cost.js';
import {evaluateCost} from './cost.js';

const number=value=>{const n=Number(value);return Number.isFinite(n)?n:0};

export function buildStudioCostSnapshot({usage={},settings={},extraPaid={}}={}){
  const director=estimateDirectorCost(usage,{
    inputUsdPerMillion:number(settings.director_input_usd_per_million),
    cachedInputUsdPerMillion:number(settings.director_cached_input_usd_per_million),
    outputUsdPerMillion:number(settings.director_output_usd_per_million),
    usdToBrl:number(settings.usd_brl_reference)
  });
  const evaluated=evaluateCost({costs:{
    director:director.brl,
    image_generation:number(extraPaid.image_generation),
    video_generation:number(extraPaid.video_generation),
    other_paid:number(extraPaid.other_paid)
  }},{maxPaidCostPerVideo:number(settings.max_paid_cost_brl)||0.20});
  return {
    ...evaluated,
    directorCostBrl:director.brl,
    directorCostUsd:director.usd,
    usage:{inputTokens:director.billableInputTokens,cachedInputTokens:director.cachedInputTokens,outputTokens:director.billableOutputTokens},
    pricingKnown:Boolean(number(settings.usd_brl_reference)&&number(settings.director_input_usd_per_million)&&number(settings.director_output_usd_per_million)),
    pricingSource:settings.pricing_source||null,
    pricingUpdatedAt:settings.pricing_updated_at||null
  };
}
