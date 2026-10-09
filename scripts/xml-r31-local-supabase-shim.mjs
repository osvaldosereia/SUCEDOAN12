// TEST-ONLY adapter for R31 local Edge smoke: prevents cold-start package CDN
// access while exercising the real index.ts auth() and XML apply gateway over
// local Supabase GoTrue/PostgREST. Never copied into a deploy artifact.
export function createClient(baseUrl,serviceKey){
  if(!baseUrl||!serviceKey)throw Error('local_service_env_missing');
  const headers={apikey:serviceKey,Authorization:'Bearer '+serviceKey};
  async function response(url,extra={}){
    try{
      const r=await fetch(url,{headers:{...headers,...(extra.headers||{})},signal:AbortSignal.timeout(5000)});
      const data=await r.json().catch(()=>null);
      return r.ok?{data,error:null}:{data:null,error:{message:String(data?.message||data?.msg||r.status)}};
    }catch(e){return {data:null,error:{message:String(e?.message||e)}}}
  }
  return {
    auth:{async getUser(token){
      if(typeof token!=='string'||!token)return {data:{user:null},error:{message:'no_jwt'}};
      const r=await response(baseUrl+'/auth/v1/user',{headers:{Authorization:'Bearer '+token}});
      return {data:{user:r.error?null:r.data},error:r.error};
    }},
    from(table){
      let cols='*',eqs=[],order=null,limit=null;
      const chain={
        select(v){cols=String(v);return chain},
        eq(k,v){eqs.push([String(k),String(v)]);return chain},
        order(k,o={}){order=String(k)+'.'+(o.ascending===false?'desc':'asc');return chain},
        limit(v){limit=Number(v);return chain},
        async execute(maybeSingle=false){
          const u=new URL(baseUrl+'/rest/v1/'+encodeURIComponent(table));
          u.searchParams.set('select',cols);
          for(const [key,val] of eqs)u.searchParams.set(key,'eq.'+val);
          if(order)u.searchParams.set('order',order);
          if(limit!==null)u.searchParams.set('limit',String(limit));
          const r=await response(u.href);
          return {data:r.error?null:maybeSingle?(Array.isArray(r.data)?r.data[0]||null:null):r.data,error:r.error};
        },
        maybeSingle(){return chain.execute(true)},
        then(resolve,reject){return chain.execute(false).then(resolve,reject)}
      };
      return chain;
    },
    rpc(){return Promise.resolve({data:null,error:{message:'unexpected_rpc_in_test'}})}
  };
}
