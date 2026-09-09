import {hydrateExperienceImages,loadFlowSelectorImageBase64} from "./image.ts";

function isUuid(value:string):boolean{
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function hydrateExperienceImagesWithCards(response:unknown,supabaseUrl:string):Promise<unknown>{
  const hydrated=await hydrateExperienceImages(response,supabaseUrl);
  if(!hydrated||typeof hydrated!=="object"||Array.isArray(hydrated))return hydrated;
  const obj=hydrated as Record<string,unknown>;
  if(!obj.data||typeof obj.data!=="object"||Array.isArray(obj.data))return hydrated;
  const data=obj.data as Record<string,unknown>;
  const screen=String(obj.screen||"");
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
