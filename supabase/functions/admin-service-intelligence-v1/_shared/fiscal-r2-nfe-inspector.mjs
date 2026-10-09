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
    const ncm=digits(rawNcm);
    const productId=fieldId(item?.produto);
    const code=str(item?.codigo??item?.sku??"",80);
    const name=str(item?.descricao??item?.nome??"",110);
    return {
      index:i+1,product_id:productId,code,name,
      ncm:ncm||null,
      ncm_state:ncm.length===8?"present":!ncm.length?"missing":"malformed",
      quantity:Number(item?.quantidade)||null,
      unit_value:Number(item?.valor??item?.valorUnitario)||null,
      cif_total:money(item?.total??item?.valorTotal)
    };
  });
  const expectedSaleId=positiveId(expected.bling_order_id);
  const expectedContactId=positiveId(expected.contact_id);
  const expectedTotal=money(expected.total);
  const expectedExternal=str(expected.external_key,160);
  const signal={
    external:!!expectedExternal&&!!ext&&ext===expectedExternal,
    sale:!!expectedSaleId&&saleIds.includes(expectedSaleId),
    total:expectedTotal!==null&&invoiceTotal!==null&&invoiceTotal===expectedTotal,
    contact:!!expectedContactId&&!!customerId&&customerId===expectedContactId
  };
  const conflicts={
    external:!!expectedExternal&&!!ext&&ext!==expectedExternal,
    sale:!!expectedSaleId&&saleIds.length>0&&!saleIds.includes(expectedSaleId),
    total:expectedTotal!==null&&invoiceTotal!==null&&invoiceTotal!==expectedTotal,
    contact:!!expectedContactId&&!!customerId&&customerId!==expectedContactId
  };
  const verified=!!expectedSaleId&&!Object.values(conflicts).some(Boolean)
    &&(signal.sale||signal.external)
    &&((signal.sale&&signal.external)||(signal.sale&&signal.total)||(signal.external&&signal.total&&signal.contact));
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
    invalid_ncm_format_count:itemSummaries.filter(x=>x.ncm_state!=="present").length,
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
