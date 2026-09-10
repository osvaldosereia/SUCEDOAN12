const source=await Deno.readTextFile(new URL("./image.ts",import.meta.url));

const assert=(condition:unknown,message:string)=>{if(!condition)throw new Error(message);};

Deno.test("flow image pipeline stays lightweight and below Meta payload limits",()=>{
  assert(source.includes("FLOW_SELECTOR_IMAGE_MAX_BYTES=45_000"),"selector_limit_missing");
  assert(source.includes("FLOW_IMAGE_MAX_BYTES=80_000"),"image_limit_missing");
  assert(source.includes("FLOW_ASSET_BUCKET='whatsapp-flow-assets'"),"asset_bucket_missing");
});

Deno.test("runtime image hydration uses only the precompressed Supabase asset cache",()=>{
  assert(source.includes("loadFlowSelectorImageBase64(_imageUrl:string,supabaseUrl:string,assetKey?:string|null)"),"selector_loader_contract_missing");
  assert(source.includes("loadFlowCompatibleImageBase64(_imageUrl:string,supabaseUrl:string,assetKey?:string|null)"),"image_loader_contract_missing");
  assert(source.includes("fetchBase64(assetUrl(supabaseUrl,assetKey)"),"precompressed_cache_fetch_missing");
  assert(!source.includes("fetch(_imageUrl"),"original_image_url_must_not_be_fetched_at_runtime");
});

Deno.test("basket NavigationList receives cached image in the start.image contract",()=>{
  assert(source.includes("baskets/${stem}.jpg"),"basket_asset_key_missing");
  assert(source.includes("row.start={image,'alt-text'"),"navigation_start_image_contract_missing");
  assert(source.includes("items.slice(0,9)"),"basket_navigation_must_be_bounded_to_nine");
});
