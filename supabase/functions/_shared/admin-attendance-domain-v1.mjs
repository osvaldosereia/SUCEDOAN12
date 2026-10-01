export function validUuid(value){
  const s=String(value??'').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null;
}

export function attendanceFilter(value){
  const v=String(value??'all').trim().toLowerCase();
  return v==='unread'||v==='human'?v:'all';
}

export function serviceWindowState(lastInboundIso,nowIso=new Date().toISOString()){
  const last=Date.parse(String(lastInboundIso??''));
  const now=Date.parse(String(nowIso??''));
  if(!Number.isFinite(last)||!Number.isFinite(now))return {open:false,expires_at:null,remaining_seconds:0};
  const expires=last+24*60*60*1000;
  const remaining=Math.max(0,Math.floor((expires-now)/1000));
  return {open:now<expires,expires_at:new Date(expires).toISOString(),remaining_seconds:remaining};
}

export function maskDocument(value){
  const digits=String(value??'').replace(/\D+/g,'');
  if(digits.length<4)return null;
  return '*'.repeat(digits.length-4)+digits.slice(-4);
}

export function normalizeProductQuery(value){
  const q=String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,80);
  return q.length>=2?q:null;
}
