export const IMAGE_MODEL='gpt-image-2.5-sunburst';
export const MAX_IMAGE_BYTES=150_000;
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
  const text=JSON.stringify({v:2,lotId,hygieneId,items:items.map(x=>[x.product_id,x.quantity,x.image_url,x.name,x.packaging])});
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
  return Boolean(d&&d.width===d.height&&[768,1024].includes(d.width)&&(width===undefined||width===d.width));
}
export function photographyPrompt(items:any[],paired=false){return `Create one square, ultra-realistic commercial photograph of the EXACT packaged products in the supplied reference photographs, together on a real kitchen table. Imagine groceries have just arrived home and someone thoughtfully arranged the purchases together for a photograph. Finish like a premium advertising agency food/product photography shoot, with natural rather than theatrical styling.
REFERENCES: ${paired?'Each input image is a REFERENCE BOARD with two separate product photographs: first at the top, second at the bottom. Read them in that order. The last board may have only one product. The boards are identity references only, NOT the final layout.':'Input images are individual product identity references in the exact order listed below.'}
${items.map((x,i)=>`${i+1}. ${JSON.stringify(String(x.name))}; package ${JSON.stringify(String(x.packaging||''))}; exactly ONE exemplar of this retail package in the photograph; quantity badge text: "${x.quantity} un.".`).join('\n')}
IDENTITY FIRST: preserve each reference product's brand, exact label artwork, lettering, colors, cap, wrapper, container geometry and package format. Do not invent alternate labels or substitute a similar product. Preserve believable physical proportions BETWEEN products: use the named weights and volumes as scale cues, e.g. a 2 L bottle is larger than a 500 ml bottle, a toothpaste carton and a soap bar are much smaller than a detergent bag. A multipack stays one intact multipack.
COMPOSITION: a single cohesive three-dimensional arrangement. Larger packages naturally behind, smaller ones in front, subtly varied orientations, modest overlaps without hiding brands. All products rest physically on the SAME tabletop with convincing contact shadows, consistent camera perspective, gravity and scale. Keep every product recognizable and fully within the image. Do not use a grid, floating cutouts, collage, shelf or isolated catalog thumbnails. The group fills about 80 percent of the frame. No shopping basket, extra products, fruit, flowers, people or hands.
CAMERA AND LIGHT: elevated three-quarter frontal view, realistic 50 mm product photography, soft large studio key light from the left and gentle fill, coherent shadows, controlled highlights on plastic, paper and metal, fine real table texture, neutral clean kitchen softly out of focus in the background. Tack-sharp product packaging and readable labels, natural color, realistic dynamic range, no exaggerated gloss or CGI appearance.
QUANTITIES: show only ONE exemplar per listed product, even if quantity is greater than one. Add a small discreet flat warm-white badge with dark green typography beside EACH product, reading its exact quantity badge text above. Keep each badge visibly associated with its product; never cover its label. These are small graphic annotations, not physical product labels. No headings, slogan or footer. Photograph the complete scene, not an empty background.`}
