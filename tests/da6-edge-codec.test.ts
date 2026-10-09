/* DA6 - independent PNG input + ImageMagick WASM JPEG/WebP decode.
 * Uses an ephemeral 512x768 image, no customer data and no Supabase credentials.
 */
import {decodeDA6ImagePixels} from '../supabase/functions/admin-products-live-v1/inventory-label-worker.ts';
import {ImageMagick,MagickFormat} from 'npm:@imagemagick/magick-wasm@0.0.44';
function check(condition:boolean,message:string){
 if(!condition)throw Error(message);
}
function crc32(bytes:Uint8Array):number{
 let c=0xffffffff;
 for(const b of bytes){
  c^=b;
  for(let i=0;i<8;i++)c=c&1?(c>>>1)^0xedb88320:c>>>1;
 }
 return (c^0xffffffff)>>>0;
}
function concat(...groups:Uint8Array[]):Uint8Array{
 const out=new Uint8Array(groups.reduce((n,x)=>n+x.length,0));
 let p=0;for(const x of groups){out.set(x,p);p+=x.length}return out;
}
function chunk(name:string,payload:Uint8Array){
 const type=new TextEncoder().encode(name);
 const header=new Uint8Array(4);new DataView(header.buffer).setUint32(0,payload.length);
 const checksum=new Uint8Array(4);new DataView(checksum.buffer).setUint32(0,crc32(concat(type,payload)));
 return concat(header,type,payload,checksum);
}
async function originalPng(width=512,height=768){
 const ihdr=new Uint8Array(13),view=new DataView(ihdr.buffer);
 view.setUint32(0,width);view.setUint32(4,height);
 ihdr[8]=8;ihdr[9]=6; // RGBA 8-bit
 const raw=new Uint8Array(height*(width*4+1));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const k=y*(width*4+1)+1+x*4;
  raw[k]=246;raw[k+1]=246;raw[k+2]=246;raw[k+3]=255;
 }
 const zipped=new Uint8Array(await new Response(
  new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))
 ).arrayBuffer());
 return concat(new Uint8Array([137,80,78,71,13,10,26,10]),
  chunk('IHDR',ihdr),chunk('IDAT',zipped),chunk('IEND',new Uint8Array()));
}
async function assertPixels(bytes:Uint8Array,label:string){
 const image=await decodeDA6ImagePixels(bytes);
 check(image.width===512&&image.height===768,label+': wrong dimension');
 check(image.data.length===512*768*4,label+': wrong RGBA byte count');
 check(image.data[3]===255,label+': invalid alpha channel');
 check(image.data[0]>220&&image.data[1]>220&&image.data[2]>220,label+': corrupted pixels');
}
Deno.test('DA6: PNG verdadeiro decodifica para RGBA no worker WASM',async()=>{
 const png=await originalPng();
 await assertPixels(png,'png');
});
Deno.test('DA6: JPEG e WebP verdadeiros decodificam para RGBA no worker WASM',async()=>{
 const png=await originalPng();
 await assertPixels(png,'base_png');
 for(const [name,format] of [['jpeg',MagickFormat.Jpeg],['webp',MagickFormat.WebP]] as const){
  const encoded=ImageMagick.read(png,img=>img.write(format,data=>new Uint8Array(data)));
  await assertPixels(new Uint8Array(encoded),name);
 }
});
