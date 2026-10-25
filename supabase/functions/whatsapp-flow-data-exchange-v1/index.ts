import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const baseUrl=Deno.env.get('SUPABASE_URL')||'';
const SUPABASE_URL=baseUrl.endsWith('/')?baseUrl.slice(0,-1):baseUrl;
const TARGET=SUPABASE_URL+'/functions/v1/whatsapp-1018-basket-flow-v1';
const MAX_BODY_BYTES=90_000;

function deny(status,error){
 return new Response(JSON.stringify({ok:false,error}),{
  status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
 });
}

Deno.serve(async req=>{
 if(req.method!=='POST')return deny(405,'method_not_allowed');
 if(!SUPABASE_URL)return deny(503,'flow_endpoint_not_configured');

 let body;
 try{body=await req.text()}catch{return deny(400,'invalid_request_body')}
 if(!body||new TextEncoder().encode(body).byteLength>MAX_BODY_BYTES)return deny(413,'payload_too_large');

 const signature=req.headers.get('x-hub-signature-256')||'';
 let upstream;
 try{
  upstream=await fetch(TARGET,{
   method:'POST',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(9_000),
   headers:{
    'Content-Type':req.headers.get('content-type')||'application/json',
    'x-hub-signature-256':signature
   },
   body
  });
 }catch{
  console.error('flow_compat_forward_failed');
  return deny(503,'flow_endpoint_unavailable');
 }

 return new Response(upstream.body,{
  status:upstream.status,
  headers:{
   'Content-Type':upstream.headers.get('content-type')||'text/plain; charset=utf-8',
   'Cache-Control':'no-store'
  }
 });
});
