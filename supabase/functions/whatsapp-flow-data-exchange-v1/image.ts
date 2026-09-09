const SOURCE_IMAGE_MAX_BYTES=2_000_000;
const FLOW_IMAGE_MAX_BYTES=300_000;
const FLOW_SELECTOR_IMAGE_MAX_BYTES=95_000;
const FLOW_IMAGE_TARGET_EDGE=420;
const FLOW_SELECTOR_TARGET_EDGE=320;
const FLOW_IMAGE_JPEG_QUALITY=78;
const FLOW_SELECTOR_JPEG_QUALITY=68;
const MAGICK_SPECIFIER="npm:@imagemagick/magick-wasm@0.0.43";
const MAGICK_WASM_SPECIFIER="npm:@imagemagick/magick-wasm@0.0.43/magick.wasm";
const FALLBACK_IMAGE_BASE64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

let magickModulePromise:Promise<any>|null=null;
let magickInitPromise:Promise<void>|null=null;

export type FlowImageKind="jpeg"|"png"|"webp"|"avif";

export function bytesToBase64(bytes:Uint8Array):string{
  let out="";
  for(let i=0;i<bytes.length;i+=0x8000){
    out+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));
  }
  return btoa(out);
}

function ascii(bytes:Uint8Array,start:number,length:number):string{
  return String.fromCharCode(...bytes.subarray(start,start+length));
}

export function sniffFlowImageKind(bytes:Uint8Array):FlowImageKind|null{
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return "jpeg";
  if(bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a)return "png";
  if(bytes.length>=12&&ascii(bytes,0,4)==="RIFF"&&ascii(bytes,8,4)==="WEBP")return "webp";
  if(bytes.length>=12&&ascii(bytes,4,4)==="ftyp"&&["avif","avis"].includes(ascii(bytes,8,4)))return "avif";
  return null;
}

export function isAllowedProductImageUrl(value:string,supabaseUrl:string):boolean{
  try{
    const imageUrl=new URL(value);
    if(imageUrl.protocol!=="https:")return false;
    if(imageUrl.hostname==="raw.githubusercontent.com"){
      return imageUrl.pathname.startsWith("/osvaldosereia/SUCEDOAN12/");
    }
    if(imageUrl.hostname==="donaantonia.com.br"||imageUrl.hostname==="www.donaantonia.com.br")return true;
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
      const wasmUrl=new URL(import.meta.resolve(MAGICK_WASM_SPECIFIER));
      const wasmBytes=await Deno.readFile(wasmUrl);
      await magick.initializeImageMagick(wasmBytes);
    })();
  }
  await magickInitPromise;
  return magick;
}

async function transcodeJpeg(bytes:Uint8Array,targetEdge:number,quality:number,maxBytes:number):Promise<Uint8Array|null>{
  try{
    const magick=await getMagick();
    const attempts=[
      {edge:targetEdge,q:quality},
      {edge:Math.max(220,Math.floor(targetEdge*0.82)),q:Math.max(54,quality-10)},
      {edge:220,q:50},
    ];
    for(const attempt of attempts){
      const result=await magick.ImageMagick.read(bytes,async(image:any):Promise<Uint8Array>=>{
        if(Number(image.width)>attempt.edge||Number(image.height)>attempt.edge)image.resize(attempt.edge,attempt.edge);
        image.quality=attempt.q;
        return await image.write(magick.MagickFormat.Jpeg,(data:Uint8Array)=>Uint8Array.from(data));
      });
      const output=result instanceof Uint8Array?result:Uint8Array.from(result||[]);
      if(output.length>0&&output.length<=maxBytes)return output;
    }
    return null;
  }catch{return null;}
}

export async function transcodeFlowImageToJpeg(bytes:Uint8Array):Promise<Uint8Array|null>{
  return await transcodeJpeg(bytes,FLOW_IMAGE_TARGET_EDGE,FLOW_IMAGE_JPEG_QUALITY,FLOW_IMAGE_MAX_BYTES);
}

async function fetchSourceImage(imageUrl:string,supabaseUrl:string):Promise<{bytes:Uint8Array;kind:FlowImageKind}|null>{
  if(!isAllowedProductImageUrl(imageUrl,supabaseUrl))return null;
  try{
    const response=await fetch(imageUrl,{method:"GET",redirect:"error",signal:AbortSignal.timeout(4500)});
    if(!response.ok)return null;
    const bytes=await readResponseBytesLimited(response);
    if(!bytes)return null;
    const kind=sniffFlowImageKind(bytes);
    return kind?{bytes,kind}:null;
  }catch{return null;}
}

