import type { ClassificationRuleInput, RevenueClassificationInput, RevenueClassificationResult, ReliefComponent } from './types.ts';

const isProfileValidated=(s:string)=>s==='auto_validated'||s==='validated';
const isRuleEffective=(r:ClassificationRuleInput,date:string)=>r.status==='active' && r.applicationMode==='strict_auto' && date>=r.effectiveFrom && (!r.effectiveTo||date<=r.effectiveTo) && !!r.evidence && Object.keys(r.evidence).length>0;
const review=(reason:string):RevenueClassificationResult=>({taxBucket:'manual_review',status:'manual_review',reliefComponents:[],tags:[],reason});

export function classifyRevenueLine(input:RevenueClassificationInput):RevenueClassificationResult {
  if(input.transactionKind==='cancellation') return {taxBucket:'cancellation',status:'classified',reliefComponents:[],tags:['cancellation']};
  if(input.transactionKind==='return') return {taxBucket:'return',status:'classified',reliefComponents:[],tags:['return']};
  if(!isProfileValidated(input.fiscalProfile.reviewStatus)) return review('fiscal profile review status is unresolved');

  const stStatus=input.fiscalProfile.stStatus;
  if(['candidate','unknown','conflict'].includes(stStatus)) return review(`ST status ${stStatus} requires review`);
  if(!['applicable','not_applicable'].includes(stStatus)) return review(`ST status ${stStatus||'missing'} requires review`);

  const stNeeded=stStatus==='applicable';
  if(stNeeded && !input.stRule) return review('ST rule missing for applicable profile');
  if(input.stRule && !isRuleEffective(input.stRule,input.date)) return review('ST rule is not effective/strictly validated for transaction date');
  if(input.monophaseRule && !isRuleEffective(input.monophaseRule,input.date)) return review('monophase rule is not effective/strictly validated for transaction date');

  const relief:ReliefComponent[]=[];
  const tags:string[]=[];
  const rules:ClassificationRuleInput[]=[];
  if(stNeeded && input.stRule){ relief.push('icms'); tags.push('icms_st'); rules.push(input.stRule); }
  if(input.monophaseRule){ relief.push('pis','cofins'); tags.push('monophase'); rules.push(input.monophaseRule); }

  if(rules.length){
    const primary=rules[0];
    return {
      taxBucket: stNeeded?'icms_st':'monophase',
      status:'classified',
      reliefComponents:relief,
      tags,
      ruleId:primary.id,
      ruleVersion:primary.version,
      additionalRules:rules.slice(1).map(r=>({id:r.id,version:r.version,taxBucket:r.taxBucket})),
      evidence:{rules:rules.map(r=>({id:r.id,version:r.version,evidence:r.evidence}))},
      confidence:Math.min(...rules.map(r=>Number(r.confidence??1)))
    };
  }
  return {taxBucket:'normal_resale',status:'classified',reliefComponents:[],tags:['normal_resale']};
}
