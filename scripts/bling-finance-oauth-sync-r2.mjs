const text=v=>String(v??'').trim();
const required=n=>{const v=text(process.env[n]);if(!v)throw new Error(`missing_${n}`);return v};
const API='https://api.bling.com.br/Api/v3';
const clientId=required('BLING_CLIENT_ID');
const clientSecret=required('BLING_CLIENT_SECRET');
const refreshToken=required('BLING_REFRESH_TOKEN');
const supabaseKey=required('SUPABASE_SERVICE_ROLE_KEY');
const supabaseUrl='https://ssbesxgaijknwsjbsbcz.supabase.co';
const basic=Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

const tokenRes=await fetch(`${API}/oauth/token`,{
  method:'POST',
  headers:{Authorization:`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json','enable-jwt':'1'},
  body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken})
});
const tokenRaw=await tokenRes.text();
let tokenData={};try{tokenData=tokenRaw?JSON.parse(tokenRaw):{}}catch{}
if(!tokenRes.ok||!text(tokenData.access_token))throw new Error(`oauth_refresh_http_${tokenRes.status}`);
const accessToken=text(tokenData.access_token);
const nextRefresh=text(tokenData.refresh_token)||refreshToken;
await Bun.write(process.env.BLING_REFRESH_TOKEN_FILE,nextRefresh);

const vaultRes=await fetch(`${supabaseUrl}/rest/v1/rpc/set_bling_api_refresh_token_v1`,{
  method:'POST',
  headers:{apikey:supabaseKey,Authorization:`Bearer ${supabaseKey}`,'Content-Type':'application/json',Accept:'application/json'},
  body:JSON.stringify({p_refresh_token:nextRefresh})
});
if(!vaultRes.ok)throw new Error(`supabase_refresh_token_store_http_${vaultRes.status}`);

const probes=[
  ['receivables','/contas/receber?pagina=1&limite=1&situacoes%5B%5D=1'],
  ['payables','/contas/pagar?pagina=1&limite=1&situacao=1'],
  ['financial_accounts','/contas-contabeis?pagina=1&limite=1&ocultarInvisiveis=true']
];
const results={};
for(const [name,path] of probes){
  const r=await fetch(API+path,{headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json','enable-jwt':'1'}});
  results[name]={ok:r.ok,http_status:r.status,scope_missing:r.status===403};
}
console.log(JSON.stringify({ok:Object.values(results).every(x=>x.ok),probes:results}));
if(!Object.values(results).every(x=>x.ok))process.exitCode=2;
