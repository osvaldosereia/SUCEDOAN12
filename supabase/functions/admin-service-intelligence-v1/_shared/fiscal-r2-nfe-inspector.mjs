// Pure, side-effect-free interpretation of a Bling NF-e detail response.
// Do not use this report as permission to issue, modify, or authorize invoices.
const digits = value => String(value ?? "").replace(/\D/g,"");
const money = value => {
  if (value === null || value === undefined || value === "") return null;
  const v = Number(value);
  return Number.isFinite(v) && v >= 0 ? Math.round(v*100) : null;
};
const positiveId = value => {
  const v=Number(value);
  return Number.isSafeInteger(v)&&v>0?v:null;
};
const str = (value,limit=160) => String(value??"").trim().slice(0,limit);
const fieldId = value => positiveId(value&&typeof value==="object"?(value.id??value.idPedidoVenda):value);
const nfeObject = raw => raw?.data&&typeof raw.data==="object"&&!Array.isArray(raw.data)?raw.data:(raw||{});

// Extract only recognized fiscal validation messages present in the provider
// response. Do not infer that a field is wrong merely because Bling omitted it.
const normalizeName=value=>String(value??"").normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/gi,"").toLowerCase();
const fiscalMessage=/\b(ncm|cest|cfop|cst|csosn|ibs|cbs|sefaz|rejei[cç][aã]o|tribut[aá]r|classifica[cç][aã]o)\b/i;
export function inspectBlingNfeProviderErrorsR2(raw, itemSummaries=[]) {
  const nf=nfeObject(raw);
  const sources=[raw?.error?.fields,raw?.error?.messages,raw?.alertas,
    nf?.alertas,nf?.erros,nf?.mensagens,nf?.validacoes,nf?.avisos,
    nf?.motivosRejeicao,nf?.situacao?.mensagens,nf?.situacao?.motivo];
  const messages=[],seen=new Set();
  function visit(value,depth=0){
    if(depth>4||messages.length>=24||value==null)return;
    if(typeof value==="string"){
      const msg=value.replace(/\s+/g," ").trim().slice(0,320);
      if(fiscalMessage.test(msg)&&!seen.has(msg)){seen.add(msg);messages.push(msg);}
    }else if(Array.isArray(value)){
      for(const x of value.slice(0,24))visit(x,depth+1);
    }else if(typeof value==="object"){
      for(const key of ["message","mensagem","descricao","motivo","description","error","fields","errors","alertas"])
        if(Object.prototype.hasOwnProperty.call(value,key))visit(value[key],depth+1);
    }
  }
  for(const v of sources)visit(v);
  return messages.map(text=>{
    const ncmMatch=text.match(/\bNCM[\s:]+([0-9]{4}[.]?[0-9]{2}[.]?[0-9]{2})\b/i);
    const itemMatch=text.match(/\bpara (?:o )?item\s+(.+?)\s+(?:n[aã]o est[aá]|est[aá]|n[aã]o [ée]|possui|cont[eé]m)/i);
    const itemName=itemMatch?.[1]?.trim()||null;
    const normalized=normalizeName(itemName);
    const candidates=normalized?itemSummaries.filter(x=>normalizeName(x.name)===normalized):[];
    return {
      field:/\bNCM\b/i.test(text)?"ncm":/\bCEST\b/i.test(text)?"cest":/\bCFOP\b/i.test(text)?"cfop":"other_fiscal",
      message:text,
      reported_code:ncmMatch?ncmMatch[1].replace(/\D/g,""):null,
      item_name:itemName,item_index:candidates.length===1?candidates[0].index:null,
      matched_by:candidates.length===1?"exact_normalized_name":"unresolved",
      requires_validation:true
    };
  });
}


