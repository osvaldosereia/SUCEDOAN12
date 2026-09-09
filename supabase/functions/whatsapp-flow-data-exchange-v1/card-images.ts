import {hydrateExperienceImages,loadFlowSelectorImageBase64} from "./image.ts";

const COMPACT_LIST_MAX_BASE64_CHARS=32_000;

function isUuid(value:string):boolean{
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

async function hydratePremiumProductOptions(items:unknown[],supabaseUrl:string):Promise<unknown[]>{
  return await mapLimited(items.slice(0,20),4,async(item)=>{
    if(!item||typeof item!=="object"||Array.isArray(item))return item;
    const option={...(item as Record<string,unknown>)};
    const imageUrl=String(option.image_url||"").trim().slice(0,2000);
    const productId=String(option.id||"").trim();
    delete option.image_url;
    if(imageUrl){
      const assetKey=isUuid(productId)?`products/${productId}.jpg`:null;
      const image=await loadFlowSelectorImageBase64(imageUrl,supabaseUrl,assetKey);
      // 20 visual rows must stay safely below the Flow Data Channel payload ceiling.
      // If a source cannot be compacted enough, keep the row but omit only its image.
      if(image&&image.length<=COMPACT_LIST_MAX_BASE64_CHARS)option.image=image;
    }
    return option;
  });
}

export async function hydrateExperienceImagesWithCards(response:unknown,supabaseUrl:string):Promise<unknown>{
  const hydrated=await hydrateExperienceImages(response,supabaseUrl);
  if(!hydrated||typeof hydrated!=="object"||Array.isArray(hydrated))return hydrated;
  const obj=hydrated as Record<string,unknown>;
  if(!obj.data||typeof obj.data!=="object"||Array.isArray(obj.data))return hydrated;
  const data=obj.data as Record<string,unknown>;
  const screen=String(obj.screen||"");

  // V27 premium list: one CheckboxGroup can render up to 20 compact horizontal
  // media rows. Images are hydrated server-side and individually budgeted.
  if(/^PRODUTOS_[ABC]$/.test(screen)&&Array.isArray(data.product_options)){
    data.product_options=await hydratePremiumProductOptions(data.product_options as unknown[],supabaseUrl);
    return hydrated;
  }

  // V26 compatibility: three standalone product cards remain untouched.
  if(!/^PRODUTOS_[ABC]$/.test(screen)||Array.isArray(data.products))return hydrated;

  await Promise.all([1,2,3].map(async(index)=>{
    const prefix=`p${index}`;
    const imageUrl=String(data[`${prefix}_image_url`]||"").trim().slice(0,2000);
    const productId=String(data[`${prefix}_id`]||"").trim();
    const visible=data[`${prefix}_visible`]===true;
    let image:string|null=null;
    if(visible&&imageUrl){
      const assetKey=isUuid(productId)?`products/${productId}.jpg`:null;
      image=await loadFlowSelectorImageBase64(imageUrl,supabaseUrl,assetKey);
    }
    data[`${prefix}_image_base64`]=image||"";
    data[`${prefix}_has_image`]=Boolean(image);
    delete data[`${prefix}_image_url`];
  }));
  return hydrated;
}
