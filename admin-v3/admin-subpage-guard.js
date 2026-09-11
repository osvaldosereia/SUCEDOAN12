(()=>{
  'use strict';
  try{
    const auth=JSON.parse(localStorage.getItem('da_admin_v3_auth')||'null');
    if(auth?.access_token||auth?.refresh_token)return;
  }catch{}
  const current=location.pathname.split('/').pop()||'index.html';
  location.replace(`./?next=${encodeURIComponent(current)}`);
})();
