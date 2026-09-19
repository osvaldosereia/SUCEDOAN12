const METRIC_KEYS = ['reach','impressions','views','engagement','saves','shares'];

function nonNegativeInt(value){
  const n=Number(value ?? 0);
  return Number.isFinite(n) && n>0 ? Math.floor(n) : 0;
}

function normalizedMetrics(input={}){
  return Object.fromEntries(METRIC_KEYS.map((key)=>[key,nonNegativeInt(input[key])]));
}

function evidenceKey(provider,channel,externalContentRef,capturedAt){
  return [provider,channel,externalContentRef,new Date(capturedAt).toISOString()].join(':');
}

export function normalizeMetaMetricSnapshot(input={}){
  const channel=String(input.channel||'').trim();
  const externalContentRef=String(input.external_content_ref||input.id||'').trim();
  const capturedAt=new Date(input.captured_at||input.end_time||0).toISOString();
  const insights=Array.isArray(input.insights)?input.insights:[];
  const values={};
  for(const row of insights){
    const name=String(row?.name||'').toLowerCase();
    const value=row?.value ?? row?.values?.[0]?.value ?? 0;
    if(name.includes('reach')) values.reach=value;
    else if(name.includes('impression')) values.impressions=value;
    else if(name.includes('view')||name.includes('play')) values.views=value;
    else if(name.includes('save')) values.saves=value;
    else if(name.includes('share')) values.shares=value;
    else if(name.includes('engagement')||name.includes('interaction')) values.engagement=value;
  }
  if(!channel||!externalContentRef) throw new Error('meta_snapshot_identity_required');
  return {provider:'meta',channel,external_content_ref:externalContentRef,captured_at:capturedAt,evidence_key:evidenceKey('meta',channel,externalContentRef,capturedAt),metrics:normalizedMetrics(values),evidence:{source:'fixture_or_provider_payload',normalized:true,external_side_effect:false}};
}

export function normalizePinterestMetricSnapshot(input={}){
  const channel=String(input.channel||'pinterest').trim();
  const externalContentRef=String(input.external_content_ref||input.pin_id||input.id||'').trim();
  const capturedAt=new Date(input.captured_at||input.date||0).toISOString();
  const metrics=input.metrics||input;
  if(!externalContentRef) throw new Error('pinterest_snapshot_identity_required');
  return {provider:'pinterest',channel,external_content_ref:externalContentRef,captured_at:capturedAt,evidence_key:evidenceKey('pinterest',channel,externalContentRef,capturedAt),metrics:normalizedMetrics({reach:metrics.reach,impressions:metrics.impressions,views:metrics.video_views??metrics.views,engagement:metrics.engagement??metrics.engagements,saves:metrics.saves,shares:metrics.shares}),evidence:{source:'fixture_or_provider_payload',normalized:true,external_side_effect:false}};
}

export function normalizeChannelMetricSnapshot(provider,input){
  if(provider==='meta') return normalizeMetaMetricSnapshot(input);
  if(provider==='pinterest') return normalizePinterestMetricSnapshot(input);
  throw new Error('unsupported_metrics_provider');
}
