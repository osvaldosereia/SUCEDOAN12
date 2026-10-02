export function channelKeyFromPhone(value){
  const digits=String(value??'').replace(/\D+/g,'');
  if(digits.endsWith('0975'))return '0975';
  if(digits.endsWith('1018'))return '1018';
  return null;
}

export function sendSecretName(channel){
  if(channel==='0975')return 'PAPOAI_ATTENDANCE_SEND_0975_URL';
  if(channel==='1018')return 'PAPOAI_ATTENDANCE_SEND_1018_URL';
  return null;
}

export function controlSecretName(action){
  if(action==='takeover')return 'PAPOAI_ATTENDANCE_TAKEOVER_URL';
  if(action==='release')return 'PAPOAI_ATTENDANCE_RELEASE_URL';
  return null;
}

export function providerMessageId(payload){
  const candidates=[payload?.message_id,payload?.id,payload?.data?.message_id,payload?.data?.id,payload?.message?.id];
  for(const value of candidates){
    const id=String(value??'').trim();
    if(id)return id.slice(0,240);
  }
  return null;
}

export function sanitizeTransportError(value){
  return String(value??'transport_error')
    .replace(/[\r\n\t]+/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,180)||'transport_error';
}
