export interface MonthlyFiscalDocument { id:string|number; total:number }
export type MonthlyHistoryStatus='complete'|'incomplete'|'review_required'|'failed';
export interface MonthlyHistorySummary {
  competenceMonth:string;
  grossSales:number;
  returnsAmount:number;
  netRevenue:number;
  documentCount:number;
  returnDocumentCount:number;
  collectionStatus:MonthlyHistoryStatus;
  reviewReason:string|null;
  evidence:{sale_ids:string[];return_ids:string[]};
}
export interface MonthlyHistoryInput { competenceMonth:string; sales:MonthlyFiscalDocument[]; returns:MonthlyFiscalDocument[] }
export interface Rbt12HistoryRow { competenceMonth:string; netRevenue:number; collectionStatus:string }
export interface Rbt12HistoryResult { complete:boolean; rbt12:number|null; missingMonths:string[]; months:Array<{month:string;amount:number}> }

const round2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const validCompetence=(v:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export function priorTwelveCompetences(target:string):string[]{
  if(!validCompetence(target))throw new Error('invalid_competence');
  const [y,m]=target.split('-').map(Number),out:string[]=[];
  for(let i=12;i>=1;i--){
    const d=new Date(Date.UTC(y,m-1-i,1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`);
  }
  return out;
}

export function summarizeMonthlyRevenue(input:MonthlyHistoryInput):MonthlyHistorySummary{
  if(!validCompetence(input.competenceMonth))throw new Error('invalid_competence');
  const sales=Array.isArray(input.sales)?input.sales:[],returns=Array.isArray(input.returns)?input.returns:[];
  const invalid=[...sales,...returns].some(x=>!Number.isFinite(Number(x?.total))||Number(x?.total)<0);
  const base={
    competenceMonth:input.competenceMonth,
    documentCount:sales.length,
    returnDocumentCount:returns.length,
    evidence:{sale_ids:sales.map(x=>String(x.id)),return_ids:returns.map(x=>String(x.id))}
  };
  if(invalid)return {...base,grossSales:0,returnsAmount:0,netRevenue:0,collectionStatus:'incomplete' as const,reviewReason:'invalid_document_total'};
  const grossSales=round2(sales.reduce((s,x)=>s+Number(x.total),0));
  const returnsAmount=round2(returns.reduce((s,x)=>s+Number(x.total),0));
  if(returnsAmount>grossSales+0.01){
    return {...base,grossSales,returnsAmount,netRevenue:0,collectionStatus:'review_required',reviewReason:'return_carry_required'};
  }
  return {...base,grossSales,returnsAmount,netRevenue:round2(Math.max(0,grossSales-returnsAmount)),collectionStatus:'complete',reviewReason:null};
}

export function buildRbt12FromHistory(target:string,rows:Rbt12HistoryRow[]):Rbt12HistoryResult{
  const expected=priorTwelveCompetences(target),by=new Map<string,Rbt12HistoryRow>();
  for(const row of rows||[])if(validCompetence(row.competenceMonth)&&!by.has(row.competenceMonth))by.set(row.competenceMonth,row);
  const missing=expected.filter(m=>!by.has(m)||by.get(m)?.collectionStatus!=='complete'||!Number.isFinite(Number(by.get(m)?.netRevenue)));
  const months=expected.filter(m=>!missing.includes(m)).map(m=>({month:m,amount:round2(Number(by.get(m)?.netRevenue||0))}));
  if(missing.length)return {complete:false,rbt12:null,missingMonths:missing,months};
  return {complete:true,rbt12:round2(months.reduce((s,x)=>s+x.amount,0)),missingMonths:[],months};
}
