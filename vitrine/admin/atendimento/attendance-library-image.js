export const LIBRARY_IMAGE_MAX_DIMENSION=1920;
export const LIBRARY_THUMBNAIL_MAX_DIMENSION=320;
export const LIBRARY_IMAGE_TARGET_BYTES=1500*1024;
export const LIBRARY_IMAGE_MAX_BYTES=5*1024*1024;

const ALLOWED_IMAGE_MIME=new Set(['image/jpeg','image/png']);
const JPEG_MIN_QUALITY=.52;
const JPEG_START_QUALITY=.86;
const JPEG_QUALITY_STEP=.08;
const DOWNSCALE_STEP=.86;
const MIN_LONG_SIDE=720;
const STICKER_MAX_DIMENSION=512;
const STICKER_MAX_BYTES=1024*1024;

function fail(code){const error=new Error(code);error.code=code;throw error}
function canvas(width,height){const el=document.createElement('canvas');el.width=Math.max(1,Math.round(width));el.height=Math.max(1,Math.round(height));return el}
function fit(width,height,maxDimension){const longest=Math.max(width,height);if(longest<=maxDimension)return {width,height};const scale=maxDimension/longest;return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))}}
function baseName(name){const clean=String(name||'imagem').replace(/[\\/\u0000-\u001f\u007f]+/g,'_').trim()||'imagem';return clean.replace(/\.[^.]+$/,'').slice(0,180)||'imagem'}
function blobFromCanvas(source,type,quality){return new Promise((resolve,reject)=>source.toBlob(blob=>blob?resolve(blob):reject(Object.assign(new Error('library_image_encode_failed'),{code:'library_image_encode_failed'})),type,quality))}

async function decode(file){
  if(typeof createImageBitmap==='function'){
    try{return await createImageBitmap(file,{imageOrientation:'from-image'})}catch{}
  }
  return await new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(Object.assign(new Error('library_image_decode_failed'),{code:'library_image_decode_failed'}))};
    img.src=url;
  });
}

function draw(source,width,height){
  const target=canvas(width,height),ctx=target.getContext('2d',{alpha:true});
  if(!ctx)fail('library_image_encode_failed');
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,target.width,target.height);
  return target;
}

function hasAlpha(source){
  const ctx=source.getContext('2d',{willReadFrequently:true});if(!ctx)return false;
  const data=ctx.getImageData(0,0,source.width,source.height).data;
  for(let index=3;index<data.length;index+=4)if(data[index]!==255)return true;
  return false;
}

async function optimizedJpeg(source){
  let work=source;
  while(true){
    for(let quality=JPEG_START_QUALITY;quality>=JPEG_MIN_QUALITY-.001;quality-=JPEG_QUALITY_STEP){
      const blob=await blobFromCanvas(work,'image/jpeg',Math.max(JPEG_MIN_QUALITY,quality));
      if(blob.size<=LIBRARY_IMAGE_TARGET_BYTES||quality<=JPEG_MIN_QUALITY+.001)return {blob,canvas:work};
    }
    const longest=Math.max(work.width,work.height);
    if(longest<=MIN_LONG_SIDE)break;
    const nextLong=Math.max(MIN_LONG_SIDE,Math.floor(longest*DOWNSCALE_STEP));
    const dims=fit(work.width,work.height,nextLong);
    work=draw(work,dims.width,dims.height);
  }
  const blob=await blobFromCanvas(work,'image/jpeg',JPEG_MIN_QUALITY);
  return {blob,canvas:work};
}

async function optimizedPng(source){
  let work=source,blob=await blobFromCanvas(work,'image/png');
  while(blob.size>LIBRARY_IMAGE_MAX_BYTES&&Math.max(work.width,work.height)>MIN_LONG_SIDE){
    const nextLong=Math.max(MIN_LONG_SIDE,Math.floor(Math.max(work.width,work.height)*DOWNSCALE_STEP));
    const dims=fit(work.width,work.height,nextLong);work=draw(work,dims.width,dims.height);blob=await blobFromCanvas(work,'image/png');
  }
  return {blob,canvas:work};
}