export async function loadFlowCompatibleImageBase64(imageUrl:string,supabaseUrl:string):Promise<string|null>{
  const source=await fetchSourceImage(imageUrl,supabaseUrl);
  if(!source)return null;
  let output=source.bytes;
  if(source.kind==="webp"||source.kind==="avif"||output.length>FLOW_IMAGE_MAX_BYTES){
    const converted=await transcodeJpeg(source.bytes,FLOW_IMAGE_TARGET_EDGE,FLOW_IMAGE_JPEG_QUALITY,FLOW_IMAGE_MAX_BYTES);
    if(!converted)return null;
    output=converted;
  }
  return output.length<=FLOW_IMAGE_MAX_BYTES?bytesToBase64(output):null;
}

export async function loadFlowSelectorImageBase64(imageUrl:string,supabaseUrl:string):Promise<string|null>{
  const source=await fetchSourceImage(imageUrl,supabaseUrl);
  if(!source)return null;
  let output=source.bytes;
  if(source.kind==="webp"||source.kind==="avif"||output.length>FLOW_SELECTOR_IMAGE_MAX_BYTES){
    const converted=await transcodeJpeg(source.bytes,FLOW_SELECTOR_TARGET_EDGE,FLOW_SELECTOR_JPEG_QUALITY,FLOW_SELECTOR_IMAGE_MAX_BYTES);
    if(!converted)return null;
    output=converted;
  }
  return output.length<=FLOW_SELECTOR_IMAGE_MAX_BYTES?bytesToBase64(output):null;
}

async function mapLimited<T,R>(values:T[],limit:number,fn:(value:T,index:number)=>Promise<R>):Promise<R[]>{
  const output=new Array<R>(values.length);
  let cursor=0;
  const workers=Array.from({length:Math.min(limit,values.length)},async()=>{
    while(true){
      const index=cursor++;
      if(index>=values.length)return;
      output[index]=await fn(values[index],index);
    }
  });
  await Promise.all(workers);
  return output;
}

async function hydrateSelectorItems(items:unknown[],supabaseUrl:string,maxItems:number):Promise<unknown[]>{
  return await mapLimited(items.slice(0,maxItems),3,async(item)=>{
    if(!item||typeof item!=="object"||Array.isArray(item))return item;
    const option={...(item as Record<string,unknown>)};
    const imageUrl=String(option.image_url||"").trim().slice(0,2000);
    delete option.image_url;
    if(imageUrl){
      const image=await loadFlowSelectorImageBase64(imageUrl,supabaseUrl);
      if(image)option.image=image;
    }
    return option;
  });
}

export async function hydrateExperienceImages(response:unknown,supabaseUrl:string):Promise<unknown>{
  if(!response||typeof response!=="object"||Array.isArray(response))return response;
  const obj=response as Record<string,unknown>;
  if(!obj.data||typeof obj.data!=="object"||Array.isArray(obj.data))return response;
  const data=obj.data as Record<string,unknown>;
  const screen=String(obj.screen||"");

  if(screen==="CESTAS"&&Array.isArray(data.baskets)){
    data.baskets=await hydrateSelectorItems(data.baskets as unknown[],supabaseUrl,9);
  }

  if(/^PERSONALIZAR_[ABC]$/.test(screen)){
    if(Array.isArray(data.items)){
      data.items=await hydrateSelectorItems(data.items as unknown[],supabaseUrl,20);
    }
    const imageUrl=String(data.basket_image_url||"").trim().slice(0,2000);
    const image=imageUrl?await loadFlowCompatibleImageBase64(imageUrl,supabaseUrl):null;
    data.basket_image_base64=image||FALLBACK_IMAGE_BASE64;
    data.has_basket_image=Boolean(image);
    delete data.basket_image_url;
    return response;
  }

  if(/^PRODUTOS_[ABC]$/.test(screen)&&Array.isArray(data.products)){
    data.products=await hydrateSelectorItems(data.products as unknown[],supabaseUrl,12);
    return response;
  }

  if(screen==="UPSELL"&&Array.isArray(data.products)){
    data.products=await hydrateSelectorItems(data.products as unknown[],supabaseUrl,6);
    return response;
  }

  if(/^PRODUTO_[ABC]$/.test(screen)){
    const imageUrl=String(data.product_image_url||"").trim().slice(0,2000);
    const image=imageUrl?await loadFlowCompatibleImageBase64(imageUrl,supabaseUrl):null;
    data.product_image_base64=image||FALLBACK_IMAGE_BASE64;
    data.has_product_image=Boolean(image);
    delete data.product_image_url;
    return response;
  }

  return response;
}

export const FLOW_IMAGE_LIMITS={
  sourceMaxBytes:SOURCE_IMAGE_MAX_BYTES,
  outputMaxBytes:FLOW_IMAGE_MAX_BYTES,
  selectorOutputMaxBytes:FLOW_SELECTOR_IMAGE_MAX_BYTES,
  targetEdge:FLOW_IMAGE_TARGET_EDGE,
  selectorTargetEdge:FLOW_SELECTOR_TARGET_EDGE,
  jpegQuality:FLOW_IMAGE_JPEG_QUALITY,
  selectorJpegQuality:FLOW_SELECTOR_JPEG_QUALITY,
  magickVersion:"0.0.43",
} as const;
