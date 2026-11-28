const roleActions={
  viewer:new Set(['admin_load','admin_history']),
  editor:new Set(['admin_load','admin_history','admin_save_draft','admin_test']),
  admin:new Set(['admin_load','admin_history','admin_save_draft','admin_test']),
  owner:new Set(['admin_load','admin_history','admin_save_draft','admin_test','admin_publish','admin_rollback','admin_set_channel'])
};

export function anaAdminPermission(role,action){return Boolean(roleActions[String(role||'').toLowerCase()]?.has(String(action||'')))}

export async function authorizeAnaAdmin({authorization='',authClient,serviceClient}){
  const token=String(authorization||'').replace(/^Bearer\s+/i,'').trim();
  if(!token)return {ok:false,status:401,error:'admin_auth_required'};
  let auth;
  try{auth=await authClient.auth.getUser(token)}catch{return {ok:false,status:401,error:'admin_session_invalid'}}
  const userId=String(auth?.data?.user?.id||'');
  if(auth?.error||!/^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(userId))return {ok:false,status:401,error:'admin_session_invalid'};
  let row;
  try{row=await serviceClient.from('admin_users').select('role,is_active').eq('user_id',userId).maybeSingle()}catch{return {ok:false,status:403,error:'admin_not_authorized'}}
  if(row?.error||!row?.data||row.data.is_active!==true||!roleActions[String(row.data.role||'').toLowerCase()])return {ok:false,status:403,error:'admin_not_authorized'};
  return {ok:true,user_id:userId,role:String(row.data.role).toLowerCase()};
}

export function anaAdminActionStatus(permission,action){
  if(!permission?.ok)return permission?.status||401;
  return anaAdminPermission(permission.role,action)?200:403;
}
