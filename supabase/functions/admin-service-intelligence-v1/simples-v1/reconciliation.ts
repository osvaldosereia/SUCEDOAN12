import type { FiscalInvoice } from './source.ts';

export interface ReconciliationOrder { id:string; total:number; status:string; createdAt:string; blingInvoiceId?:number|null }
export interface ReconciliationProfile { reviewStatus:string; stStatus:string; monophaseStatus?:string }
export interface ReconciliationInput { competenceMonth:string; invoices:FiscalInvoice[]; orders:ReconciliationOrder[]; profiles:Record<string,ReconciliationProfile> }
export interface ReconciliationIssue { issueType:string; severity:'blocking'|'warning'; title:string; explanation:string; sourceDocumentId?:string; orderId?:string|null; productId?:string|null; amount?:number; evidence?:Record<string,unknown> }
export interface RevenueCandidate { sourceDocumentId:string; accessKey?:string|null; blingInvoiceId?:number|null; orderId?:string|null; productId?:string|null; issuedAt:string; grossAmount:number; recognizedAmount:number; transactionKind:'sale'|'cancellation'|'return' }
export interface ReconciliationResult { candidates:RevenueCandidate[]; issues:ReconciliationIssue[] }

export function competenceInCuiaba(iso:string):string{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Cuiaba',year:'numeric',month:'2-digit'}).formatToParts(new Date(iso));
  const y=parts.find(p=>p.type==='year')?.value||'';
  const m=parts.find(p=>p.type==='month')?.value||'';
  return `${y}-${m}`;
}
const validKey=(v?:string|null)=>!!v&&/^\d{44}$/.test(v);
const docIdentity=(x:FiscalInvoice)=>validKey(x.accessKey)?`key:${x.accessKey}`:(x.blingInvoiceId?`bling:${x.blingInvoiceId}`:`source:${x.sourceDocumentId}`);
const unresolved=(v?:string)=>['candidate','unknown','conflict','pending','blocked'].includes(String(v||''));
const round2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;

