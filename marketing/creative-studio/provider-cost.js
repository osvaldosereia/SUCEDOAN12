const finite=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:0};
const round=(value,digits=8)=>Number(Number(value).toFixed(digits));

export function estimateDirectorCost(usage={},pricing={}){
  const input=finite(usage.input_tokens);
  const cached=Math.min(input,finite(usage.input_tokens_details?.cached_tokens));
  const uncached=Math.max(0,input-cached);
  const output=finite(usage.output_tokens);
  const inputRate=finite(pricing.inputUsdPerMillion??0.20);
  const cachedRate=finite(pricing.cachedInputUsdPerMillion??0.02);
  const outputRate=finite(pricing.outputUsdPerMillion??1.20);
  const usdToBrl=finite(pricing.usdToBrl);
  const usd=(uncached*inputRate+cached*cachedRate+output*outputRate)/1_000_000;
  return {
    usd:round(usd),
    brl:usdToBrl?round(usd*usdToBrl):0,
    billableInputTokens:input,
    cachedInputTokens:cached,
    billableOutputTokens:output,
    pricing:{inputUsdPerMillion:inputRate,cachedInputUsdPerMillion:cachedRate,outputUsdPerMillion:outputRate,usdToBrl:usdToBrl||null}
  };
}
