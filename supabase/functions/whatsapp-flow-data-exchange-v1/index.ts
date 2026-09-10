import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import {decryptFlowRequest,encryptFlowResponse,FlowCryptoError,sha256Hex,type EncryptedFlowEnvelope} from "./crypto.ts";
import {hydrateExperienceImagesWithCards} from "./card-images.ts";

const text=(value:unknown,max=200)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const plain=(body:string,status=200)=>new Response(body,{status,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});
const isObject=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==="object"&&!Array.isArray(value);
const safeAction=(value:string)=>/^[A-Za-z0-9_:-]{1,80}$/.test(value)?value:"invalid_action";
const safeScreen=(value:string|null)=>value&&/^[A-Za-z0-9_:-]{1,120}$/.test(value)?value:null;

async function ownerHomologationAllowed(sb:any,resolved:Record<string,unknown>|null):Promise<boolean>{
  if(!resolved?.session_id||!resolved?.conversation_id||!resolved?.definition_id)return false;
  const ctx=isObject(resolved.context)?resolved.context:{};
  const ownerMarked=(ctx.test_mode===true&&text(ctx.requested_by,32)==="owner")||(ctx.homologation_test===true&&ctx.requested_by_owner===true);
  if(!ownerMarked)return false;

  const {data:def,error:defError}=await sb.from("experience_definitions").select("slug,status,metadata").eq("id",resolved.definition_id).maybeSingle();
  if(defError||!def)return false;
  const metadata=isObject(def.metadata)?def.metadata:{};
  const slug=text(def.slug,120);
  const candidate=/^flow-cestas-comercial-v[4-6]$/.test(slug);
  const dormant=["draft","ready"].includes(text(def.status,32));
  const isolated=metadata.candidate_not_live===true&&metadata.customer_exposure!==true;
  if(!candidate||!dormant||!isolated)return false;

  // When the test session carries an explicit recipient, bind the bypass to it.
  // Older owner sessions created before this field existed remain isolated by
  // the unguessable Flow token + dormant candidate + global send gate OFF.
  const testRecipient=text(ctx.test_recipient,32);
  if(testRecipient){
    const {data:conversation,error}=await sb.from("conversations").select("wa_contact_e164").eq("id",resolved.conversation_id).maybeSingle();
    if(error||!conversation||text(conversation.wa_contact_e164,32)!==testRecipient)return false;
  }
  return true;
}

