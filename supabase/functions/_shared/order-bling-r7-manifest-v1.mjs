// R07 — pure offline-compatible adapter. NO Meta/Bling/SEFAZ network calls.
// Uses a FROZEN R06 separation manifest instead of original order_items amounts.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const validUuid=v=>typeof v==="string"&&UUID.test(v);
export const stableJson=v=>JSON.stringify(normalize(v));
function normalize(v){
  if(Array.isArray(v))return v.map(normalize);
  if(v&&typeof v==="object")return Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])]));
  return v;
}
function cents(v,name){
  if(typeof v!=="number"&&typeof v!=="string")throw Error(name+"_missing");
  const n=Number(v);
  if(!Number.isFinite(n))throw Error(name+"_invalid");
  const c=Math.round(n*100);
  if(!Number.isSafeInteger(c)||Math.abs(c)>100000000000)throw Error(name+"_out_of_range");
  return c;
}
function qty3(v){
  const n=Number(v);
  if(!Number.isFinite(n)||n<=0||Math.abs(n-Math.round(n*1000)/1000)>1e-8)
    throw Error("invalid_picked_quantity");
  return Math.round(n*1000)/1000;
}
function assertLineAmount(qty,unitCents,lineCents){
  if(Math.abs(Math.round(qty*unitCents)-lineCents)>1)
    throw Error("picked_line_total_mismatch");
}
export function buildReconciledBlingSnapshot(base,manifest){
  const id=String(base?.source_order_id||"");
  if(!validUuid(id)||manifest?.ok!==true||manifest?.ready!==true||manifest?.order_id!==id)
    throw Error("r6_manifest_not_ready_or_wrong_order");
  if(!Array.isArray(manifest.lines)||!manifest.lines.length||!manifest.financial)
    throw Error("r6_manifest_missing_lines");
  if(Array.isArray(manifest.blockers)&&manifest.blockers.length)
    throw Error("r6_manifest_has_blockers");
  if(base.order_number&&manifest.public_order_number&&
     base.order_number!==manifest.public_order_number)
    throw Error("r6_public_number_mismatch");

  const f=manifest.financial;
  const finalTotal=cents(f.final_total,"r6_final_total");
  const originalTotal=cents(f.original_total,"r6_original_total");
  const missing=cents(f.missing_subtotal,"r6_missing_subtotal");
  const originalSubtotal=cents(f.original_subtotal,"r6_original_subtotal");
  const originalFiscal=cents(f.original_fiscal_subtotal,"r6_original_fiscal_subtotal");
  const finalSubtotal=cents(f.final_subtotal,"r6_final_subtotal");
  const finalFiscal=cents(f.final_fiscal_subtotal,"r6_final_fiscal_subtotal");
  if(finalTotal<0||missing<0||finalTotal!==originalTotal-missing||
    finalSubtotal!==originalSubtotal-missing||finalFiscal!==originalFiscal-missing)
    throw Error("r6_financial_reconciliation_mismatch");
  if(Number(base?.totals?.commercial_order_cents)!==finalTotal)
    throw Error("bling_order_total_stale");

  const known=new Map();
  for(const item of Array.isArray(base.items)?base.items:[]){
    const pid=String(item.product_id||"");
    if(validUuid(pid)&&!known.has(pid))known.set(pid,item);
  }
  const grouped=new Map();
  const seen=new Set();
  let separatedCount=0,missingCount=0;
  for(const line of manifest.lines){
    const li=String(line.order_item_id||"");
    if(!validUuid(li)||seen.has(li))throw Error("duplicated_or_invalid_order_item_id");
    seen.add(li);
    if(!["separated","missing"].includes(line.state))throw Error("r6_manifest_unresolved_item");
    if(line.state==="missing")missingCount++;
    const deliverable=line.state==="separated"&&line.display_only!==true;
    if(Boolean(line.deliverable)!==deliverable)throw Error("r6_line_deliverable_state_mismatch");
    if(!deliverable)continue;
    const productId=String(line.product_id||"");
    if(!validUuid(productId))throw Error("r6_deliverable_product_missing");
    const quantity=qty3(line.quantity),price=cents(line.unit_price,"r6_unit_price"),total=cents(line.line_total,"r6_line_total");
    if(price<0||total<0)throw Error("r6_negative_item_price");
    assertLineAmount(quantity,price,total);
    const groupKey=productId+"|"+price+"|"+String(line.history_kind==="basket_component"?"basket_component":"product");
    const source=known.get(productId)||{};
    const prev=grouped.get(groupKey);
    if(prev){
      prev.quantity=Math.round((prev.quantity+quantity)*1000)/1000;
      prev.source_line_ids.push(li);
    }else{
      grouped.set(groupKey,{
        product_id:productId,sku:source.sku||"",gtin:source.gtin||"",
        name:String(line.name||source.name||"Produto").slice(0,220),
        quantity,unit_price_cents:price,
        source_kind:line.history_kind==="basket_component"?"basket_component":"product",
        source_line_ids:[li]
      });
    }
    separatedCount++;
  }
  const items=[...grouped.values()].sort((a,b)=>
    (a.product_id+"|"+a.unit_price_cents+"|"+a.source_kind).localeCompare(
     b.product_id+"|"+b.unit_price_cents+"|"+b.source_kind));
  if(!separatedCount||!items.length)throw Error("r6_no_deliverable_items");
  const individual=items.reduce((sum,x)=>sum+Math.round(x.quantity*x.unit_price_cents),0);
  if(!Number.isSafeInteger(individual))throw Error("r7_item_sum_out_of_range");
  const delta=finalTotal-individual;

  return {
    ...base,order_number:manifest.public_order_number||base.order_number,
    queue_reason:"ean_verified",
    items:items.map(({source_line_ids,...x})=>x),
    totals:{
      individual_products_cents:individual,
      commercial_order_cents:finalTotal,
      commercial_delta_cents:delta
    },
    r7_reconciliation:{
      version:1,order_id:id,original_order_number:manifest.public_order_number||null,
      separated_line_count:separatedCount,missing_line_count:missingCount,
      original_total_cents:originalTotal,missing_subtotal_cents:missing,
      final_total_cents:finalTotal,
      discount_cents:cents(f.discount??0,"r6_discount"),
      other_expenses_cents:cents(f.other_expenses??0,"r6_other_expenses"),
      basket_hidden_adjustment_cents:cents(f.basket_hidden_adjustment??0,"r6_hidden"),
      // Information only: fiscal balancing occurs through commercial_delta_cents,
      // NOT by adding discount/fees a second time.
      source:"frozen_r6_manifest",
      line_ids:items.flatMap(x=>x.source_line_ids)
    }
  };
}
export async function fingerprintBlingPayload(snapshot){
  const {source_order_id,order_number,items,totals,r7_reconciliation}=snapshot||{};
  if(!validUuid(source_order_id)||!Array.isArray(items))throw Error("invalid_bling_snapshot_hash_input");
  const encoded=new TextEncoder().encode(stableJson({source_order_id,order_number,items,totals,r7_reconciliation}));
  const hash=await crypto.subtle.digest("SHA-256",encoded);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}


