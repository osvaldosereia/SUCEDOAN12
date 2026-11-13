import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PROJECT_HOST="ssbesxgaijknwsjbsbcz.supabase.co";
const BUCKET="product-images";
const MODEL="gpt-image-2.5-sunburst";
const VALIDATOR_MODEL="gpt-5.6-luna";
const OPENAI_IMAGE_URL="https://api.openai.com/v1/images/edits";
const OPENAI_RESPONSES_URL="https://api.openai.com/v1/responses";
const MIN_FIDELITY=0.80;
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);

const cors=(req:Request)=>{
  const origin=req.headers.get("origin")||"";
  return {
    "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br",
    "Vary":"Origin",
    "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-admin-code",
    "Access-Control-Allow-Methods":"POST,OPTIONS"
  };
};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
const clean=(v:unknown,max=1000)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const obj=(v:unknown):Record<string,any>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,any>:{};
const arr=(v:unknown)=>Array.isArray(v)?v:[];
const score=(v:unknown)=>Math.max(0,Math.min(1,Number(v||0)));
const uuid=(v:unknown)=>{const s=clean(v,80);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:""};
function safeName(value:string){return clean(value,120).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,70)||"produto"}
function base64ToBytes(b64:string){const raw=atob(b64);const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
function bytesToBase64(bytes:Uint8Array){let binary="";const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));return btoa(binary)}
function paethPredictor(a:number,b:number,c:number){
  const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
  return pa<=pb&&pa<=pc?a:pb<=pc?b:c;
}
async function inspectPngTransparency(bytes:Uint8Array){
  const invalid=(reason:string)=>({transparent:false,compositionOkay:false,reason,transparentRatio:0,borderTransparentRatio:0,objectCoverage:0,centerDeviation:1});
  const signature=[137,80,78,71,13,10,26,10];
  if(bytes.length<45||!signature.every((value,index)=>bytes[index]===value))return invalid("png_signature_invalid");
  let width=0,height=0,bitDepth=-1,colorType=-1,interlace=-1,hasEnd=false;
  const idat:Uint8Array[]=[];
  let offset=8;
  while(offset+12<=bytes.length){
    const chunkLength=new DataView(bytes.buffer,bytes.byteOffset+offset,4).getUint32(0,false);
    if(chunkLength>bytes.length-offset-12)return invalid("png_chunk_invalid");
    const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
    if(type==="IHDR"){
      if(chunkLength<13)return invalid("png_header_invalid");
      const header=new DataView(bytes.buffer,bytes.byteOffset+offset+8,13);
      width=header.getUint32(0,false);height=header.getUint32(4,false);
      bitDepth=bytes[offset+16];colorType=bytes[offset+17];interlace=bytes[offset+20];
    }else if(type==="IDAT"){
      idat.push(bytes.subarray(offset+8,offset+8+chunkLength));
    }else if(type==="IEND"){
      hasEnd=true;break;
    }
    offset+=chunkLength+12;
  }
  const pixelCount=width*height;
  if(!hasEnd||!width||!height||width>4096||height>4096||pixelCount>16_777_216)return invalid("png_dimensions_invalid");
  const bytesPerPixel=colorType===6?4:colorType===4?2:0;
  if(bitDepth!==8||!bytesPerPixel||interlace!==0||!idat.length)return invalid("png_alpha_layout_unsupported");
  const compressedLength=idat.reduce((total,part)=>total+part.length,0);
  if(!compressedLength||compressedLength>14_000_000)return invalid("png_data_size_invalid");
  const compressed=new Uint8Array(compressedLength);let compressedOffset=0;
  for(const part of idat){compressed.set(part,compressedOffset);compressedOffset+=part.length;}
  let raw:Uint8Array;
  try{
    const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate"));
    raw=new Uint8Array(await new Response(stream).arrayBuffer());
  }catch{return invalid("png_decompression_failed");}
  const rowBytes=width*bytesPerPixel,expected=(rowBytes+1)*height;
  if(raw.length!==expected)return invalid("png_pixel_data_invalid");
  let inputOffset=0,transparentPixels=0,visiblePixels=0,borderTransparent=0,borderPixels=0;
  let minX=width,minY=height,maxX=-1,maxY=-1;
  let previous=new Uint8Array(rowBytes);
  for(let y=0;y<height;y++){
    const filter=raw[inputOffset++];
    if(filter>4)return invalid("png_filter_invalid");
    const row=raw.slice(inputOffset,inputOffset+rowBytes);inputOffset+=rowBytes;
    for(let i=0;i<rowBytes;i++){
      const left=i>=bytesPerPixel?row[i-bytesPerPixel]:0;
      const up=previous[i];
      const upperLeft=i>=bytesPerPixel?previous[i-bytesPerPixel]:0;
      let predictor=0;
      if(filter===1)predictor=left;
      else if(filter===2)predictor=up;
      else if(filter===3)predictor=Math.floor((left+up)/2);
      else if(filter===4)predictor=paethPredictor(left,up,upperLeft);
      row[i]=(row[i]+predictor)&255;
    }
    for(let x=0;x<width;x++){
      const alpha=row[x*bytesPerPixel+bytesPerPixel-1];
      if(alpha<=16)transparentPixels++;
      if(alpha>=64)visiblePixels++;
      if(alpha>32){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
      if(x===0||x===width-1||y===0||y===height-1){
        borderPixels++;
        if(alpha<=16)borderTransparent++;
      }
    }
    previous=row;
  }
  const transparentRatio=transparentPixels/pixelCount;
  const borderTransparentRatio=borderPixels?borderTransparent/borderPixels:0;
  const visibleRatio=visiblePixels/pixelCount;
  const objectCoverage=maxX>=minX&&maxY>=minY?Math.max((maxX-minX+1)/width,(maxY-minY+1)/height):0;
  const centerX=maxX>=minX?(minX+maxX+1)/(2*width):0;
  const centerY=maxY>=minY?(minY+maxY+1)/(2*height):0;
  const centerDeviation=Math.max(Math.abs(centerX-0.5),Math.abs(centerY-0.5));
  const transparent=transparentRatio>=0.10&&borderTransparentRatio>=0.78&&visibleRatio>=0.01;
  const compositionOkay=objectCoverage>=0.35&&objectCoverage<=0.98&&centerDeviation<=0.18;
  let reason="ok";
  if(!transparent)reason="transparent_pixels_not_detected";
  else if(!compositionOkay)reason="object_composition_out_of_range";
  return {transparent,compositionOkay,reason,transparentRatio:Number(transparentRatio.toFixed(3)),borderTransparentRatio:Number(borderTransparentRatio.toFixed(3)),objectCoverage:Number(objectCoverage.toFixed(3)),centerDeviation:Number(centerDeviation.toFixed(3))};
}
function extFor(type:string){return type==="image/png"?"png":type==="image/jpeg"?"jpg":"webp"}
function contentTypeFor(url:string,header:string|null){
  const h=(header||"").split(";",1)[0].trim().toLowerCase();
  if(["image/png","image/jpeg","image/webp"].includes(h))return h;
  const p=url.toLowerCase();if(p.includes(".png"))return "image/png";if(p.includes(".jpg")||p.includes(".jpeg"))return "image/jpeg";return "image/webp";
}
function allowedSource(raw:string){
  try{const u=new URL(raw);return u.protocol==="https:"&&["ssbesxgaijknwsjbsbcz.supabase.co","donaantonia.com.br","www.donaantonia.com.br","raw.githubusercontent.com"].includes(u.hostname)}catch{return false}
}
async function fetchImage(url:string){
  if(!allowedSource(url))throw new Error("source_host_not_allowed");
  const r=await fetch(url,{headers:{"User-Agent":"DonaAntonia-ProductImageManual/1.0"},signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw new Error("source_http_"+r.status);
  const declared=Number(r.headers.get("content-length")||0);if(declared>6_000_000)throw new Error("source_too_large");
  const bytes=new Uint8Array(await r.arrayBuffer());if(!bytes.length||bytes.length>6_000_000)throw new Error("source_size_invalid");
  return {bytes,type:contentTypeFor(url,r.headers.get("content-type"))};
}
function verifyAdminCode(supplied:string|null):"valid"|"invalid"|"not_configured"{
  const expected=(Deno.env.get("DONA_ADMIN_CODE")||"").trim();
  if(expected.length<13||expected.length>128)return "not_configured";
  if(typeof supplied!=="string"||supplied.length!==expected.length)return "invalid";
  let mismatch=0;
  for(let index=0;index<expected.length;index++)mismatch|=expected.charCodeAt(index)^supplied.charCodeAt(index);
  return mismatch===0?"valid":"invalid";
}
async function adminAuth(req:Request,sb:any){
  const supplied=req.headers.get("x-admin-code");
  if(supplied!==null){
    const status=verifyAdminCode(supplied);
    if(status==="not_configured")return {ok:false,status:503,error:"admin_auth_not_configured"};
    if(status!=="valid")return {ok:false,status:401,error:"admin_code_invalid"};
    return {ok:true,role:"admin_code"};
  }
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false,status:401,error:"admin_auth_required"};
  const user=await sb.auth.getUser(token);
  if(user.error||!user.data?.user?.id)return {ok:false,status:401,error:"admin_session_invalid"};
  const q=await sb.from("admin_users").select("role,is_active").eq("user_id",user.data.user.id).maybeSingle();
  if(q.error)return {ok:false,status:500,error:"admin_lookup_failed"};
  if(!q.data?.is_active)return {ok:false,status:403,error:"admin_not_authorized"};
  if(String(q.data.role||"viewer")==="viewer")return {ok:false,status:403,error:"forbidden"};
  return {ok:true,user_id:user.data.user.id,role:q.data.role||"operator"};
}
async function openaiKey(sb:any){
  let key=Deno.env.get("OPENAI_API_KEY")||"";
  if(!key){try{const q=await sb.rpc("get_conversation_worker_provider_secret_v1");if(typeof q.data==="string")key=q.data}catch{}}
  return key;
}
function promptFor(p:any){
  const context=[clean(p?.name,240),clean(p?.brand,120),clean(p?.packaging,120),clean(p?.gtin,40)].filter(Boolean).join(" | ");
  return `Edite estritamente a FOTO ENVIADA para criar uma imagem quadrada profissional de catálogo do MESMO produto. A foto é a referência visual principal. Contexto apenas para identificação: ${context}. Preserve com máxima fidelidade o formato, proporções, marca, logotipo, rótulo, textos, cores, materiais, transparências, tampa, alça e todos os detalhes reais da embalagem. Não redesenhe nem invente textos, não troque marca, variante, sabor, peso ou conteúdo, e não remova partes do produto. Remova somente o fundo original. O fundo da imagem final deve ser totalmente transparente, com canal alfa real: sem branco, cinza, gradiente, cenário, mesa, chão, sombra, halo, quadriculado, pessoas, preço, selo, decoração ou objetos extras. Mostre somente um produto, inteiro, centralizado, sem cortes, ocupando aproximadamente 78% da largura ou altura e com margens transparentes uniformes de 8% a 12%. Iluminação neutra de estúdio, sem reflexos artificiais. Prioridade máxima: fidelidade à foto original e recorte limpo para catálogo.`;
}
async function generate(key:string,source:{bytes:Uint8Array,type:string},product:any){
  const form=new FormData();
  form.append("model",MODEL);form.append("prompt",promptFor(product));form.append("size","1024x1024");
  form.append("quality","high");form.append("output_format","png");form.append("background","transparent");
  form.append("image[]",new Blob([source.bytes],{type:source.type}),"produto."+extFor(source.type));
  const r=await fetch(OPENAI_IMAGE_URL,{method:"POST",headers:{Authorization:"Bearer "+key},body:form,signal:AbortSignal.timeout(115000)});
  const requestId=r.headers.get("x-request-id")||null;const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error("openai_http_"+r.status+"_"+clean(data?.error?.code||data?.error?.message||"error",120));
  const b64=clean(data?.data?.[0]?.b64_json,24_000_000);if(!b64)throw new Error("openai_empty_image");
  const bytes=base64ToBytes(b64);if(!bytes.length||bytes.length>14_000_000)throw new Error("openai_output_size_"+bytes.length);
  const transparency=await inspectPngTransparency(bytes);
  if(!transparency.transparent)throw new Error("openai_transparency_missing_"+transparency.reason);
  if(!transparency.compositionOkay)throw new Error("openai_composition_invalid_"+transparency.reason);
  return {bytes,transparency,usage:obj(data?.usage),requestId};
}
const validationSchema={type:"object",additionalProperties:false,properties:{
  pass:{type:"boolean"},fidelity_score:{type:"number",minimum:0,maximum:1},composition_score:{type:"number",minimum:0,maximum:1},
  background_score:{type:"number",minimum:0,maximum:1},critical_issue:{type:"string",maxLength:240}
},required:["pass","fidelity_score","composition_score","background_score","critical_issue"]};
function finalText(data:any){return arr(data?.output).filter((x:any)=>x?.type==="message").flatMap((x:any)=>arr(x?.content)).filter((x:any)=>x?.type==="output_text").map((x:any)=>String(x?.text||"")).join("").trim()}
async function validateGenerated(key:string,sourceUrl:string,generated:Uint8Array,transparency:any){
  const candidate="data:image/png;base64,"+bytesToBase64(generated);
  const body={model:VALIDATOR_MODEL,store:false,max_output_tokens:600,reasoning:{effort:"low"},input:[{role:"user",content:[
    {type:"input_text",text:"Compare a embalagem original com a imagem gerada e avalie somente a fidelidade do produto: marca, variante, formato e identidade. Uma rotina separada já verifica os pixels transparentes reais e se o produto está inteiro, centralizado e em tamanho adequado. NÃO avalie fundo, transparência, sombras, halo ou margens: PNGs transparentes podem aparecer pretos ou cinza no visualizador, e isso não significa que tenham fundo opaco. Não penalize pequenas diferenças em letras miúdas se a marca e a variante continuarem reconhecíveis. Marque pass=false e descreva um único motivo crítico somente se o produto/variante estiver errado, houver mudança material da embalagem, deformação importante ou parte ausente/cortada. Se não houver defeito crítico no produto, deixe critical_issue vazio. background_score é apenas diagnóstico e deve ser 1 quando não for possível avaliar."},
    {type:"input_image",image_url:sourceUrl,detail:"high"},{type:"input_image",image_url:candidate,detail:"high"}
  ]}],text:{format:{type:"json_schema",name:"product_image_validation",strict:true,schema:validationSchema}}};
  const r=await fetch(OPENAI_RESPONSES_URL,{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error("validator_http_"+r.status+"_"+clean(data?.error?.code||data?.error?.message||"error",120));
  const t=finalText(data);if(!t)throw new Error("validator_empty_output_"+clean(data?.status||"unknown",30));
  const trimmed=t.trim();
  const candidates=[trimmed];
  const firstBrace=trimmed.indexOf("{"),lastBrace=trimmed.lastIndexOf("}");
  if(firstBrace>=0&&lastBrace>firstBrace)candidates.push(trimmed.slice(firstBrace,lastBrace+1));
  let parsed:any=null;
  for(const candidate of candidates){try{parsed=JSON.parse(candidate);break}catch{}}
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)){
    const status=clean(data?.status||"unknown",30),reason=clean(data?.incomplete_details?.reason||"none",30);
    console.warn("product image validator returned non-JSON output",{status,reason,output_length:t.length});
    throw new Error("validator_invalid_json_"+status+"_"+reason);
  }
  const validation={pass:parsed?.pass===true,fidelity_score:score(parsed?.fidelity_score),composition_score:score(parsed?.composition_score),background_score:score(parsed?.background_score),critical_issue:clean(parsed?.critical_issue,240)};
  const normalizedIssue=validation.critical_issue.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase();
  const hasMaterialProductDefect=/(produto (errado|diferente)|marca (errada|trocada|diferente|alterada)|variante (errada|incorreta|diferente)|embalagem (deformada|alterada|diferente)|rotulo (alterado|diferente)|parte removida|faltando|cortado|deformado)/.test(normalizedIssue);
  const backgroundOnly=/(fundo|transpar|background|alpha|sombra|halo|cenario)/.test(normalizedIssue)&&!hasMaterialProductDefect;
  const compositionOnly=/(composicao|enquadramento|centraliz|margens?)/.test(normalizedIssue)&&!hasMaterialProductDefect;
  const criticalIssue=Boolean(validation.critical_issue)&&!backgroundOnly&&!compositionOnly;
  const accepted=validation.fidelity_score>=MIN_FIDELITY&&!criticalIssue&&transparency.transparent&&transparency.compositionOkay;
  return {accepted,validation:{...validation,transparency},usage:obj(data?.usage),responseId:clean(data?.id,180)};
}
async function productRow(sb:any,productId:string){
  const q=await sb.from("products").select("id,name,brand,packaging,gtin,price,cost,category,sales_category,storefront_category,image_url,image_original_url,image_ai_url,image_ai_status,image_ai_attempts,metadata").eq("id",productId).maybeSingle();
  if(q.error||!q.data)throw new Error("product_not_found");return q.data;
}
function sourceImageUrl(product:any){
  const current=clean(product?.image_url,1800);
  const original=clean(product?.image_original_url,1800);
  const generated=clean(product?.image_ai_url,1800);
  return generated&&current===generated?(original||current):(current||original);
}
async function uploadSource(req:Request,sb:any,auth:any){
  const form=await req.formData();
  const productId=uuid(form.get("product_id"));if(!productId)return json(req,{ok:false,error:"product_id_required"},400);
  const product=await productRow(sb,productId);
  const file=form.get("file");
  if(!(file instanceof File))return json(req,{ok:false,error:"image_file_required"},400);
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))return json(req,{ok:false,error:"unsupported_image_type"},415);
  if(file.size<=0||file.size>6_000_000)return json(req,{ok:false,error:"image_size_invalid"},413);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const path=`manual/original/${productId}/${Date.now()}-${safeName(product.name)}.${extFor(file.type)}`;
  const up=await sb.storage.from(BUCKET).upload(path,bytes,{contentType:file.type,cacheControl:"31536000",upsert:false});
  if(up.error)throw new Error("storage_"+clean(up.error.message,160));
  const publicUrl=sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const now=new Date().toISOString();
  const u=await sb.from("products").update({
    image_original_url:publicUrl,image_source_url:publicUrl,image_source_origin:"admin_upload",
    image_url:publicUrl,image_ai_url:null,image_ai_status:null,image_ai_model:null,image_ai_processed_at:null,
    image_ai_error:null,image_ai_validation:null,image_ai_pipeline_version:"manual-admin-v1",
    image_ai_admin_note:"Foto original enviada manualmente pelo cadastro do produto",
    image_ai_admin_updated_at:now,updated_at:now
  }).eq("id",productId);
  if(u.error)throw new Error("product_update_"+clean(u.error.message,160));
  return json(req,{ok:true,event:"upload_source",product_id:productId,image_url:publicUrl,image_original_url:publicUrl,storage_path:path});
}
async function standardize(req:Request,sb:any,auth:any,body:any){
  const productId=uuid(body?.product_id);if(!productId)return json(req,{ok:false,error:"product_id_required"},400);
  const product=await productRow(sb,productId);
  const sourceUrl=sourceImageUrl(product);if(!sourceUrl)return json(req,{ok:false,error:"product_image_missing"},409);
  const key=await openaiKey(sb);if(!key)return json(req,{ok:false,error:"openai_key_missing"},503);
  const now=new Date().toISOString();
  await sb.from("products").update({image_ai_status:"processing",image_ai_error:null,image_ai_pipeline_version:"manual-admin-v1",image_ai_admin_updated_at:now}).eq("id",productId);
  try{
    const source=await fetchImage(sourceUrl);
    const generated=await generate(key,source,product);
    const check=await validateGenerated(key,sourceUrl,generated.bytes,generated.transparency);
    if(!check.accepted){
      console.warn("product image rejected by quality review",{product_id:productId,validation:check.validation});
      throw new Error("visual_validation_failed_"+check.validation.fidelity_score.toFixed(2)+"_"+check.validation.composition_score.toFixed(2)+"_"+check.validation.background_score.toFixed(2)+"_"+clean(check.validation.critical_issue||"score",80));
    }
    const path=`openai/manual-v1/final/${productId}/${Date.now()}-${safeName(product.name)}.png`;
    const up=await sb.storage.from(BUCKET).upload(path,generated.bytes,{contentType:"image/png",cacheControl:"31536000",upsert:false});
    if(up.error)throw new Error("storage_"+clean(up.error.message,160));
    const publicUrl=sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const done=new Date().toISOString();
    const u=await sb.from("products").update({
      image_original_url:sourceUrl,image_source_url:sourceUrl,image_ai_url:publicUrl,image_url:publicUrl,image_ai_status:"completed",image_ai_model:MODEL,image_ai_processed_at:done,
      image_ai_attempts:Number(product.image_ai_attempts||0)+1,image_ai_error:null,image_ai_validation:check.validation,
      image_ai_pipeline_version:"manual-admin-v1",image_ai_manual_review_required:false,image_ai_manual_review_reason:null,
      image_ai_admin_note:"Imagem PNG transparente de catálogo gerada e validada a partir da foto original",image_ai_admin_updated_at:done,updated_at:done
    }).eq("id",productId);
    if(u.error)throw new Error("product_update_"+clean(u.error.message,160));
    return json(req,{ok:true,event:"standardize",product_id:productId,image_url:publicUrl,image_original_url:sourceUrl,model:MODEL,validator_model:VALIDATOR_MODEL,validation:check.validation,storage_path:path,request_id:generated.requestId});
  }catch(e){
    const message=clean(e instanceof Error?e.message:e,300);
    const current=await sb.from("products").select("image_ai_attempts").eq("id",productId).maybeSingle();
    await sb.from("products").update({image_ai_status:"error",image_ai_error:message,image_ai_attempts:Number(current.data?.image_ai_attempts||0)+1,image_ai_admin_updated_at:new Date().toISOString()}).eq("id",productId);
    return json(req,{ok:false,error:message},500);
  }
}

