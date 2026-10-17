// Retired endpoint. Deliberately no owner session issuance or service-role access.
// Deploy ONLY together with the new admin login after email and redirect preflight.
const ORIGINS=new Set(['https://donaantonia.com.br','https://www.donaantonia.com.br']);
Deno.serve((request:Request)=>{
  const origin=request.headers.get('origin')||'';
  const headers:Record<string,string>={
    'Content-Type':'application/json',
    'Cache-Control':'no-store',
    'Vary':'Origin',
    'Access-Control-Allow-Headers':'content-type,apikey',
    'Access-Control-Allow-Methods':'POST,OPTIONS'
  };
  if(ORIGINS.has(origin))headers['Access-Control-Allow-Origin']=origin;
  if(request.method==='OPTIONS')
    return new Response(null,{status:204,headers});
  return new Response(JSON.stringify({ok:false,error:'authentication_flow_retired'}),{status:410,headers});
});
