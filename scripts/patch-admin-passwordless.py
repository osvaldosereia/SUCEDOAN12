from pathlib import Path
import re

ADMIN=Path('vitrine/admin/index.html')
QUOTE=Path('orcamento/index.html')

s=ADMIN.read_text(encoding='utf-8')
start=s.find('  async function financeStepUp(){')
end=s.find('  async function financeApi(', start)
if start < 0 or end < 0:
    raise SystemExit('financeStepUp markers missing')
replacement="""  async function financeStepUp(){
    const existing=financeSessionToken();
    if(existing)return existing;
    if(state.financeAuthPromise)return await state.financeAuthPromise;
    state.financeAuthPromise=(async()=>{
      try{
        const authRes=await fetch(FINANCE_AUTH_API,{
          method:'POST',
          headers:{'Content-Type':'application/json','apikey':FINANCE_PUBLIC_KEY},
          body:JSON.stringify({pin:'000000'}),
          cache:'no-store'
        });
        const auth=await authRes.json().catch(()=>({}));
        if(!authRes.ok||!auth?.ok)throw new Error(auth?.error||'admin_auto_auth_failed');
        const verifyRes=await fetch(FINANCE_VERIFY_API,{
          method:'POST',
          headers:{'Content-Type':'application/json','apikey':FINANCE_PUBLIC_KEY},
          body:JSON.stringify({token_hash:auth.token_hash,type:auth.verification_type||'email'}),
          cache:'no-store'
        });
        const verified=await verifyRes.json().catch(()=>({}));
        const token=String(verified?.access_token||'').trim();
        if(!verifyRes.ok||!token)throw new Error(verified?.msg||verified?.error_description||verified?.error||'admin_auto_session_failed');
        sessionStorage.setItem('da_finance_access_token_v1',token);
        return token;
      }finally{
        state.financeAuthPromise=null;
      }
    })();
    return await state.financeAuthPromise;
  }
"""
s=s[:start]+replacement+s[end:]
s=re.sub(r"function currentOperator\(\)\{[^}]*\}","function currentOperator(){return 'Operação'}",s,count=1)
a=s.find('  function changeOperator(){')
b=s.find('  function requireOperator(){',a)
if a>=0 and b>=0:
    s=s[:a]+"  function changeOperator(){return 'Operação'}\n"+s[b:]
a=s.find('  function requireOperator(){')
b=s.find("  if($('#operatorBadge'))",a)
if a>=0 and b>=0:
    s=s[:a]+"  function requireOperator(){return 'Operação'}\n"+s[b:]
if '.operator-badge{display:none!important}' not in s:
    s=s.replace('    .mobile-product-card{display:none}','    .operator-badge{display:none!important}\n    .mobile-product-card{display:none}',1)
ADMIN.write_text(s,encoding='utf-8')

q=QUOTE.read_text(encoding='utf-8')
anchor="    const ADMIN_TOKEN_KEY='da_finance_access_token_v1';"
if anchor not in q:
    raise SystemExit('quote ADMIN_TOKEN_KEY missing')
extra="""
    const ADMIN_AUTH_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-pin-auth-v1';
    const ADMIN_VERIFY_API='https://ssbesxgaijknwsjbsbcz.supabase.co/auth/v1/verify';
    const ADMIN_PUBLIC_KEY='sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8';"""
if 'const ADMIN_AUTH_API=' not in q:
    q=q.replace(anchor,anchor+extra,1)
old="    function adminToken(){return String(sessionStorage.getItem(ADMIN_TOKEN_KEY)||'').trim()}"
if old not in q:
    raise SystemExit('quote adminToken marker missing')
new="""    function adminToken(){return String(sessionStorage.getItem(ADMIN_TOKEN_KEY)||'').trim()}
    let adminTokenPromise=null;
    async function ensureAdminToken(){
      const existing=adminToken();if(existing)return existing;
      if(adminTokenPromise)return await adminTokenPromise;
      adminTokenPromise=(async()=>{
        try{
          const ar=await fetch(ADMIN_AUTH_API,{method:'POST',headers:{'Content-Type':'application/json','apikey':ADMIN_PUBLIC_KEY},body:JSON.stringify({pin:'000000'}),cache:'no-store'});
          const a=await ar.json().catch(()=>({}));
          if(!ar.ok||!a?.ok)throw new Error(a?.error||'admin_auto_auth_failed');
          const vr=await fetch(ADMIN_VERIFY_API,{method:'POST',headers:{'Content-Type':'application/json','apikey':ADMIN_PUBLIC_KEY},body:JSON.stringify({token_hash:a.token_hash,type:a.verification_type||'email'}),cache:'no-store'});
          const v=await vr.json().catch(()=>({}));
          const token=String(v?.access_token||'').trim();
          if(!vr.ok||!token)throw new Error(v?.msg||v?.error_description||v?.error||'admin_auto_session_failed');
          sessionStorage.setItem(ADMIN_TOKEN_KEY,token);return token;
        }finally{adminTokenPromise=null}
      })();
      return await adminTokenPromise;
    }"""
q=q.replace(old,new,1)
q=q.replace("async function adminGet(action,params={}){const token=adminToken();if(!token)throw new Error('admin_session_required');","async function adminGet(action,params={}){const token=await ensureAdminToken();",1)
q=q.replace("async function adminPost(action,payload={}){const token=adminToken();if(!token)throw new Error('admin_session_required');","async function adminPost(action,payload={}){const token=await ensureAdminToken();",1)
q=q.replace("async function customerAdmin(action,payload={}){const token=adminToken();if(!token)throw new Error('admin_session_required');","async function customerAdmin(action,payload={}){const token=await ensureAdminToken();",1)
q=q.replace("if(!adminToken()){status.className='cnpj-lookup-status error';status.textContent='Abra Orçamentos pelo Vitrine/Admin para consultar o CNPJ.';return}","await ensureAdminToken();",1)
QUOTE.write_text(q,encoding='utf-8')
print('passwordless admin patch applied')
