import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const HEADERS={"Content-Type":"application/json","Cache-Control":"no-store"};
const clean=(v:unknown,max=4000)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max);
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
const firstNonEmpty=(...values:unknown[])=>{for(const v of values){const c=clean(v,4000);if(c)return c}return ""};

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const base=Deno.env.get("SUPABASE_URL");
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!base||!serviceKey)return json({ok:false,error:"server_config"},500);
  const bridgeKey=req.headers.get("x-da-ingest-key")||"";
  if(!bridgeKey)return json({ok:false,error:"unauthorized"},401);

  let form:FormData;
  try{form=await req.formData()}catch{return json({ok:false,error:"invalid_form"},400)}

  const genericCaption=clean(form.get("caption"),4000);
  const genericMediaId=clean(form.get("media_id"),240);
  const genericInteractiveId=clean(form.get("interactive_id"),4000);
  const genericInteractiveTitle=clean(form.get("interactive_title"),4000);
  const interactiveResponseJson=clean(form.get("interactive_response_json"),12000);

  const raw={
    waba_id:clean(form.get("waba_id"),100),
    phone_number_id:clean(form.get("phone_number_id"),100),
    display_phone_number:clean(form.get("display_phone_number"),40),
    contact_name:clean(form.get("contact_name"),160),
    from:clean(form.get("from"),40),
    message_id:clean(form.get("message_id"),240),
    timestamp:clean(form.get("timestamp"),80),
    message_type:clean(form.get("message_type"),30),
    text_body:clean(form.get("text_body"),4000),
    caption:firstNonEmpty(genericCaption,form.get("image_caption"),form.get("video_caption"),form.get("document_caption")),
    media_id:genericMediaId,
    audio_id:firstNonEmpty(form.get("audio_id"),genericMediaId),
    image_id:firstNonEmpty(form.get("image_id"),genericMediaId),
    video_id:firstNonEmpty(form.get("video_id"),genericMediaId),
    document_id:firstNonEmpty(form.get("document_id"),genericMediaId),
    interactive_type:clean(form.get("interactive_type"),40),
    interactive_id:firstNonEmpty(genericInteractiveId,form.get("button_reply_id"),form.get("list_reply_id")),
    interactive_title:firstNonEmpty(genericInteractiveTitle,form.get("button_reply_title"),form.get("list_reply_title")),
    interactive_response_json:interactiveResponseJson,
  };
  if(!raw.phone_number_id||!raw.from||!raw.message_id)return json({ok:false,error:"not_inbound_message",should_reply:false},200);

  const target=new URL("/functions/v1/whatsapp-ingest",base).toString();
  let upstream:Response;
  try{
    upstream=await fetch(target,{method:"POST",headers:{"Content-Type":"application/json","x-da-ingest-key":bridgeKey},body:JSON.stringify(raw),signal:AbortSignal.timeout(20000),redirect:"error"});
  }catch{return json({ok:false,error:"ingest_unavailable"},502)}
  const text=await upstream.text();
  let result:any;
  try{result=JSON.parse(text)}catch{return new Response(text,{status:upstream.status,headers:HEADERS})}

  if(upstream.ok&&interactiveResponseJson&&raw.interactive_type==="nfm_reply"&&result?.conversation_id&&result?.message_row_id){
    let response:any;
    try{response=JSON.parse(interactiveResponseJson)}catch{return json({...result,flow_reply:{ok:false,reason:"invalid_response_json"},should_reply:false,reply_type:"none"},200)}
    const supabase=createClient(base,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:flowReply,error:flowError}=await supabase.rpc("process_whatsapp_flow_nfm_reply_v1",{
      p_conversation_id:result.conversation_id,
      p_message_id:result.message_row_id,
      p_response:response,
    });
    if(flowError)return json({...result,flow_reply:{ok:false,reason:"flow_reply_processing_failed"},should_reply:false,reply_type:"none"},200);
    if(flowReply?.ok===true&&flowReply?.return_to_chat===true){
      return json({...result,flow_reply:flowReply,should_reply:true,reply_type:"text",reply_body:flowReply.reply_text||"Recebi suas escolhas. Vamos continuar por aqui.",action:"flow_nfm_reply",ai_job:null},200);
    }
    return json({...result,flow_reply:flowReply,should_reply:false,reply_type:"none",action:"flow_nfm_reply",ai_job:null},200);
  }

  return json(result,upstream.status);
});
