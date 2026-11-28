import type { EffectiveRateInput, EffectiveRateResult, MonthlyRevenue, Rbt12Result, ReliefComponent } from './types.ts';

const round2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const monthKey=(d:Date)=>`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;

export function calculateRbt12(months:MonthlyRevenue[]):Rbt12Result {
  const normalized = months
    .filter(x=>/^\d{4}-\d{2}$/.test(x.month) && Number.isFinite(x.amount))
    .map(x=>({month:x.month,amount:Number(x.amount)}));
  const unique = new Map(normalized.map(x=>[x.month,x]));
  if (!unique.size) return {complete:false,rbt12:null,missingMonths:['12_month_history_required'],months:[]};
  const maxMonth=[...unique.keys()].sort().at(-1)!;
  const [y,m]=maxMonth.split('-').map(Number);
  const expected:string[]=[];
  for(let i=11;i>=0;i--){ expected.push(monthKey(new Date(Date.UTC(y,m-1-i,1)))); }
  const missing=expected.filter(k=>!unique.has(k));
  const selected=expected.filter(k=>unique.has(k)).map(k=>unique.get(k)!);
  if(missing.length || unique.size!==12) return {complete:false,rbt12:null,missingMonths:missing.length?missing:['history_must_contain_exactly_12_months'],months:selected};
  return {complete:true,rbt12:round2(selected.reduce((s,x)=>s+x.amount,0)),missingMonths:[],months:selected};
}

export function calculateEffectiveRate(input:EffectiveRateInput):EffectiveRateResult {
  const rbt12=Number(input.rbt12);
  if(!Number.isFinite(rbt12)||rbt12<=0) throw new Error('rbt12_must_be_positive');
  const bracket=input.brackets.find(b=>rbt12>=b.min && rbt12<=b.max);
  if(!bracket) throw new Error('simples_bracket_not_found');
  const effectiveRate=Math.max(0,(rbt12*bracket.nominalRate-bracket.deduction)/rbt12);
  const bases=input.bases.map(base=>{
    const taxableAmount=Math.max(0,Number(base.amount)||0);
    const relief=[...new Set(base.reliefComponents)] as ReliefComponent[];
    const reliefShare=Math.min(1, relief.reduce((s,k)=>s+Number(bracket.shares[k]||0),0));
    const adjustedRate=Math.max(0,effectiveRate*(1-reliefShare));
    return {...base,reliefComponents:relief,taxableAmount,reliefShare,adjustedRate,taxAmount:round2(taxableAmount*adjustedRate)};
  });
  return {
    rbt12,
    bracket,
    nominalRate:bracket.nominalRate,
    deduction:bracket.deduction,
    effectiveRate:Number(effectiveRate.toFixed(10)),
    bases,
    estimatedDas:round2(bases.reduce((s,b)=>s+b.taxAmount,0))
  };
}
