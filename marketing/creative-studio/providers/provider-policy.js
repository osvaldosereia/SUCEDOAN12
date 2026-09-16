export const PROVIDER_POLICY=Object.freeze({
  kenney:{mode:'AUTO',requiredLicense:'CC0',commercial:true},
  quaternius:{mode:'AUTO',requiredLicense:'CC0',commercial:true},
  polyhaven:{mode:'AUTO',requiredLicense:'CC0',commercial:true},
  opengameart:{mode:'VALIDATE',commercial:true},
  svgrepo:{mode:'VALIDATE',commercial:true},
  undraw:{mode:'VALIDATE',commercial:true}
});

export function canAcquire(provider,item={}){
  const policy=PROVIDER_POLICY[String(provider||'').toLowerCase()];
  if(!policy||policy.mode==='BLOCK')return {allowed:false,reason:'provider_blocked'};
  if(item.commercial_use_allowed!==true)return {allowed:false,reason:'commercial_use_not_verified'};
  if(!item.license_code||!item.license_url)return {allowed:false,reason:'license_proof_required'};
  if(policy.mode==='AUTO'&&policy.requiredLicense&&String(item.license_code).toUpperCase()!==policy.requiredLicense)return {allowed:false,reason:'license_mismatch'};
  if(policy.mode==='VALIDATE'&&item.license_validated!==true)return {allowed:false,reason:'per_item_validation_required'};
  return {allowed:true,reason:'license_verified'};
}
