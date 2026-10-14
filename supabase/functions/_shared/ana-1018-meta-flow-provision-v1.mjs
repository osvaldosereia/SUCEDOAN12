// Strict 1018-only Meta Flow draft provisioning. No messaging/activation.
// This is designed for use by an authenticated, owner-only server endpoint.
const idPattern=/^[0-9]{5,30}$/;
const allowed=new Set(['new_order','offers','existing_order','human']);
function checkDraft(draft){
 if(!draft||draft.version!=='7.3'||!Array.isArray(draft.screens)||draft.screens.length!==2)
  throw new TypeError('invalid_draft');
 const terminal=draft.screens.find(s=>s.id==='SELECT_PATH');
 const group=terminal?.layout?.children?.find(x=>x.type==='Form')?.children?.find(x=>x.type==='RadioButtonsGroup');
 if(!terminal?.terminal||!terminal.success||!group?.required
  ||group['data-source']?.length!==4
  ||group['data-source'].some(x=>!allowed.has(x.id))
  ||terminal.layout.children.at(-1)?.on_click_action?.name!=='complete')
  throw new TypeError('invalid_draft');
 const payload=JSON.stringify(draft);
 if(/cpf|cnpj|endereço|payment|valor.oculto|hidden|http:\/\/|https:\/\//i.test(payload))
  throw new TypeError('sensitive_draft');
 return payload;
}
export async function provision1018MetaFlowDraft({
 enabled=false,account=null,expectedAccountId,accessToken,graphVersion='v23.0',
 draft,transport=fetch,existingFlowId=null
}={}){
 if(enabled!==true)return {ok:false,reason:'disabled'};
 if(!account||account.id!==expectedAccountId||account.slug!=='dona-antonia-1018'
  ||account.phone_e164!=='+5565984491018'||!idPattern.test(String(account.waba_id||'')))
  return {ok:false,reason:'wrong_account'};
 if(typeof accessToken!=='string'||accessToken.length<20||!/^v\d+\.\d+$/.test(graphVersion))
  return {ok:false,reason:'meta_not_configured'};
 let serialized;
 try{serialized=checkDraft(draft)}catch{return {ok:false,reason:'invalid_draft'}};
 if(typeof transport!=='function')return {ok:false,reason:'transport_missing'};
 const root='https://graph.facebook.com/'+graphVersion;
 const name='Dona Antonia 1018 Atendimento Piloto';
 const request=async(url,options)=>{
  const signal=AbortSignal.timeout(15000);
  const response=await transport(url,{...options,signal,headers:{Authorization:'Bearer '+accessToken,...options.headers}});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error('meta_response_error'),{status:response.status,code:result.error?.code||null});
  return result;
 };
 try{
  let flowId=existingFlowId;
  if(flowId!==null&&!idPattern.test(String(flowId)))return {ok:false,reason:'invalid_flow_id'};
  if(!flowId){
   // Prevent duplicate creation if a draft with this exact name is already in Meta.
   const listing=await request(root+'/'+account.waba_id+'/flows?fields=id,name,status&limit=100',{method:'GET'});
   const matches=(listing.data||[]).filter(x=>x.name===name);
   if(matches.length>1)return {ok:false,reason:'ambiguous_existing_flow'};
   if(matches.length===1)flowId=matches[0].id;
   if(listing.paging?.next)return {ok:false,reason:'pagination_requires_review'};
  }
  if(!flowId){
   const form=new FormData();form.set('name',name);form.set('categories',JSON.stringify(['CUSTOMER_SUPPORT']));
   const created=await request(root+'/'+account.waba_id+'/flows',{method:'POST',body:form});
   flowId=created.id;
   if(!idPattern.test(String(flowId||'')))return {ok:false,reason:'flow_creation_unconfirmed',requiresReconciliation:true};
  }
  const form=new FormData();form.set('name','flow.json');form.set('asset_type','FLOW_JSON');
  form.set('file',new Blob([serialized],{type:'application/json'}),'flow.json');
  const uploaded=await request(root+'/'+flowId+'/assets',{method:'POST',body:form});
  const state=await request(root+'/'+flowId+'?fields=id,name,status,validation_errors,json_version',{method:'GET'});
  return {ok:true,flowId:String(flowId),status:String(state.status||'UNKNOWN'),
   validationErrors:Array.isArray(state.validation_errors)?state.validation_errors:[],
   uploaded:!!uploaded, published:false, customerMessagesSent:false};
 }catch(error){
  return {ok:false,reason:'meta_request_failed',metaStatus:error.status||null,metaCode:error.code||null,
   requiresReconciliation:true};
 }
}