Deno.serve(async(req:Request)=>{
  const requestId=crypto.randomUUID();
  if(req.method!=="POST")return plain("method_not_allowed",405);
  if((req.headers.get("content-type")||"").toLowerCase().indexOf("application/json")<0)return plain("content_type_required",415);

  const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!serviceKey)return plain("server_config",500);
  const sb=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

  const {data:readiness,error:readinessError}=await sb.rpc("get_whatsapp_flow_transport_readiness_v1");
  if(readinessError)return plain("readiness_failed",500);
  if(!readiness?.private_key_configured||!readiness?.public_key_configured)return plain("flow_key_not_configured",503);

  let envelope:EncryptedFlowEnvelope;
  try{
    const raw=await req.json();
    if(!isObject(raw))return plain("invalid_body",400);
    envelope={encrypted_aes_key:text(raw.encrypted_aes_key,4096),encrypted_flow_data:text(raw.encrypted_flow_data,1500000),initial_vector:text(raw.initial_vector,256)};
    if(!envelope.encrypted_aes_key||!envelope.encrypted_flow_data||!envelope.initial_vector)return plain("encrypted_fields_required",400);
  }catch{return plain("invalid_json",400)}

  const requestFingerprint=await sha256Hex(`${envelope.encrypted_aes_key}.${envelope.encrypted_flow_data}.${envelope.initial_vector}`);
  const {data:privateKey,error:keyError}=await sb.rpc("get_whatsapp_flow_private_key_v1");
  if(keyError||!privateKey)return plain("flow_key_unavailable",503);

  try{
    const decrypted=await decryptFlowRequest(envelope,privateKey);
    const body=decrypted.decryptedBody;
    const action=text(body.action,80);
    const screen=safeScreen(text(body.screen,120)||null);
    const flowToken=text(body.flow_token,200);
    const data=isObject(body.data)?body.data:{};

    let response:unknown;
    let sessionId:string|null=null;
    let resolved:Record<string,unknown>|null=null;
    let eventStatus="accepted";
    let errorCode:string|null=null;

    if(flowToken){
      const result=await sb.rpc("resolve_whatsapp_flow_token_v1",{p_flow_token:flowToken});
      if(result.data?.ok){resolved=result.data;sessionId=result.data.session_id}
    }

    // Global Data Exchange remains OFF. Only a valid owner homologation token
    // for a dormant candidate may pass. Normal/customer traffic stays closed.
    if(action!=="ping"&&!readiness?.data_exchange_enabled){
      if(!await ownerHomologationAllowed(sb,resolved))return plain("flow_endpoint_disabled",503);
    }

    const {data:claim,error:claimError}=await sb.rpc("claim_whatsapp_flow_request_v1",{p_request_fingerprint:requestFingerprint,p_request_id:requestId,p_session_id:sessionId,p_action:safeAction(action||"unknown"),p_screen:screen});
    if(claimError||!claim?.ok)throw new FlowCryptoError(500,"flow_replay_guard_failed","Flow replay guard failed.");
    const isReplay=claim.replay===true;

    if(action==="ping"){
      response={data:{status:"active"}};
      await sb.from("whatsapp_flow_exchange_events").insert({request_id:requestId,action:"ping",screen:null,status:"accepted",is_replay:isReplay});
    }else if(isObject(data)&&data.error){
      response={data:{acknowledged:true,replayed:isReplay}};
      eventStatus="acknowledged";
      errorCode=text(data.error,120)||"client_error";
      if(sessionId)await sb.rpc("record_whatsapp_flow_exchange_v1",{p_session_id:sessionId,p_request_id:requestId,p_action:safeAction(action||"client_error"),p_screen:screen,p_status:eventStatus,p_error_code:errorCode,p_is_replay:isReplay});
    }else{
      if(!flowToken)throw new FlowCryptoError(400,"flow_token_required","Flow token is required.");
      let handled:any=null,handleError:any=null;
      const definitionSlug=text(resolved?.definition_slug,120)||null;
      const params={p_session_id:sessionId,p_conversation_id:resolved?.conversation_id,p_action:action,p_screen:screen,p_data:data};

      if(definitionSlug==="flow-cestas-comercial-v1"){
        const result=await sb.rpc("handle_whatsapp_flow_commercial_exchange_v8",params);handled=result.data;handleError=result.error;
      }else if(definitionSlug==="flow-cestas-comercial-v2"){
        const result=await sb.rpc("handle_whatsapp_flow_commercial_exchange_v9",params);handled=result.data;handleError=result.error;
      }else if(definitionSlug==="flow-cestas-comercial-v3"){
        const result=await sb.rpc("handle_whatsapp_flow_commercial_exchange_v12",params);handled=result.data;handleError=result.error;
      }else if(definitionSlug==="flow-cestas-comercial-v4"){
        const result=await sb.rpc("handle_whatsapp_flow_commercial_exchange_v15",params);handled=result.data;handleError=result.error;
      }else if(definitionSlug==="flow-cestas-comercial-v5"){
        const result=await sb.rpc("handle_whatsapp_flow_commercial_exchange_v16",params);handled=result.data;handleError=result.error;
      }else if(definitionSlug==="flow-cestas-comercial-v6"){
        const result=await sb.rpc("handle_whatsapp_flow_commercial_exchange_v17",params);handled=result.data;handleError=result.error;
      }else{
        const result=await sb.rpc("handle_whatsapp_flow_exchange_v1",{p_flow_token:flowToken,p_action:action,p_screen:screen,p_data:data,p_request_fingerprint:requestFingerprint,p_is_replay:isReplay});handled=result.data;handleError=result.error;
      }

      if(handleError)throw new FlowCryptoError(500,"flow_handler_failed","Flow handler failed.");
      sessionId=handled?.session_id||sessionId;
      if(!handled?.ok){eventStatus="rejected";errorCode=text(handled?.reason,120)||"flow_rejected";response={data:{error:true,error_code:errorCode,replayed:isReplay}};}
      else{response=await hydrateExperienceImagesWithCards(handled.response,url,definitionSlug);if(action==="INIT"&&sessionId&&!isReplay)await sb.rpc("mark_experience_session_open_v1",{p_session_id:sessionId,p_provider_session_id:null});}
      if(sessionId)await sb.rpc("record_whatsapp_flow_exchange_v1",{p_session_id:sessionId,p_request_id:requestId,p_action:safeAction(action||"unknown"),p_screen:screen,p_status:eventStatus,p_error_code:errorCode,p_is_replay:isReplay});
    }

    const encrypted=await encryptFlowResponse(response,decrypted.aesKeyBytes,decrypted.initialVectorBytes);
    return plain(encrypted,200);
  }catch(error){
    const e=error instanceof FlowCryptoError?error:new FlowCryptoError(500,"flow_endpoint_error","Flow endpoint error.");
    console.error(JSON.stringify({request_id:requestId,error_code:e.code,status:e.statusCode}));
    return plain(e.code,e.statusCode);
  }
});
