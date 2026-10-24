// R24: authenticated, human-only, inactive-name-only application gateway.
// No generic field updates. The SQL RPC supplies row locks, CAS, audit and rollback.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id=v=>typeof v==="string"&&UUID.test(v)?v:null;
const ACTIONS=new Set(["xml_field_apply_list","xml_field_apply_preview",
  "xml_field_apply_commit","xml_field_apply_rollback"]);
function failed(e){
  const match=String(e?.message||"").match(/xml_(?:apply|rollback|review)_[a-z_]+/);
  return {ok:false,status:match?409:503,error:match?match[0]:"xml_apply_unavailable"};
}
export async function xmlFieldApplyGateway(sb,action,payload,auth){
  if(!ACTIONS.has(action))return {ok:false,status:400,error:"xml_apply_action_invalid"};
  if(!(auth?.ok===true&&auth?.internal===false&&["owner","admin"].includes(auth.role)&&id(auth.user_id)))
    return {ok:false,status:403,error:"human_owner_authorization_required"};
  const body=payload&&typeof payload==="object"&&!Array.isArray(payload)?payload:{};
  try{
    if(action==="xml_field_apply_list"){
      const productId=id(body.product_id);
      if(!productId)return {ok:false,status:400,error:"xml_apply_product_invalid"};
      const r=await sb.from("purchase_xml_field_applications_v1")
        .select("id,review_id,product_id,field_name,before_value,applied_value,review_revision,status,applied_at,rolled_back_at")
        .eq("product_id",productId).order("applied_at",{ascending:false}).limit(50);
      if(r.error)return failed(r.error);
      return {ok:true,items:r.data||[],readonly:true};
    }
    if(action==="xml_field_apply_preview"){
      const reviewId=id(body.review_id);
      if(!reviewId)return {ok:false,status:400,error:"xml_apply_review_invalid"};
      const r=await sb.rpc("purchase_xml_preview_field_application_v1",{p_review_id:reviewId});
      if(r.error)return failed(r.error);
      return {ok:true,...(r.data||{}),readonly:true,
        product_updated:false,stock_updated:false,bling_called:false};
    }
    if(action==="xml_field_apply_commit"){
      const reviewId=id(body.review_id),revision=body.expected_revision;
      if(!reviewId||!Number.isInteger(revision)||revision<0||revision>1000000)
        return {ok:false,status:400,error:"xml_apply_revision_invalid"};
      if(body.confirmation!=="APLICAR_NOME_APROVADO_XML")
        return {ok:false,status:409,error:"xml_apply_confirmation_required"};
      const r=await sb.rpc("purchase_xml_apply_field_review_v1",{
        p_review_id:reviewId,p_expected_revision:revision,p_actor_id:auth.user_id,
        p_confirmation:body.confirmation
      });
      if(r.error)return failed(r.error);
      return r.data?.ok===true?r.data:{ok:false,status:503,error:"xml_apply_unavailable"};
    }
    const applicationId=id(body.application_id);
    if(!applicationId)return {ok:false,status:400,error:"xml_rollback_application_invalid"};
    if(body.confirmation!=="REVERTER_NOME_APLICADO_XML")
      return {ok:false,status:409,error:"xml_rollback_confirmation_required"};
    const r=await sb.rpc("purchase_xml_rollback_field_review_v1",{
      p_application_id:applicationId,p_actor_id:auth.user_id,p_confirmation:body.confirmation
    });
    if(r.error)return failed(r.error);
    return r.data?.ok===true?r.data:{ok:false,status:503,error:"xml_apply_unavailable"};
  }catch(_e){return {ok:false,status:503,error:"xml_apply_unavailable"};}
}
