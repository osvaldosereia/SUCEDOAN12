export type CollectionStatus='complete'|'incomplete'|'failed'|'stale';
export interface FiscalInvoiceItem { productId?:string|null; amount:number; quantity?:number }
export interface FiscalInvoice {
  sourceDocumentId:string; accessKey?:string|null; blingInvoiceId?:number|null; orderId?:string|null;
  issuedAt:string; status:'authorized'|'cancelled'|'returned'; total:number; items:FiscalInvoiceItem[]; sourceRefs:string[];
}
export interface FiscalSourceSnapshot { status:CollectionStatus; invoices:FiscalInvoice[]; error?:string }
export interface FiscalEvidenceRequest { competenceMonth:string }
export interface FiscalSourceDeps { loadLocal:(input:FiscalEvidenceRequest)=>Promise<FiscalSourceSnapshot>; loadBling:(input:FiscalEvidenceRequest)=>Promise<FiscalSourceSnapshot> }
export interface FiscalEvidenceResult { collectionStatus:CollectionStatus; invoices:FiscalInvoice[]; errors:string[] }

const validKey=(v?:string|null)=>!!v&&/^\d{44}$/.test(v);
const identity=(x:FiscalInvoice)=>validKey(x.accessKey)?`key:${x.accessKey}`:(x.blingInvoiceId?`bling:${x.blingInvoiceId}`:`source:${x.sourceDocumentId}`);
const rank:Record<CollectionStatus,number>={complete:0,stale:1,incomplete:2,failed:3};

export async function collectFiscalEvidence(input:FiscalEvidenceRequest,deps:FiscalSourceDeps):Promise<FiscalEvidenceResult>{
  const [local,bling]=await Promise.all([deps.loadLocal(input),deps.loadBling(input)]);
  const merged=new Map<string,FiscalInvoice>();
  for(const inv of local.invoices||[]) merged.set(identity(inv),{...inv,sourceRefs:[...new Set(inv.sourceRefs||['local'])]});
  for(const inv of bling.invoices||[]){
    const key=identity(inv),prev=merged.get(key);
    merged.set(key,prev?{...prev,...inv,sourceRefs:[...new Set([...(prev.sourceRefs||[]),...(inv.sourceRefs||['bling'])])]}:{...inv,sourceRefs:[...new Set(inv.sourceRefs||['bling'])]});
  }
  const collectionStatus=[local.status,bling.status].sort((a,b)=>rank[b]-rank[a])[0] as CollectionStatus;
  const errors=[local.error,bling.error].filter(Boolean) as string[];
  return {collectionStatus,invoices:[...merged.values()],errors};
}
