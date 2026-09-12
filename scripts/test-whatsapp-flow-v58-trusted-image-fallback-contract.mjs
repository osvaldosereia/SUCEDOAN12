import fs from 'node:fs';

const file='supabase/functions/whatsapp-flow-data-exchange-v1/image.ts';
const source=fs.readFileSync(file,'utf8');
const required=[
  "const FLOW_IMAGE_MAX_BYTES=80_000",
  "redirect:'error'",
  "['image/jpeg','image/png','image/webp'].includes(type)",
  "u.hostname===project.hostname",
  "/storage\\/v1\\/object\\/public\\/(product-images|whatsapp-flow-assets)\\//",
  "u.hostname==='raw.githubusercontent.com'",
  "u.pathname.startsWith('/osvaldosereia/SUCEDOAN12/')",
  "const cached=await fetchBase64(assetUrl(supabaseUrl,assetKey),FLOW_IMAGE_MAX_BYTES)",
  "const trusted=trustedProductImageUrl(imageUrl,supabaseUrl)",
  "const direct=await fetchBase64(trusted,FLOW_IMAGE_MAX_BYTES)"
];
for(const needle of required){if(!source.includes(needle))throw new Error(`missing contract: ${needle}`);}
if(source.includes("fetch(imageUrl"))throw new Error('untrusted direct image fetch detected');
console.log('V58 trusted product image fallback contract: OK');