const identitySchema={type:"object",additionalProperties:false,properties:{
  name:{type:"string",maxLength:240},brand:{type:"string",maxLength:120},packaging:{type:"string",maxLength:120},
  sales_category:{type:"string",enum:["mercearia","limpeza_lavanderia","higiene_beleza","casa_pet"]},
  confidence:{type:"number",minimum:0,maximum:1},notes:{type:"string",maxLength:240}
},required:["name","brand","packaging","sales_category","confidence","notes"]};
async function identifyProduct(req:Request,sb:any,body:any){
  const productId=uuid(body?.product_id);if(!productId)return json(req,{ok:false,error:"product_id_required"},400);
  const product=await productRow(sb,productId);const sourceUrl=sourceImageUrl(product);if(!sourceUrl)return json(req,{ok:false,error:"product_image_missing"},409);
  const key=await openaiKey(sb);if(!key)return json(req,{ok:false,error:"openai_key_missing"},503);
  // fiscal fields are not inferred: NCM, CEST, custo e preco nunca saem desta analise visual.
  const request={model:VALIDATOR_MODEL,store:false,max_output_tokens:420,reasoning:{effort:"low"},input:[{role:"user",content:[
    {type:"input_text",text:"Identifique somente o que e visivel nesta foto real de produto de supermercado. Retorne o nome comercial completo, marca, embalagem/conteudo visivel e classifique em exatamente uma das categorias: mercearia, limpeza_lavanderia, higiene_beleza, casa_pet. Nao invente NCM, CEST, custo, preco, peso ou variante que nao estejam visiveis. Se houver duvida, use confidence baixa e explique em notes."},
    {type:"input_image",image_url:sourceUrl,detail:"high"}
  ]}],text:{format:{type:"json_schema",name:"product_visual_identity",strict:true,schema:identitySchema}}};
  const r=await fetch(OPENAI_RESPONSES_URL,{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify(request),signal:AbortSignal.timeout(60000)});
  const data=await r.json().catch(()=>({}));if(!r.ok)return json(req,{ok:false,error:"identify_http_"+r.status+"_"+clean(data?.error?.message||"error",120)},502);
  const t=finalText(data);let parsed:any;try{parsed=JSON.parse(t)}catch{return json(req,{ok:false,error:"identify_invalid_json"},502)}
  const name=clean(parsed?.name,240),brand=clean(parsed?.brand,120),packaging=clean(parsed?.packaging,120),cat=clean(parsed?.sales_category,40),confidence=score(parsed?.confidence);
  if(!name||!["mercearia","limpeza_lavanderia","higiene_beleza","casa_pet"].includes(cat))return json(req,{ok:false,error:"identify_incomplete"},409);
  const labels:any={mercearia:"Mercearia",limpeza_lavanderia:"Limpeza/Lavanderia",higiene_beleza:"Higiene/Beleza",casa_pet:"Casa/Pet"};
  const placeholder=/^(Produto EAN|EAN)\s+\d+$/i.test(clean(product.name,240));
  const patch:any={sales_category:cat,storefront_category:cat,updated_at:new Date().toISOString(),metadata:{...obj(product.metadata),visual_identity:{confidence,notes:clean(parsed?.notes,240),model:VALIDATOR_MODEL,identified_at:new Date().toISOString()}}};
  if(placeholder||!clean(product.name,240))patch.name=name;if(!clean(product.brand,120)&&brand)patch.brand=brand;if(!clean(product.packaging,120)&&packaging)patch.packaging=packaging;if(!clean(product.category,120))patch.category=labels[cat];
  const u=await sb.from("products").update(patch).eq("id",productId).select("id,name,brand,packaging,gtin,price,cost,category,sales_category,storefront_category,image_url,image_original_url,image_ai_status").single();
  if(u.error)return json(req,{ok:false,error:"product_update_"+clean(u.error.message,160)},500);
  return json(req,{ok:true,event:"identify",product:u.data,identity:{name,brand,packaging,sales_category:cat,confidence,notes:clean(parsed?.notes,240)},response_id:clean(data?.id,180)});
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"",serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!supabaseUrl||!serviceKey)return json(req,{ok:false,error:"server_config"},500);
  const sb=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  let event="";
  const ct=req.headers.get("content-type")||"";
  if(ct.includes("multipart/form-data")){
    const auth=await adminAuth(req,sb);if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);
    try{return await uploadSource(req,sb,auth)}catch(e){return json(req,{ok:false,error:clean(e instanceof Error?e.message:e,300)},500)}
  }
  let body:any={};try{body=await req.json()}catch{return json(req,{ok:false,error:"invalid_json"},400)}
  event=clean(body?.event,60);
  if(event==="healthcheck"){
    const key=await openaiKey(sb);
    return json(req,{ok:true,event:"healthcheck",provider_configured:Boolean(key),model:MODEL,validator_model:VALIDATOR_MODEL,bucket:BUCKET,manual_only:true});
  }
  const auth=await adminAuth(req,sb);if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);
  if(event==="identify"){try{return await identifyProduct(req,sb,body)}catch(e){return json(req,{ok:false,error:clean(e instanceof Error?e.message:e,300)},500)}}
  if(event==="standardize"){
    try{return await standardize(req,sb,auth,body)}catch(e){return json(req,{ok:false,error:clean(e instanceof Error?e.message:e,300)},500)}
  }
  return json(req,{ok:false,error:"unknown_event"},400);
});