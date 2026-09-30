from pathlib import Path

ADMIN = Path('vitrine/admin/index.html')
QUOTE = Path('orcamento/app-original.html')


def replace_between(text, start_marker, end_marker, replacement, label):
    start = text.find(start_marker)
    end = text.find(end_marker, start + len(start_marker))
    if start < 0 or end < 0:
        raise SystemExit(f'{label} markers missing')
    return text[:start] + replacement + text[end:]


admin = ADMIN.read_text(encoding='utf-8')

admin = replace_between(
    admin,
    '  async function api(',
    '  async function productImageApi(',
    """  async function api(action,params={},options={},retryAuth=true){
    const token=await adminStepUp();
    const u=new URL(API);u.searchParams.set('action',action);
    Object.entries(params).forEach(([k,v])=>{if(v!==''&&v!=null)u.searchParams.set(k,String(v))});
    const response=await fetch(u,{...options,headers:{...(options.headers||{}),'Authorization':'Bearer '+token},cache:'no-store'});
    if(response.status===401&&retryAuth){
      clearFinanceSession(token);
      return await api(action,params,options,false);
    }
    const data=await response.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!response.ok||data.ok===false)throw new Error(data.error||'service_error');
    return data;
  }
""",
    'admin api'
)

admin = replace_between(
    admin,
    '  async function productImageApi(',
    '  function productImageStatusText(',
    """  async function productImageApi(event,payload=null,retryAuth=true){
    const token=await adminStepUp();
    let response;
    if(payload instanceof FormData){
      response=await fetch(PRODUCT_IMAGE_API,{method:'POST',headers:{'Authorization':'Bearer '+token},body:payload,cache:'no-store'});
    }else{
      response=await fetch(PRODUCT_IMAGE_API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({event,...(payload||{})}),cache:'no-store'});
    }
    if(response.status===401&&retryAuth){
      clearFinanceSession(token);
      return await productImageApi(event,payload,false);
    }
    const data=await response.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!response.ok||data.ok===false)throw new Error(data.error||'product_image_service_error');
    return data;
  }
""",
    'product image api'
)

admin = replace_between(
    admin,
    '  async function customerApi(',
    '  async function storefrontApi(',
    """  async function customerApi(action,payload={},retryAuth=true){
    const token=await adminStepUp();
    const response=await fetch(CUSTOMER_API,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({action,...payload}),
      cache:'no-store'
    });
    if(response.status===401&&retryAuth){
      clearFinanceSession(token);
      return await customerApi(action,payload,false);
    }
    const data=await response.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!response.ok||data.ok===false)throw new Error(data.error||'service_error');
    return data;
  }
""",
    'customer api'
)

admin = replace_between(
    admin,
    '  function clearFinanceSession(',
    '  async function adminStepUp()',
    """  function clearFinanceSession(expectedToken=''){
    const current=financeSessionToken();
    if(expectedToken&&current&&current!==expectedToken)return false;
    sessionStorage.removeItem('da_finance_access_token_v1');
    state.financeCatalogs=null;
    return true;
  }
""",
    'clear finance session'
)

# Make the already-existing finance retry race-safe too: a late 401 from an old
# request must never erase a newer token created by another request.
admin = admin.replace(
    "if(response.status===401&&retryAuth){\n      clearFinanceSession();\n      return await financeApi(operation,payload,false);",
    "if(response.status===401&&retryAuth){\n      clearFinanceSession(token);\n      return await financeApi(operation,payload,false);",
    1,
)
admin = admin.replace(
    "if(response.status===401&&retryAuth){\n      clearFinanceSession();\n      return await financeOverviewApi(await financeStepUp(),false);",
    "if(response.status===401&&retryAuth){\n      clearFinanceSession(token);\n      return await financeOverviewApi(await financeStepUp(),false);",
    1,
)

ADMIN.write_text(admin, encoding='utf-8')

quote = QUOTE.read_text(encoding='utf-8')

quote = replace_between(
    quote,
    '    async function adminGet(',
    '        async function adminPost(',
    """    async function adminGet(action,params={},retryAuth=true){
      const token=await ensureAdminToken();
      const u=new URL(ADMIN_API);u.searchParams.set('action',action);
      Object.entries(params).forEach(([k,v])=>{if(v!==''&&v!=null)u.searchParams.set(k,String(v))});
      const r=await fetch(u,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
      if(r.status===401&&retryAuth){
        const current=adminToken();if(!current||current===token)sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        return await adminGet(action,params,false);
      }
      const data=await r.json().catch(()=>({ok:false,error:'invalid_response'}));
      if(!r.ok||data.ok===false)throw new Error(data.error||'admin_service_error');
      return data;
    }
""",
    'quote adminGet'
)

quote = replace_between(
    quote,
    '        async function adminPost(',
    'async function customerAdmin(',
    """    async function adminPost(action,payload={},retryAuth=true){
      const token=await ensureAdminToken();
      const u=new URL(ADMIN_API);u.searchParams.set('action',action);
      const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(payload),cache:'no-store'});
      if(r.status===401&&retryAuth){
        const current=adminToken();if(!current||current===token)sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        return await adminPost(action,payload,false);
      }
      const data=await r.json().catch(()=>({ok:false,error:'invalid_response'}));
      if(!r.ok||data.ok===false)throw new Error(data.error||'admin_service_error');
      return data;
    }
""",
    'quote adminPost'
)

quote = replace_between(
    quote,
    'async function customerAdmin(',
    '    async function lookupCnpj()',
    """    async function customerAdmin(action,payload={},retryAuth=true){
      const token=await ensureAdminToken();
      const r=await fetch(CUSTOMER_API,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...payload}),cache:'no-store'});
      if(r.status===401&&retryAuth){
        const current=adminToken();if(!current||current===token)sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        return await customerAdmin(action,payload,false);
      }
      const data=await r.json().catch(()=>({ok:false,error:'invalid_response'}));
      if(!r.ok||data.ok===false)throw new Error(data.error||'customer_service_error');
      return data;
    }
""",
    'quote customerAdmin'
)

QUOTE.write_text(quote, encoding='utf-8')
print('automatic session retry patch applied')
