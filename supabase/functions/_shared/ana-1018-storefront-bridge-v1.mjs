// Canonical read-only bridge to the existing storefront-v2 endpoint.
// No independent product table, price calculation, or inventory authority.
const ALLOWED=new Set(['products','offers','home','home_priority','product','basket','delivery_options']);
export async function fetch1018CanonicalStorefront({action,params={},fetcher=fetch,baseUrl='',timeoutMs=8000}={}){
 if(!ALLOWED.has(action))return {ok:false,reason:'action_not_allowed'};
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\/storefront-v2$/.test(baseUrl))
  return {ok:false,reason:'invalid_endpoint'};
 const u=new URL(baseUrl);u.searchParams.set('action',action);
 for(const [key,value] of Object.entries(params)){
  if(!['category','query','search','page','limit','product_id','basket_id'].includes(key))return {ok:false,reason:'invalid_param'};
  if(typeof value!=='string'&&typeof value!=='number')return {ok:false,reason:'invalid_param'};
  const val=String(value).slice(0,100);
  if(!val||/[\r\n]/.test(val))return {ok:false,reason:'invalid_param'};
  u.searchParams.set(key,val);
 }
 try{
  const res=await fetcher(u.toString(),{method:'GET',signal:AbortSignal.timeout(timeoutMs),headers:{Accept:'application/json'}});
  if(!res.ok)return {ok:false,reason:'canonical_unavailable',httpStatus:res.status};
  const data=await res.json();
  if(!data||data.ok!==true)return {ok:false,reason:'canonical_rejected'};
  return {ok:true,action,data,readOnly:true,canonical:true};
 }catch{return {ok:false,reason:'canonical_unavailable'};}
}
