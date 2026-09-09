import {FLOW_IMAGE_LIMITS,isAllowedProductImageUrl,sniffFlowImageKind,transcodeFlowImageToJpeg} from "./image.ts";

const assert=(condition:unknown,message:string)=>{if(!condition)throw new Error(message);};
const fromBase64=(value:string)=>Uint8Array.from(atob(value),char=>char.charCodeAt(0));

Deno.test("flow image signatures are deterministic",()=>{
  const webp=fromBase64("UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAIAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=");
  assert(sniffFlowImageKind(webp)==="webp","webp_signature_not_detected");
  assert(sniffFlowImageKind(new Uint8Array([0xff,0xd8,0xff,0x00]))==="jpeg","jpeg_signature_not_detected");
  assert(sniffFlowImageKind(new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))==="png","png_signature_not_detected");
  assert(sniffFlowImageKind(new TextEncoder().encode("....ftypavif...."))==="avif","avif_signature_not_detected");
});

Deno.test("flow image source allowlist blocks arbitrary hosts",()=>{
  const supabaseUrl="https://ssbesxgaijknwsjbsbcz.supabase.co";
  assert(isAllowedProductImageUrl("https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/main/site/img/produto.webp",supabaseUrl),"repo_image_should_be_allowed");
  assert(isAllowedProductImageUrl("https://donaantonia.com.br/img/cesta.webp",supabaseUrl),"storefront_image_should_be_allowed");
  assert(isAllowedProductImageUrl("https://ssbesxgaijknwsjbsbcz.supabase.co/storage/v1/object/public/flow-cache/item.jpg",supabaseUrl),"project_storage_should_be_allowed");
  assert(!isAllowedProductImageUrl("https://example.com/item.webp",supabaseUrl),"arbitrary_host_should_be_blocked");
  assert(!isAllowedProductImageUrl("http://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/main/item.webp",supabaseUrl),"http_should_be_blocked");
});

Deno.test("selected WebP image is transcoded to WhatsApp-compatible JPEG",async()=>{
  const webp=fromBase64("UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAIAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=");
  const jpeg=await transcodeFlowImageToJpeg(webp);
  assert(jpeg instanceof Uint8Array&&jpeg.length>0,"webp_transcode_failed");
  assert(sniffFlowImageKind(jpeg!)==="jpeg","transcode_must_output_jpeg");
  assert(jpeg!.length<=FLOW_IMAGE_LIMITS.outputMaxBytes,"transcoded_image_exceeds_flow_limit");
  assert(FLOW_IMAGE_LIMITS.selectorOutputMaxBytes<100_000,"selector_image_limit_must_be_below_meta_limit");
});
