import {hydrateExperienceImages,loadFlowCompatibleImageBase64} from "./image.ts";

const FALLBACK_IMAGE_BASE64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC";

function stripNavigationProductImages(items:unknown[]):unknown[]{
  return items.slice(0,20).map((item)=>{
    if(!item||typeof item!=="object"||Array.isArray(item))return item;
    const row={...(item as Record<string,unknown>)};
    const startRaw=row.start;
    if(startRaw&&typeof startRaw==="object"&&!Array.isArray(startRaw)){
      const start={...(startRaw as Record<string,unknown>)};
      delete start.src;
      delete start.image;
      delete start.image_url;
      if(Object.keys(start).length===0)delete row.start; else row.start=start;
    }
    delete row.image;
    delete row.image_url;
    return row;
  });
}

export async function hydrateExperienceImagesWithCards(response:unknown,supabaseUrl:string,definitionSlug:string|null=null):Promise<unknown>{
  if(!response||typeof response!=="object"||Array.isArray(response))return response;
  const hydrated=await hydrateExperienceImages(response,supabaseUrl);
  if(!hydrated||typeof hydrated!=="object"||Array.isArray(hydrated))return hydrated;
  const obj=hydrated as Record<string,unknown>;
  if(!obj.data||typeof obj.data!=="object"||Array.isArray(obj.data))return hydrated;
  const data=obj.data as Record<string,unknown>;
  const current=String(obj.screen||"");
  const candidate=definitionSlug==="flow-cestas-comercial-v5"||definitionSlug==="flow-cestas-comercial-v6";

  // Homologation isolation test: product lists render as text-only rows.
  // This deliberately removes every media field from NavigationList items.
  if(candidate&&/^PRODUTOS_[A-L]$/.test(current)&&Array.isArray(data.product_items)){
    data.product_items=stripNavigationProductImages(data.product_items as unknown[]);
    return hydrated;
  }

  // Product detail may still show one large image; list media is the variable under test.
  if(candidate&&/^PRODUTO_[A-L]$/.test(current)){
    const existing=String(data.product_image_base64||"").trim();
    if(existing){data.has_product_image=true;delete data.product_image_url;delete data.product_id;return hydrated;}
    const imageUrl=String(data.product_image_url||"").trim().slice(0,2000);
    const image=imageUrl?await loadFlowCompatibleImageBase64(imageUrl,supabaseUrl,null):null;
    data.product_image_base64=image||FALLBACK_IMAGE_BASE64;
    data.has_product_image=Boolean(image);
    delete data.product_image_url;
    delete data.product_id;
  }
  return hydrated;
}