export function reconcilePeriod(input:ReconciliationInput):ReconciliationResult{
  const issues:ReconciliationIssue[]=[];
  const candidates:RevenueCandidate[]=[];
  const orders=new Map(input.orders.map(o=>[o.id,o]));
  const invoicesInMonth=input.invoices.filter(i=>competenceInCuiaba(i.issuedAt)===input.competenceMonth);
  const groups=new Map<string,FiscalInvoice[]>();
  for(const inv of invoicesInMonth){const k=docIdentity(inv);groups.set(k,[...(groups.get(k)||[]),inv]);}
  const uniqueInvoices:FiscalInvoice[]=[];
  for(const [k,list] of groups){
    if(list.length>1) issues.push({issueType:'duplicated_document',severity:'blocking',title:'Documento fiscal duplicado',explanation:`Mais de uma evidencia para ${k}`,sourceDocumentId:list[0].sourceDocumentId,evidence:{count:list.length}});
    uniqueInvoices.push(list[0]);
  }
  const matchedOrders=new Set<string>();
  for(const inv of uniqueInvoices){
    const order=inv.orderId?orders.get(inv.orderId):input.orders.find(o=>inv.blingInvoiceId&&o.blingInvoiceId===inv.blingInvoiceId);
    if(order){
      matchedOrders.add(order.id);
      if(Math.abs(Number(inv.total)-Number(order.total))>0.01) issues.push({issueType:'document_value_mismatch',severity:'blocking',title:'Valor da NF-e difere do pedido',explanation:'Total fiscal e total do pedido nao conferem.',sourceDocumentId:inv.sourceDocumentId,orderId:order.id,amount:inv.total,evidence:{invoiceTotal:inv.total,orderTotal:order.total}});
      if(inv.status==='cancelled'&&!/cancel/i.test(order.status)) issues.push({issueType:'cancel_status_mismatch',severity:'blocking',title:'Cancelamento divergente',explanation:'NF-e cancelada mas pedido nao esta cancelado.',sourceDocumentId:inv.sourceDocumentId,orderId:order.id});
      if(inv.status==='returned'&&!/return|devol/i.test(order.status)) issues.push({issueType:'return_status_mismatch',severity:'blocking',title:'Devolucao divergente',explanation:'Documento indica devolucao/retorno mas pedido nao reflete o retorno.',sourceDocumentId:inv.sourceDocumentId,orderId:order.id});
    }else{
      issues.push({issueType:'invoice_without_order',severity:'blocking',title:'NF-e sem pedido conciliado',explanation:'A NF-e continua considerada na receita, mas precisa ser conciliada.',sourceDocumentId:inv.sourceDocumentId,orderId:inv.orderId,amount:inv.total});
    }

    const kind=inv.status==='cancelled'?'cancellation':inv.status==='returned'?'return':'sale';
    const sourceItems=inv.items?.length?inv.items:[{productId:null,amount:inv.total}];
    const items=sourceItems.map(item=>({...item,amount:Math.abs(Number(item.amount)||0)}));
    const itemTotal=round2(items.reduce((sum,item)=>sum+item.amount,0));
    const residual=round2(Math.abs(Number(inv.total)||0)-itemTotal);
    for(const item of items){
      const amount=item.amount;
      candidates.push({sourceDocumentId:inv.sourceDocumentId,accessKey:inv.accessKey,blingInvoiceId:inv.blingInvoiceId,orderId:order?.id||inv.orderId,productId:item.productId,issuedAt:inv.issuedAt,grossAmount:amount,recognizedAmount:kind==='cancellation'?0:kind==='return'?-amount:amount,transactionKind:kind});
      if(item.productId){
        const p=input.profiles[item.productId];
        if(!p){ issues.push({issueType:'product_without_fiscal_profile',severity:'blocking',title:'Produto sem perfil fiscal',explanation:'Produto vendido nao possui perfil fiscal suficiente para o fechamento.',sourceDocumentId:inv.sourceDocumentId,orderId:order?.id,productId:item.productId,amount}); continue; }
        if(unresolved(p.reviewStatus)) issues.push({issueType:'product_without_fiscal_profile',severity:'blocking',title:'Perfil fiscal nao validado',explanation:`Perfil fiscal em ${p.reviewStatus}.`,sourceDocumentId:inv.sourceDocumentId,orderId:order?.id,productId:item.productId,amount});
        if(unresolved(p.stStatus)) issues.push({issueType:'st_unresolved',severity:'blocking',title:'ICMS-ST pendente',explanation:`Situacao ST ${p.stStatus} exige revisao.`,sourceDocumentId:inv.sourceDocumentId,orderId:order?.id,productId:item.productId,amount});
        if(unresolved(p.monophaseStatus)) issues.push({issueType:'monophase_unresolved',severity:'blocking',title:'Monofasico pendente',explanation:`Situacao monofasica ${p.monophaseStatus} exige revisao.`,sourceDocumentId:inv.sourceDocumentId,orderId:order?.id,productId:item.productId,amount});
      }
    }
    if(Math.abs(residual)>0.01){
      const recognized=kind==='cancellation'?0:kind==='return'?-residual:residual;
      candidates.push({sourceDocumentId:inv.sourceDocumentId,accessKey:inv.accessKey,blingInvoiceId:inv.blingInvoiceId,orderId:order?.id||inv.orderId,productId:null,issuedAt:inv.issuedAt,grossAmount:Math.abs(residual),recognizedAmount:recognized,transactionKind:kind});
      issues.push({
        issueType:'other',severity:'blocking',title:'Valor fiscal fora das linhas de produto',
        explanation:'A NF-e possui valor adicional ou desconto fora das linhas de produto. O valor foi preservado na receita e precisa ter o tratamento tributario confirmado.',
        sourceDocumentId:inv.sourceDocumentId,orderId:order?.id||inv.orderId,amount:residual,
        evidence:{invoiceTotal:round2(Math.abs(Number(inv.total)||0)),itemTotal,residual}
      });
    }
  }
  for(const order of input.orders){
    if(competenceInCuiaba(order.createdAt)!==input.competenceMonth) continue;
    if(!matchedOrders.has(order.id)) issues.push({issueType:'order_without_invoice',severity:'blocking',title:'Pedido sem NF-e conciliada',explanation:'Pedido da competencia nao possui NF-e fiscal correspondente.',orderId:order.id,amount:order.total});
  }
  return {candidates,issues};
}
