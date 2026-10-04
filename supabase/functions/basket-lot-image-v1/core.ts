export const IMAGE_MODEL='gpt-image-2.5-flare';
export const MAX_IMAGE_BYTES=50_000;
export function sourceAllowed(raw:string){try{const u=new URL(raw);return u.protocol==='https:'&&['ssbesxgaijknwsjbsbcz.supabase.co','donaantonia.com.br','www.donaantonia.com.br','raw.githubusercontent.com'].includes(u.hostname)&&!u.username&&!u.password&&!u.port}catch{return false}}
export function imageManifest(rows:any[]){
  const grouped=new Map<string,any>();
  for(const row of rows){
    const p=Array.isArray(row.product)?row.product[0]:row.product;
    const quantity=Number(row.quantity_per_basket);
    if(!Number.isInteger(quantity)||quantity<1||quantity>100)throw new Error('invalid_unit_quantity');
    if(!p?.image_url||!row.product_id)throw new Error('product_image_missing: '+(p?.name||row.product_id));
    const old=grouped.get(row.product_id);
    if(old){old.quantity+=quantity;if(old.quantity>100)throw new Error('invalid_unit_quantity')}
    else grouped.set(row.product_id,{product_id:row.product_id,name:String(p.name||'Produto').slice(0,240),image_url:p.image_url,packaging:p.packaging||'',quantity});
  }
  if(!grouped.size||grouped.size>32)throw new Error('unsupported_product_count');
  return [...grouped.values()];
}
export async function manifestHash(items:any[],lotId:string,hygieneId:string|null){
  const text=JSON.stringify({v:1,lotId,hygieneId,items:items.map(x=>[x.product_id,x.quantity,x.image_url])});
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function webpDimensions(bytes:Uint8Array){
  const s=(i:number,n:number)=>String.fromCharCode(...bytes.subarray(i,i+n));
  const u32=(i:number)=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(i,true);
  if(bytes.length<30||s(0,4)!=='RIFF'||s(8,4)!=='WEBP'||u32(4)!==bytes.length-8)return null;
  for(let i=12;i+8<=bytes.length;){
    const kind=s(i,4),length=u32(i+4),p=i+8;if(p+length>bytes.length)return null;
    if(kind==='VP8X'&&length>=10)return {width:1+bytes[p+4]+(bytes[p+5]<<8)+(bytes[p+6]<<16),height:1+bytes[p+7]+(bytes[p+8]<<8)+(bytes[p+9]<<16)};
    if(kind==='VP8 '&&length>=10&&bytes[p+3]===0x9d&&bytes[p+4]===0x01&&bytes[p+5]===0x2a)return {width:(bytes[p+6]|bytes[p+7]<<8)&0x3fff,height:(bytes[p+8]|bytes[p+9]<<8)&0x3fff};
    if(kind==='VP8L'&&length>=5&&bytes[p]===0x2f)return {width:1+((bytes[p+1]|bytes[p+2]<<8)&0x3fff),height:1+(((bytes[p+2]>>6)|(bytes[p+3]<<2)|(bytes[p+4]<<10))&0x3fff)};
    i=p+length+(length%2);
  }
  return null;
}
export function validFinalWebp(bytes:Uint8Array,width?:number){
  if(bytes.length<30||bytes.length>MAX_IMAGE_BYTES)return false;
  const d=webpDimensions(bytes);
  return Boolean(d&&d.width===d.height&&[512,640,768].includes(d.width)&&(width===undefined||width===d.width));
}
export function backgroundPrompt(){return 'Square photorealistic commercial photography background. Empty large light oak kitchen table fills the entire frame, seen from a slightly elevated near-front camera, neutral bright kitchen subtly visible only in the upper 8 percent. Soft diffuse natural window light from the left, fine realistic wood texture, crisp table surface, balanced warm neutral color. The table is completely empty and uncluttered: no products, no food, no packages, no dishes, no plants, no decorations, no hands, no people, no labels or text. This is a background plate for compositing real packaged grocery product photographs in evenly spaced rows; keep the table equally sharp from back to front, subtle perspective and no dramatic blur.'}
