// XML field-level review gateway. This is an audit/decision ledger, never a product writer.
// The caller must pass the Auth context resolved from Supabase JWT + active admin_users.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELDS=new Set(["name","commercial_gtin","tax_gtin","ncm","cest","purchase_unit","supplier_item_code"]);
const ACTIONS=new Set(["xml_field_review_list","xml_field_review_open","xml_field_review_decide"]);
const DECISIONS={approve:"APROVAR_CAMPO_XML",reject:"REJEITAR_CAMPO_XML",reopen:"REABRIR_CAMPO_XML"};
const str=(x,n=500)=>typeof x==="string"?x.trim().slice(0,n):"";
const id=x=>typeof x==="string"&&UUID.test(x)?x:"";

function problem(error){
  const code=/xml_review_[a-z_]+/.exec(String(error?.message||""));
  return {ok:false,status:code?409:503,error:code?code[0]:"xml_review_unavailable"};
}
function authorized(auth){
  return Boolean(auth?.ok===true&&auth.internal===false&&
    ["owner","admin"].includes(auth.role)&&id(auth.user_id));
}
// Deliberately accept only a validated human context, even for read operations.
// No internal hub key, viewer, anonymous, or user-supplied actor may decide.
export async function xmlFieldReviewGateway(sb, action, payload, auth){
  if(!ACTIONS.has(action))return {ok:false,status:400,error:"xml_review_action_invalid"};
  if(!authorized(auth))return {ok:false,status:403,error:"human_owner_authorization_required"};
  const body=payload&&typeof payload==="object"&&!Array.isArray(payload)?payload:{};
  try{
    if(action==="xml_field_review_list"){
      const productId=id(body.product_id);
      if(!productId)return {ok:false,status:400,error:"xml_review_product_id_invalid"};
      const offset=Number(body.offset??0),requested=Number(body.limit??30);
      if(!Number.isInteger(offset)||offset<0||offset>100000||
         !Number.isInteger(requested)||requested<1||requested>50)
        return {ok:false,status:400,error:"xml_review_pagination_invalid"};
      const rows=await sb.from("purchase_xml_field_reviews_v1")
        .select("id,observation_id,product_id,field_name,original_value,proposed_value,document_key,status,revision,created_at,decided_at,decision_note",{count:"exact"})
        .eq("product_id",productId).order("created_at",{ascending:false})
        .range(offset,offset+requested-1);
      if(rows.error)return problem(rows.error);
      return {ok:true,items:rows.data||[],total:rows.count??0,offset,
        next_offset:offset+(rows.data||[]).length,
        product_updated:false,stock_updated:false,bling_called:false,finance_updated:false};
    }
    if(action==="xml_field_review_open"){
      const observationId=id(body.observation_id),productId=id(body.product_id);
      const field=str(body.field_name,60);
      if(!observationId||!productId||!FIELDS.has(field))
        return {ok:false,status:400,error:"xml_review_source_invalid"};
      if(body.confirmation!=="PREPARAR_CAMPO_XML")
        return {ok:false,status:409,error:"xml_review_confirmation_required"};
      const r=await sb.rpc("purchase_xml_open_field_review_v1",{
        p_observation_id:observationId,p_product_id:productId,
        p_field_name:field,p_actor_id:auth.user_id
      });
      if(r.error)return problem(r.error);
      return {ok:true,review_id:r.data,product_updated:false,
        fiscal_updated:false,stock_updated:false,bling_called:false,finance_updated:false};
    }
    const reviewId=id(body.review_id),expectedRevision=Number(body.expected_revision);
    const decision=str(body.decision,20);
    if(!reviewId||!Number.isInteger(expectedRevision)||expectedRevision<0||
       expectedRevision>1000000||!Object.hasOwn(DECISIONS,decision))
      return {ok:false,status:400,error:"xml_review_decision_invalid"};
    if(body.confirmation!==DECISIONS[decision])
      return {ok:false,status:409,error:"xml_review_confirmation_required"};
    const note=str(body.note,500);
    const r=await sb.rpc("purchase_xml_decide_field_review_v1",{
      p_review_id:reviewId,p_expected_revision:expectedRevision,
      p_decision:decision,p_actor_id:auth.user_id,
      p_confirmation:body.confirmation,p_note:note||null
    });
    if(r.error)return problem(r.error);
    return {...(r.data&&typeof r.data==="object"?r.data:{}),ok:true,
      product_updated:false,fiscal_updated:false,stock_updated:false,
      bling_called:false,finance_updated:false};
  }catch(_err){
    return {ok:false,status:503,error:"xml_review_unavailable"};
  }
}
