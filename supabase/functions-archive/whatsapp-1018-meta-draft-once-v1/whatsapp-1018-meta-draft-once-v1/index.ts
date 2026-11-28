import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(()=>new Response(JSON.stringify({ok:false,error:"one_time_operation_closed"}),{status:410,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}}));
