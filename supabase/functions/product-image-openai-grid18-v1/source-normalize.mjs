let magickPromise=null;
async function magick(){if(!magickPromise)magickPromise=(async()=>{const m=await import('npm:@imagemagick/magick-wasm@0.0.30');const wasm=await Deno.readFile(new URL('magick.wasm',import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.30')));await m.initializeImageMagick(wasm);return m;})();return magickPromise;}
const copy=d=>new Uint8Array(d);
async function sha256Hex(bytes){const d=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,'0')).join('');}

export async function normalizeExternalSource(source){
  const m=await magick();
  let width=Number(source?.width||0),height=Number(source?.height||0);
  const encode=(max,q)=>m.ImageMagick.read(source.bytes,img=>{
    if((img.width||0)>max||(img.height||0)>max)img.resize(new m.MagickGeometry(max,max));
    width=Number(img.width||width);height=Number(img.height||height);img.quality=q;
    return img.write(m.MagickFormat.WebP,d=>copy(d));
  });
  let bytes=encode(1600,82);
  if(bytes.length>480000)bytes=encode(1200,68);
  if(bytes.length>480000)bytes=encode(900,55);
  if(!bytes.length||bytes.length>495000)throw new Error(`normalized_source_size_${bytes.length}`);
  return{...source,bytes,type:'image/webp',width,height,sha256:await sha256Hex(bytes)};
}
