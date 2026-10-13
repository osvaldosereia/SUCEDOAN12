// DA6 QA harness is deliberately DISABLED outside supervised synthetic tests.
// This is staging-only. Redeploy the verified test harness on explicit QA windows.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
Deno.serve((_request:Request)=>new Response(
 JSON.stringify({ok:false,error:'da6_staging_qa_harness_disabled'}),
 {status:410,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}
));