const SOURCE_IMAGE_MAX_BYTES=2_000_000;
const FLOW_IMAGE_MAX_BYTES=300_000;
const FLOW_IMAGE_TARGET_EDGE=420;
const FLOW_IMAGE_JPEG_QUALITY=78;
const MAGICK_SPECIFIER="npm:@imagemagick/magick-wasm@0.0.43";

let magickModulePromise:Promise<any>|null=null;
let magickInitPromise:Promise<void>|null=null;

export type FlowImageKind="jpeg"|"png"|"webp";

export function bytesToBase64(bytes:Uint8Array):string{
  let out="";
  for(let i=0;i<bytes.length;i+=0x8000){
    out+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));
  }
  return btoa(out);
}

export function sniffFlowImageKind(bytes:Uint8Array):FlowImageKind|null{
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return "jpeg";
  if(bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a)return "png";
  if(bytes.length>=12&&bytes[0]===0x52&&bytes[1]===0x49&&bytes[2]===0x46&&bytes[3]===0x46&&bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50)return "webp";
  return null;
}

export function isAllowedProductImageUrl(value:string,supabaseUrl:string):boolean{
  try{
    const imageUrl=new URL(value);
    if(imageUrl.protocol!=="https:")return false;
    if(imageUrl.hostname==="raw.githubusercontent.com"){
      return imageUrl.pathname.startsWith("/osvaldosereia/SUCEDOAN12/");
    }
    const projectUrl=new URL(supabaseUrl);
    return imageUrl.hostname===projectUrl.hostname&&imageUrl.pathname.startsWith("/storage/v1/object/");
  }catch{return false;}
}

async function readResponseBytesLimited(response:Response,maxBytes=SOURCE_IMAGE_MAX_BYTES):Promise<Uint8Array|null>{
  const declared=Number(response.headers.get("content-length")||0);
  if(Number.isFinite(declared)&&declared>maxBytes)return null;
  if(!response.body)return null;
  const reader=response.body.getReader();
  const chunks:Uint8Array[]=[];
  let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      if(!value)continue;
      total+=value.byteLength;
      if(total>maxBytes){await reader.cancel("image_too_large");return null;}
      chunks.push(value);
    }
  }catch{
    try{await reader.cancel("image_read_failed");}catch{/* noop */}
    return null;
  }
  if(total===0)return null;
  const out=new Uint8Array(total);
  let offset=0;
  for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.byteLength;}
  return out;
}

async function getMagick():Promise<any>{
  if(!magickModulePromise)magickModulePromise=import(MAGICK_SPECIFIER);
  const magick=await magickModulePromise;
  if(!magickInitPromise){
    magickInitPromise=(async()=>{
      const wasmBytes=await Deno.readFile(new URL("magick.wasm",import.meta.resolve(MAGICK_SPECIFIER)));
      await magick.initializeImageMagick(wasmBytes);
    })();
  }
  await magickInitPromise;
  return magick;
}

export async function transcodeFlowImageToJpeg(bytes:Uint8Array):Promise<Uint8Array|null>{
  try{
    const magick=await getMagick();
    const result=magick.ImageMagick.read(bytes,(image:any):Uint8Array=>{
      if(Number(image.width)>FLOW_IMAGE_TARGET_EDGE||Number(image.height)>FLOW_IMAGE_TARGET_EDGE){
        image.resize(FLOW_IMAGE_TARGET_EDGE,FLOW_IMAGE_TARGET_EDGE);
      }
      image.quality=FLOW_IMAGE_JPEG_QUALITY;
      return image.write(magick.MagickFormat.Jpeg,(data:Uint8Array)=>Uint8Array.from(data));
    });
    const output=result instanceof Uint8Array?result:Uint8Array.from(result||[]);
    return output.length>0&&output.length<=FLOW_IMAGE_MAX_BYTES?output:null;
  }catch{return null;}
}

export async function loadFlowCompatibleImageBase64(imageUrl:string,supabaseUrl:string):Promise<string|null>{
  if(!isAllowedProductImageUrl(imageUrl,supabaseUrl))return null;
  try{
    const response=await fetch(imageUrl,{method:"GET",redirect:"error",signal:AbortSignal.timeout(3500)});
    if(!response.ok)return null;
    const source=await readResponseBytesLimited(response);
    if(!source)return null;
    const kind=sniffFlowImageKind(source);
    if(!kind)return null;
    let output=source;
    if(kind==="webp"||source.length>FLOW_IMAGE_MAX_BYTES){
      const converted=await transcodeFlowImageToJpeg(source);
      if(!converted)return null;
      output=converted;
    }
    if(output.length>FLOW_IMAGE_MAX_BYTES)return null;
    return bytesToBase64(output);
  }catch{return null;}
}

export async function hydrateProductImage(response:unknown,supabaseUrl:string):Promise<unknown>{
  if(!response||typeof response!=="object"||Array.isArray(response))return response;
  const obj=response as Record<string,unknown>;
  if(!/^PRODUTO(?:_[123])?$/.test(String(obj.screen||"")))return response;
  if(!obj.data||typeof obj.data!=="object"||Array.isArray(obj.data))return response;
  const data=obj.data as Record<string,unknown>;
  const imageUrl=String(data.product_image_url||"").trim().slice(0,2000);
  if(!imageUrl)return response;
  const base64=await loadFlowCompatibleImageBase64(imageUrl,supabaseUrl);
  if(!base64)return response;
  data.product_image_base64=base64;
  delete data.product_image_url;
  return response;
}

export const FLOW_IMAGE_LIMITS={
  sourceMaxBytes:SOURCE_IMAGE_MAX_BYTES,
  outputMaxBytes:FLOW_IMAGE_MAX_BYTES,
  targetEdge:FLOW_IMAGE_TARGET_EDGE,
  jpegQuality:FLOW_IMAGE_JPEG_QUALITY,
  magickVersion:"0.0.43",
} as const;