// Exception to order-minimum validation applies ONLY to a post-checkout,
// completed separation with an immutable R06 receipt proved from the DB.
// This does NOT waive the R$75 minimum on a new checkout or an unverified order.
export function eligiblePostCheckoutShortageBelowMinimum(payload,completion,orderTotalCents){
  const r=payload?.r7_reconciliation;
  const m=completion?.metadata?.r6_reconciliation;
  const n=v=>typeof v==="number"&&Number.isFinite(v)&&Number.isSafeInteger(v)?v:null;
  if(!validUuid(payload?.source_order_id)||payload?.queue_reason!=="ean_verified"
     ||payload?.status!=="ready"||r?.source!=="frozen_r6_manifest"
     ||r?.order_id!==payload.source_order_id
     ||completion?.phase!=="completed"
     ||completion?.metadata?.stock_applied!==true
     ||m?.ok!==true||m?.ready!==true||m?.order_id!==payload.source_order_id
     ||(Array.isArray(m?.blockers)&&m.blockers.length!==0))return false;
  const orig=n(r.original_total_cents),miss=n(r.missing_subtotal_cents),
    fin=n(r.final_total_cents),order=n(orderTotalCents);
  if(orig===null||miss===null||fin===null||order===null
    ||orig<7500||miss<=0||fin<0||fin>=7500
    ||orig-miss!==fin||fin!==order)return false;
  if(cents(m.financial?.original_total,"r6_orig_check")!==orig||
     cents(m.financial?.missing_subtotal,"r6_missing_check")!==miss||
     cents(m.financial?.final_total,"r6_final_check")!==fin)return false;
  return true;
}
