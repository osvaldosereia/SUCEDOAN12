function assert(condition,code){if(!condition)throw new Error(code)}
function clone(value){return structuredClone(value)}

export function buildRenderJob({product,plan,assets,timeline,providerUsage={},cost={estimated:0,requiresApproval:false}}={}){
  assert(product?.id,'product_required');
  assert(plan&&Number(plan.duration)>=15&&Number(plan.duration)<=25,'duration_out_of_range');
  assert(timeline&&Number(timeline.duration)===Number(plan.duration),'timeline_duration_mismatch');
  assert(timeline?.audio?.voice!==true,'voice_forbidden');
  const summary=assets?.summary||{total:0,ready:0,missing:0,blocked:0};
  assert(Number(summary.missing||0)===0&&Number(summary.blocked||0)===0&&Number(summary.ready||0)===Number(summary.total||0),'assets_not_ready');
  const snapshot={
    product_id:String(product.id),
    product_snapshot:clone(product),
    creative_plan:clone(plan),
    resolved_assets:clone(assets||{items:[],externalAcquisitions:0,summary}),
    timeline:clone(timeline),
    status:'ready',
    width:1080,
    height:1920,
    fps:30,
    duration_seconds:Number(plan.duration),
    external_assets_used:Number(assets?.externalAcquisitions||0),
    provider_usage:clone(providerUsage||{}),
    estimated_cost_brl:Number(cost?.estimated||0),
    requires_paid_approval:cost?.requiresApproval===true,
    render_strategy:'ffmpeg_svg',
    output_bucket:'creative-studio-renders'
  };
  return Object.freeze(snapshot);
}
