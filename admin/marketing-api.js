import {CONFIG} from './runtime-config.js';
import {getCustomerOsAccessToken,clearCustomerOsSession} from './customer-os-auth.js';

async function secureCall(functionName,body,timeoutMs=18000){
  const token=getCustomerOsAccessToken();
  if(!token){
    const error=new Error('Entre com o PIN para acessar o Marketing.');
    error.code='missing_token';
    throw error;
  }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(`${CONFIG.supabaseUrl}/functions/v1/${functionName}`,{
      method:'POST',
      headers:{apikey:CONFIG.supabasePublishableKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify(body||{}),cache:'no-store',credentials:'omit',signal:controller.signal
    });
    const data=await response.json().catch(()=>({}));
    if(response.status===401)clearCustomerOsSession();
    if(!response.ok||data?.ok===false){
      const error=new Error(data?.detail||data?.error||'Não foi possível concluir a operação de Marketing.');
      error.code=String(data?.error||'request_failed');
      error.status=response.status;
      error.data=data;
      throw error;
    }
    return data;
  }catch(error){
    if(error?.name==='AbortError')throw new Error('A conexão demorou demais. Tente novamente.');
    throw error;
  }finally{clearTimeout(timer)}
}
export const getMarketingOverview=()=>secureCall(CONFIG.marketingInsightsFunction,{action:'overview'});
export const getMarketingMetrics=(days=30)=>secureCall(CONFIG.marketingInsightsFunction,{action:'metrics',days});
export const getMarketingWorkflow=()=>secureCall(CONFIG.marketingWorkflowFunction,{action:'workflow_overview'});
export const getMarketingShortlist=()=>secureCall(CONFIG.marketingBrainFunction,{action:'shortlist'});
export const getMarketingCustomerOpportunities=(limit=40)=>secureCall(CONFIG.marketingBrainFunction,{action:'opportunity_list',limit});
export const getMarketingStrategyBriefs=(opportunityId=null,limit=50)=>secureCall(CONFIG.marketingBrainFunction,{action:'opportunity_briefs',opportunity_id:opportunityId,limit});
export const observeMarketingOpportunity=(opportunityId)=>secureCall(CONFIG.marketingBrainFunction,{action:'opportunity_observe',opportunity_id:opportunityId});
export const suggestMarketingOpportunity=(opportunityId)=>secureCall(CONFIG.marketingBrainFunction,{action:'opportunity_suggest',opportunity_id:opportunityId},60000);
export const createDeterministicMarketingDraft=()=>secureCall(CONFIG.marketingBrainFunction,{action:'create_deterministic_draft'});
export const planMarketingCampaignAssets=(campaignId)=>secureCall(CONFIG.marketingBrainFunction,{action:'plan_campaign_assets',campaign_id:campaignId});
export const updateMarketingCampaignDraft=(payload)=>secureCall(CONFIG.marketingBrainFunction,{action:'update_campaign_draft',...payload});
export const previewAiMarketingStrategy=()=>secureCall(CONFIG.marketingBrainFunction,{action:'strategy_preview'});
export const getWhatsAppTemplateLibrary=()=>secureCall(CONFIG.whatsappDirectAdminFunction,{action:'template_library'});
export const getWhatsAppTemplateVersions=(templateKey)=>secureCall(CONFIG.whatsappDirectAdminFunction,{action:'template_versions',template_key:templateKey});
export const validateWhatsAppTemplateDraft=(payload)=>secureCall(CONFIG.whatsappDirectAdminFunction,{action:'template_validate',...payload});
export const saveWhatsAppTemplateDraft=(payload)=>secureCall(CONFIG.whatsappDirectAdminFunction,{action:'template_save_draft',...payload},30000);
export const createAiWhatsAppTemplateDraft=(payload)=>secureCall(CONFIG.whatsappDirectAdminFunction,{action:'template_ai_draft',...payload},60000);

export const renderMarketingPreview=(assetId)=>secureCall(CONFIG.marketingMediaFunction,{action:'render_preview',asset_id:assetId},60000);
export const getMarketingMediaUrl=(mediaId,expiresIn=600)=>secureCall(CONFIG.marketingMediaFunction,{action:'signed_url',media_id:mediaId,expires_in:expiresIn},18000);
export const queueMarketingLightVideo=(assetId)=>secureCall(CONFIG.marketingMediaFunction,{action:'queue_light_video',asset_id:assetId},18000);

export const submitMarketingAssetReview=(assetId)=>secureCall(CONFIG.marketingWorkflowFunction,{action:'submit_review',asset_id:assetId});
export const approveMarketingAsset=(assetId,note='')=>secureCall(CONFIG.marketingWorkflowFunction,{action:'approve_asset',asset_id:assetId,note});
export const rejectMarketingAsset=(assetId,note)=>secureCall(CONFIG.marketingWorkflowFunction,{action:'reject_asset',asset_id:assetId,note});
export const prepareMarketingPublication=(assetId)=>secureCall(CONFIG.marketingWorkflowFunction,{action:'prepare_publication',asset_id:assetId});
export const saveMarketingAssetEdit=(payload)=>secureCall(CONFIG.marketingWorkflowFunction,{action:'editor_save',...payload},30000);
export const forkMarketingAsset=(assetId,changeNote='')=>secureCall(CONFIG.marketingWorkflowFunction,{action:'editor_fork',asset_id:assetId,change_note:changeNote},30000);
