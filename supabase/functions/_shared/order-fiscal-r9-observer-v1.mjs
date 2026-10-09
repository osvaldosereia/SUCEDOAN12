// R09: pure comparison, no network, no writes. Does NOT authorize NF-e.
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const money=v=>{const x=Number(v);return v==null||!Number.isFinite(x)?NaN:Math.round(x*100)};
const quantity=v=>{const x=Number(v);return Number.isFinite(x)&&x>0?Math.round(x*1000):NaN};
function comparableBlingLines(rows,productLinkById){
  const group=new Map();
  for(const x of rows){
    const id=Number(x.bling_product_id);
    const q=quantity(x.quantity),c=money(x.unit_price);
    if(!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(q)
      ||!Number.isSafeInteger(c)||c<0)return null;
    const key=id+"|"+c;
    group.set(key,(group.get(key)||0)+q);
  }
  return [...group.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
}
export function compareBlingR9Order(expected,remote,productLinks){
  const blockers=[];
  const order=remote&&typeof remote==="object"?remote:{};
  if(!uuid(expected?.order_id)||!Number.isSafeInteger(Number(expected?.bling_order_id))
    ||Number(expected.bling_order_id)<=0)blockers.push("invalid_expected_order");
  const expectedKey="VITRINE-"+String(expected?.order_id||"");
  if(String(order.numeroLoja||"")!==expectedKey)
    blockers.push("remote_order_identity_mismatch");
  if(Number(order.id)!==Number(expected?.bling_order_id))
    blockers.push("remote_bling_order_id_mismatch");
  if(!Number.isFinite(money(expected?.final_total))||
     money(order.total)!==money(expected.final_total))
    blockers.push("remote_order_total_mismatch");
  const lines=Array.isArray(expected?.manifest?.lines)?expected.manifest.lines:[];
  const picked=lines.filter(x=>x.state==="separated"&&x.display_only!==true&&x.deliverable===true);
  const links=new Map((Array.isArray(productLinks)?productLinks:[])
    .filter(x=>x.status==="matched"&&Number(x.bling_id)>0)
    .map(x=>[String(x.source_id),Number(x.bling_id)]));
  const intended=[];
  for(const line of picked){
    const id=links.get(String(line.product_id));
    if(!id){blockers.push("missing_verified_bling_product_link");continue;}
    intended.push({bling_product_id:id,quantity:line.quantity,unit_price:line.unit_price});
  }
  if(!picked.length)blockers.push("no_deliverable_items");
  const actual=Array.isArray(order.itens)?order.itens.map(x=>({
    bling_product_id:x?.produto?.id??x?.bling_product_id,
    quantity:x?.quantidade,unit_price:x?.valor
  })):[];
  const a=comparableBlingLines(intended),b=comparableBlingLines(actual);
  if(!a||!b||JSON.stringify(a)!==JSON.stringify(b))
    blockers.push("remote_order_items_mismatch");
  // Existing invoice association is NOT approval; R10 must check cStat,
  // 44-digit access key, matching order and authorized SEFAZ response.
  const linkedInvoiceId=Number(order?.notaFiscal?.id||0);
  return {
    match:blockers.length===0,blockers,
    invoice_linked:Number.isSafeInteger(linkedInvoiceId)&&linkedInvoiceId>0,
    linked_invoice_id:linkedInvoiceId>0?linkedInvoiceId:null,
    checked_items:picked.length,checked_at:new Date().toISOString(),
    external_write:false
  };
}
export function classifyBlingR9Invoices(list,detail,linkedId){
  if(!list?.ok)return {verdict:"uncertain",error:"invoice_listing_unavailable"};
  const matches=Array.isArray(list.matches)?list.matches:[];
  if(matches.length>1)return {verdict:"conflict",error:"duplicate_invoices_by_order_key"};
  const associated=Number(linkedId||0);
  if(matches.length===0){
    if(associated>0)return {verdict:"conflict",error:"order_invoice_not_found_in_list"};
    return {verdict:"no_invoice",invoice_count:0,invoice_id:null};
  }
  const id=Number(matches[0]?.id||0);
  if(!Number.isSafeInteger(id)||id<=0||associated>0&&associated!==id)
    return {verdict:"conflict",error:"conflicting_invoice_identity"};
  if(!detail?.ok||Number(detail.invoice?.id)!==id)
    return {verdict:"uncertain",error:"invoice_detail_unavailable"};
  return {verdict:"one_invoice",invoice_count:1,invoice_id:id,
    sefaz_label:String(detail.invoice?.situation?.label||"").slice(0,80),
    access_key_present:/^\d{44}$/.test(String(detail.invoice?.chaveAcesso||""))};
}
export async function runFiscalR9ObserverPass({claim,probe,finish,limit=3}){
  const c=await claim(limit);
  if(c?.ok!==true||!Array.isArray(c.claimed))throw Error("r9_claim_unavailable");
  const results=[];
  for(const row of c.claimed){
    let value;
    try{
      value=await probe(row);
      if(!value||!["no_invoice","one_invoice","uncertain","conflict"].includes(value.verdict))
        throw Error("r9_probe_invalid");
    }catch(e){value={verdict:"uncertain",error:"read_only_probe_failed"};}
    const f=await finish(row,value);
    results.push({order_id:row.order_id,verdict:value.verdict,
      recorded:f?.ok===true});
  }
  return {ok:true,claimed:results.length,results,invoice_created:false,
    external_write:false};
}
