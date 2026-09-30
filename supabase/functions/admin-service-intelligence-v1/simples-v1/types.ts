export type TaxBucket = 'normal_resale'|'icms_st'|'monophase'|'cancellation'|'return'|'manual_review';
export type ReliefComponent = 'icms'|'pis'|'cofins';
export type ClassificationStatus = 'classified'|'manual_review'|'blocked';

export type TaxShares = Record<string, number> & { icms?:number; pis?:number; cofins?:number };
export interface TaxBracket { min:number; max:number; nominalRate:number; deduction:number; shares:TaxShares }
export interface MonthlyRevenue { month:string; amount:number }
export interface Rbt12Result { complete:boolean; rbt12:number|null; missingMonths:string[]; months:MonthlyRevenue[] }
export interface TaxBaseInput { name:string; amount:number; reliefComponents:ReliefComponent[] }
export interface EffectiveRateInput { rbt12:number; brackets:TaxBracket[]; bases:TaxBaseInput[] }
export interface EffectiveRateBaseResult extends TaxBaseInput { taxableAmount:number; reliefShare:number; adjustedRate:number; taxAmount:number }
export interface EffectiveRateResult {
  rbt12:number;
  bracket:TaxBracket;
  nominalRate:number;
  deduction:number;
  effectiveRate:number;
  bases:EffectiveRateBaseResult[];
  estimatedDas:number;
}

export interface FiscalProfileInput { reviewStatus:string; stStatus:string }
export interface ClassificationRuleInput {
  id:string;
  version:number;
  taxBucket:'icms_st'|'monophase';
  applicationMode:string;
  status:string;
  effectiveFrom:string;
  effectiveTo?:string|null;
  confidence?:number|null;
  evidence?:Record<string,unknown>|null;
}
export interface RevenueClassificationInput {
  transactionKind:'sale'|'cancellation'|'return';
  date:string;
  fiscalProfile:FiscalProfileInput;
  stRule?:ClassificationRuleInput|null;
  monophaseRule?:ClassificationRuleInput|null;
}
export interface RevenueClassificationResult {
  taxBucket:TaxBucket;
  status:ClassificationStatus;
  reliefComponents:ReliefComponent[];
  tags:string[];
  ruleId?:string;
  ruleVersion?:number;
  additionalRules?:Array<{id:string;version:number;taxBucket:string}>;
  evidence?:Record<string,unknown>;
  confidence?:number|null;
  reason?:string;
}
