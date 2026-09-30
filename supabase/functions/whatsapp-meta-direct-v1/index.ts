import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() => new Response(
  JSON.stringify({ok:false,error:"retired_direct_meta_transport",replacement:"papoai_managed_transport"}),
  {status:410,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}}
));
