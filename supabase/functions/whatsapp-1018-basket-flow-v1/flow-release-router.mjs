// The published V1 and the tested V2 share one fixed endpoint. Route using the
// signed Flow ID in the internal canary token so V1 keeps its original contract.
export const DYNAMIC_V2_FLOW_ID='1817973829344642';

export function selectCanaryEngine(flowId){
 return String(flowId??'')===DYNAMIC_V2_FLOW_ID?'basket-editor-v2':'legacy-v1';
}

export async function dispatchCanaryFlow(request,claims,deps,engines){
 const name=selectCanaryEngine(claims?.flow_id),engine=engines?.[name];
 if(typeof engine!=='function')throw Error('flow_engine_unavailable');
 return engine(request,deps);
}
