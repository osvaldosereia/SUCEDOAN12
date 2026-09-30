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
export interface MonthlyHistoryListResult { ok:boolean; rows:any[]; error?:string|null }
export interface MonthlyHistoryDetailResult { ok:boolean; data:any; error?:string|null; status?:number }
export interface MonthlyHistorySourceDeps {
  listAuthorizedSales:(competenceMonth:string)=>Promise<MonthlyHistoryListResult>;
  listAuthorizedIncoming:(competenceMonth:string)=>Promise<MonthlyHistoryListResult>;
  getInvoiceDetail:(invoiceId:string|number)=>Promise<MonthlyHistoryDetailResult>;
}
export interface MonthlyHistoryCollectionResult extends MonthlyHistorySummary { sourceErrors:string[] }

const round2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const validCompetence=(v:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const documentTotal=(x:any):number=>{
  for(const v of [x?.valorNota,x?.valor,x?.total,x?.valorTotal]){
    const n=Number(v);
    if(Number.isFinite(n)&&n>=0)return n;
  }
  return Number.NaN;
};

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

export async function collectMonthlyRevenueEvidence(competenceMonth:string,deps:MonthlyHistorySourceDeps):Promise<MonthlyHistoryCollectionResult>{
  if(!validCompetence(competenceMonth))throw new Error('invalid_competence');
  const [salesResult,incomingResult]=await Promise.all([
    deps.listAuthorizedSales(competenceMonth),
    deps.listAuthorizedIncoming(competenceMonth),
  ]);
  const sourceErrors:string[]=[];
  if(!salesResult.ok)sourceErrors.push(`sales:${salesResult.error||'collection_failed'}`);
  if(!incomingResult.ok)sourceErrors.push(`incoming:${incomingResult.error||'collection_failed'}`);
  const sales:MonthlyFiscalDocument[]=(salesResult.rows||[]).map(row=>({id:String(row?.id??''),total:documentTotal(row)}));
  const returns:MonthlyFiscalDocument[]=[];
  for(const row of incomingResult.rows||[]){
    const id=row?.id;
    if(id===null||id===undefined||id===''){sourceErrors.push('incoming:missing_invoice_id');continue}
    const detail=await deps.getInvoiceDetail(id);
    if(!detail.ok){sourceErrors.push(`incoming_detail_${id}:${detail.error||detail.status||'collection_failed'}`);continue}
    const invoice=detail.data?.data||detail.data||{};
    if(Number(invoice?.finalidade)!==4)continue;
    const total=documentTotal(invoice);
    returns.push({id:String(invoice?.id??id),total:Number.isFinite(total)?total:documentTotal(row)});
  }
  const summary=summarizeMonthlyRevenue({competenceMonth,sales,returns});
  if(sourceErrors.length){
    return {...summary,collectionStatus:'incomplete',reviewReason:'source_collection_incomplete',sourceErrors};
  }
  return {...summary,sourceErrors};
}

export function buildRbt12FromHistory(target:string,rows:Rbt12HistoryRow[]):Rbt12HistoryResult{
  const expected=priorTwelveCompetences(target),by=new Map<string,Rbt12HistoryRow>();
  for(const row of rows||[])if(validCompetence(row.competenceMonth)&&!by.has(row.competenceMonth))by.set(row.competenceMonth,row);
  const missing=expected.filter(m=>!by.has(m)||by.get(m)?.collectionStatus!=='complete'||!Number.isFinite(Number(by.get(m)?.netRevenue)));
  const months=expected.filter(m=>!missing.includes(m)).map(m=>({month:m,amount:round2(Number(by.get(m)?.netRevenue||0))}));
  if(missing.length)return {complete:false,rbt12:null,missingMonths:missing,months};
  return {complete:true,rbt12:round2(months.reduce((s,x)=>s+x.amount,0)),missingMonths:[],months};
}