export function inspectBlingNfeR2(raw, expected={}) {
  const nf=nfeObject(raw),invoiceId=positiveId(nf.id??nf.idNotaFiscal);
  const sit=fieldId(nf.situacao);
  const candidateSaleIds=[
    fieldId(nf.pedidoVenda),fieldId(nf.pedido),positiveId(nf.idPedidoVenda),
    ...(Array.isArray(nf.pedidosVendas)?nf.pedidosVendas.map(fieldId):[])
  ].filter(Boolean);
  const saleIds=[...new Set(candidateSaleIds)];
  const customerId=fieldId(nf.contato);
  const invoiceTotal=money(nf.total??nf.valorTotal??nf.totalNota);
  const ext=str(nf.numeroLoja,160);
  const items=Array.isArray(nf.itens)?nf.itens.slice(0,120):[];
  const itemSummaries=items.map((item,i)=>{
    const fiscal=item?.tributacao&&typeof item.tributacao==="object"?item.tributacao:{};
    const rawNcm=fiscal.ncm??item?.ncm??null;
    // GET /nfe/{id} can omit taxation details entirely. Absence of a
    // response field is not evidence that 72 invoices have missing NCM.
    const ncmExposed=Object.prototype.hasOwnProperty.call(fiscal,"ncm")
      ||Object.prototype.hasOwnProperty.call(item||{},"ncm");
    const ncm=digits(rawNcm);
    const productId=fieldId(item?.produto);
    const code=str(item?.codigo??item?.sku??"",80);
    const name=str(item?.descricao??item?.nome??"",110);
    return {
      index:i+1,product_id:productId,code,name,
      ncm:ncm||null,
      ncm_state:!ncmExposed?"not_exposed":ncm.length===8?"present":!ncm.length?"missing":"malformed",
      quantity:Number(item?.quantidade)||null,
      unit_value:Number(item?.valor??item?.valorUnitario)||null,
      cif_total:money(item?.total??item?.valorTotal)
    };
  });
  const providerErrors=inspectBlingNfeProviderErrorsR2(raw,itemSummaries);
  const expectedSaleId=positiveId(expected.bling_order_id);
  const referenceInvoiceId=positiveId(expected.sale_invoice_id);
  const expectedContactId=positiveId(expected.contact_id);
  const expectedTotal=money(expected.total);
  const expectedSubtotal=money(expected.fiscal_subtotal);
  const lineSubtotal=itemSummaries.length&&itemSummaries.every(x=>x.cif_total!==null)
    ?itemSummaries.reduce((sum,x)=>sum+x.cif_total,0):null;
  const expectedExternal=str(expected.external_key,160);
  const signal={
    external:!!expectedExternal&&!!ext&&ext===expectedExternal,
    sale:!!expectedSaleId&&saleIds.includes(expectedSaleId),
    total:expectedTotal!==null&&invoiceTotal!==null&&invoiceTotal===expectedTotal,
    contact:!!expectedContactId&&!!customerId&&customerId===expectedContactId,
    sale_invoice:!!referenceInvoiceId&&invoiceId===referenceInvoiceId,
    subtotal:expectedSubtotal!==null&&lineSubtotal!==null&&lineSubtotal===expectedSubtotal
  };
  const conflicts={
    external:!!expectedExternal&&!!ext&&ext!==expectedExternal,
    sale:!!expectedSaleId&&saleIds.length>0&&!saleIds.includes(expectedSaleId),
    total:expectedTotal!==null&&invoiceTotal!==null&&invoiceTotal!==expectedTotal,
    contact:!!expectedContactId&&!!customerId&&customerId!==expectedContactId,
    sale_invoice:!!referenceInvoiceId&&!!invoiceId&&invoiceId!==referenceInvoiceId,
    subtotal:expectedSubtotal!==null&&lineSubtotal!==null&&lineSubtotal!==expectedSubtotal
  };
  const verified=!!expectedSaleId&&!Object.values(conflicts).some(Boolean)
    &&((signal.sale_invoice&&(signal.contact||signal.subtotal||signal.external))
       ||((signal.sale||signal.external)
         &&((signal.sale&&signal.external)||(signal.sale&&signal.total)
           ||(signal.external&&signal.total&&signal.contact))));
  const authorized=[5,6,7].includes(sit);
  const pending=[3,8,10].includes(sit);
  const rawDraft=sit===1;
  const noteCanEdit=rawDraft&&!authorized&&!pending;
  const hasStockOrFinancePosting=Boolean(nf.lancamentosEstoque?.length||nf.lancamentosContas?.length
    ||nf.lancamentos?.length);
  return {
    invoice_id:invoiceId,invoice_number:str(nf.numero,50)||null,
    situation_id:sit,access_key_present:digits(nf.chaveAcesso).length===44,
    numero_loja:ext||null,sale_ids:saleIds,contact_id:customerId,
    invoice_total_cents:invoiceTotal,
    item_count:Array.isArray(nf.itens)?nf.itens.length:null,
    items:itemSummaries,
    invalid_ncm_format_count:itemSummaries.filter(x=>x.ncm_state==="missing"||x.ncm_state==="malformed").length,
    ncm_not_exposed_count:itemSummaries.filter(x=>x.ncm_state==="not_exposed").length,
    line_subtotal_cents:lineSubtotal,
    validation_errors:providerErrors,
    validation_message_count:providerErrors.length,
    validation_source:providerErrors.length?"provider_response":"not_returned_by_provider_get",
    identity:{verified,signals:signal,conflicts,reason:verified?"strong_identity_verified":
      Object.values(conflicts).some(Boolean)?"identity_conflict":"insufficient_independent_identity_signals"},
    editing:{eligible:noteCanEdit&&!hasStockOrFinancePosting&&verified,
      draft:rawDraft,has_known_postings:hasStockOrFinancePosting,
      reason:authorized?"already_authorized":pending?"transmission_in_progress":
        !rawDraft?"state_not_editable":hasStockOrFinancePosting?"bookkeeping_posted":
        !verified?"invoice_identity_not_verified":"provider_contract_still_requires_full_payload"},
    external_write:false
  };
}
