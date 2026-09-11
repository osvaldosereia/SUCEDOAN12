window.DA_ADMIN_V3_CONFIG = Object.freeze({
  supabaseUrl: 'https://ssbesxgaijknwsjbsbcz.supabase.co',
  supabasePublishableKey: 'sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8',
  edgeFunction: 'admin-ops-v1',
  basketsEdgeFunction: 'admin-baskets-v1',
  customerEdgeFunction: 'customer-intelligence-v1',
  countAppUrl: '../contagem/',
  build: '20260911-admin-simple-01'
});

(function reuseTrustedSession(){
  const adminKey='da_admin_v3_auth';
  const countKey='da_count_v2_auth';
  try{
    const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
    const admin=read(adminKey);
    const count=read(countKey);
    const usable=value=>value&&(value.access_token||value.refresh_token);
    if(!usable(admin)&&usable(count)) localStorage.setItem(adminKey,JSON.stringify(count));
  }catch{}
})();
