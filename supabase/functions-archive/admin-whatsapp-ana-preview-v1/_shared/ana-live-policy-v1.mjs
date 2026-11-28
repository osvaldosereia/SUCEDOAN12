const clean=(value,max=1200)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);

export function shouldSendAnaLiveReply({decision,confidence,responseText,minConfidence=0.85}={}){
  const score=Number(confidence);
  return decision==='suggest'
    && Number.isFinite(score)
    && score>=minConfidence
    && clean(responseText).length>0;
}
