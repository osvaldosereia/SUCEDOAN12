const count=(value,fallback=0)=>{const n=Number(value);return Number.isFinite(n)&&n>=0?Math.floor(n):fallback};
const iso=(value)=>{const d=new Date(value||Date.now());return Number.isFinite(d.getTime())?d.toISOString():new Date().toISOString()};

export function decideQueueTransition(job={},options={}){
  const status=String(job.status||'').trim().toLowerCase();
  const attemptCount=count(job.attempt_count,0);
  const maxAttempts=Math.max(1,count(job.max_attempts,3)||3);
  const action=String(options.action||'queue').toLowerCase();

  if(action==='claim'){
    if(status!=='queued')return {ok:true,idempotent:true,status,attemptCount};
    if(attemptCount>=maxAttempts)return {ok:false,error:'max_attempts_reached',status,attemptCount};
    const workerId=String(options.workerId||'').trim();
    if(!workerId)return {ok:false,error:'worker_id_required',status,attemptCount};
    const claimedAt=iso(options.now);
    const leaseSeconds=Math.min(3600,Math.max(60,count(options.leaseSeconds,900)||900));
    const leaseExpiresAt=new Date(new Date(claimedAt).getTime()+leaseSeconds*1000).toISOString();
    return {ok:true,idempotent:false,status:'rendering',attemptCount:attemptCount+1,workerId,claimedAt,leaseExpiresAt};
  }

  if(action==='recover'){
    if(status!=='rendering')return {ok:true,idempotent:true,status,attemptCount};
    const expires=Date.parse(String(job.lease_expires_at||''));
    const current=Date.parse(iso(options.now));
    if(!Number.isFinite(expires)||expires>current)return {ok:true,idempotent:true,status,attemptCount};
    const exhausted=attemptCount>=maxAttempts;
    return {ok:true,idempotent:false,status:exhausted?'failed':'queued',attemptCount,workerId:null,leaseExpiresAt:null,lastError:'worker_lease_expired',exhausted};
  }

  if(['queued','rendering','completed'].includes(status))return {ok:true,idempotent:true,status,attemptCount};
  if(job.requires_paid_approval===true&&options.paidApproved!==true)return {ok:false,error:'paid_approval_required',status,attemptCount};
  if(!['ready','failed'].includes(status))return {ok:false,error:'job_not_queueable',status,attemptCount};
  if(attemptCount>=maxAttempts)return {ok:false,error:'max_attempts_reached',status,attemptCount};
  return {ok:true,idempotent:false,status:'queued',attemptCount};
}
