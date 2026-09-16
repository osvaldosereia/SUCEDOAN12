const count=(value,fallback=0)=>{const n=Number(value);return Number.isFinite(n)&&n>=0?Math.floor(n):fallback};

export function decideQueueTransition(job={},options={}){
  const status=String(job.status||'').trim().toLowerCase();
  const attemptCount=count(job.attempt_count,0);
  const maxAttempts=Math.max(1,count(job.max_attempts,3)||3);
  if(['queued','rendering','completed'].includes(status))return {ok:true,idempotent:true,status,attemptCount};
  if(job.requires_paid_approval===true&&options.paidApproved!==true)return {ok:false,error:'paid_approval_required',status,attemptCount};
  if(!['ready','failed'].includes(status))return {ok:false,error:'job_not_queueable',status,attemptCount};
  if(attemptCount>=maxAttempts)return {ok:false,error:'max_attempts_reached',status,attemptCount};
  return {ok:true,idempotent:false,status:'queued',attemptCount:attemptCount+1};
}