async function optimizedStickerPng(source){
  let work=source,blob=await blobFromCanvas(work,'image/png');
  while(blob.size>STICKER_MAX_BYTES&&Math.max(work.width,work.height)>STICKER_MAX_DIMENSION){
    const nextLong=Math.max(STICKER_MAX_DIMENSION,Math.floor(Math.max(work.width,work.height)*DOWNSCALE_STEP));
    const dims=fit(work.width,work.height,nextLong);work=draw(work,dims.width,dims.height);blob=await blobFromCanvas(work,'image/png');
  }
  return {blob,canvas:work};
}

async function thumbnailFrom(source,preserveAlpha,name){
  const dims=fit(source.width,source.height,LIBRARY_THUMBNAIL_MAX_DIMENSION),thumbCanvas=draw(source,dims.width,dims.height);
  const type=preserveAlpha?'image/png':'image/jpeg';
  const blob=await blobFromCanvas(thumbCanvas,type,preserveAlpha?undefined:.78);
  const ext=preserveAlpha?'png':'jpg';
  return new File([blob],`${baseName(name)}-thumb.${ext}`,{type,lastModified:Date.now()});
}

export async function optimizeLibraryImage(file,options={}){
  if(!(file instanceof File))fail('library_image_unsupported');
  const mime=String(file.type||'').toLowerCase().split(';')[0];
  if(!ALLOWED_IMAGE_MIME.has(mime))fail('library_image_unsupported');
  if(file.size<1)fail('library_image_decode_failed');

  const maxDimension=Number(options.maxDimension)||LIBRARY_IMAGE_MAX_DIMENSION;
  const decoded=await decode(file).catch(error=>{throw error?.code?error:Object.assign(new Error('library_image_decode_failed'),{code:'library_image_decode_failed'})});
  try{
    const sourceWidth=Number(decoded.width||decoded.naturalWidth||0),sourceHeight=Number(decoded.height||decoded.naturalHeight||0);
    if(sourceWidth<1||sourceHeight<1)fail('library_image_decode_failed');
    const sticker=options.sticker===true;
    const dims=fit(sourceWidth,sourceHeight,sticker?STICKER_MAX_DIMENSION:Math.min(LIBRARY_IMAGE_MAX_DIMENSION,Math.max(320,maxDimension)));
    const initial=draw(decoded,dims.width,dims.height);
    const preserveAlpha=mime==='image/png'&&(sticker||hasAlpha(initial));
    const optimized=preserveAlpha?(sticker?await optimizedStickerPng(initial):await optimizedPng(initial)):await optimizedJpeg(initial);
    if(!optimized?.blob||optimized.blob.size<1)fail('library_image_encode_failed');
    if(optimized.blob.size>(sticker?STICKER_MAX_BYTES:LIBRARY_IMAGE_MAX_BYTES))fail(sticker?'library_sticker_too_large':'library_image_too_large');

    const outputType=preserveAlpha?'image/png':'image/jpeg',ext=preserveAlpha?'png':'jpg';
    const outputFile=new File([optimized.blob],`${baseName(file.name)}.${ext}`,{type:outputType,lastModified:Date.now()});
    const thumbnail=await thumbnailFrom(optimized.canvas,preserveAlpha,file.name);
    return {
      file:outputFile,
      thumbnail,
      originalBytes:file.size,
      storedBytes:outputFile.size,
      width:optimized.canvas.width,
      height:optimized.canvas.height,
      mimeType:outputType,
      hasAlpha:preserveAlpha,
    };
  }catch(error){
    if(error?.code)throw error;
    throw Object.assign(new Error('library_image_optimize_failed'),{code:'library_image_optimize_failed'});
  }finally{
    if(typeof decoded?.close==='function')decoded.close();
  }
}
