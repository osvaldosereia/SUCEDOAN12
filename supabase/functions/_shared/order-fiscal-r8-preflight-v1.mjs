import { stableJson } from "./order-bling-r7-manifest-v1.mjs";
// R08 fiscal preflight: pure, deterministic, read-only, NEVER issues invoices.
// CEST is conditional on a validated ST decision; a missing CFOP/ICMS tax
// classification is never guessed from XML or GTIN.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const n=v=>typeof v==="number"||typeof v==="string"?Number(v):NaN;
const money=v=>{const x=n(v);return Number.isFinite(x)&&Math.abs(x)<1e9?Math.round(x*100):NaN;};
const digits=(v,len)=>typeof v==="string"&&new RegExp("^\\d{"+len+"}$").test(v);
const obj=x=>x&&typeof x==="object"&&!Array.isArray(x)?x:{};
const add=(s,v)=>{if(!s.includes(v))s.push(v);};
const okayId=v=>typeof v==="string"&&UUID.test(v);
const statuses=new Set(["auto_validated","validated","approved"]);
const acceptedSt=new Set(["not_applicable","not_subject","excluded","none"]);
function fiscalLineStatus(line,record,productLink,taxApproval,blockers){
  const pid=String(line?.product_id||"");
  if(!okayId(pid)){add(blockers,"item_without_product");return;}
  if(!record){add(blockers,"product_fiscal_profile_missing");return;}
  const p=obj(record);
  if(p.product_id!==pid){add(blockers,"product_fiscal_identity_mismatch");return;}
  if(!p.ncm||!digits(p.ncm,8))add(blockers,"product_ncm_missing_or_invalid");
  if(!Number.isInteger(n(p.origin_code))||n(p.origin_code)<0||n(p.origin_code)>8)
    add(blockers,"product_origin_missing");
  if(!statuses.has(String(p.review_status||""))||!p.validated_at)
    add(blockers,"product_fiscal_not_approved");
  if(!Number.isInteger(n(p.open_issue_count)))add(blockers,"product_readiness_evidence_missing");
  else if(n(p.open_issue_count)>0)add(blockers,"product_fiscal_issues_open");
  const st=String(p.st_status||"").toLowerCase();
  if(st==="applicable"){
    if(!digits(p.cest,7))add(blockers,"cest_required_for_st_item");
    if(!okayId(p.matched_st_rule_id))add(blockers,"st_legal_rule_not_validated");
  }else if(!acceptedSt.has(st))add(blockers,"st_applicability_undetermined");
  if(!productLink||productLink.status!=="matched"||n(productLink.bling_id)<=0
    ||String(productLink.source_id||"")!==pid)
    add(blockers,"bling_product_link_unverified");
  // The catalog's NCM/CEST by itself cannot establish outbound CFOP or
  // ICMS CST/CSOSN. Require human/tax-owner approved SALE tax rule.
  const tax=obj(taxApproval);
  if(tax.product_id!==pid||tax.approved!==true||!tax.approved_at
    ||!digits(tax.cfop,4)||!["CST","CSOSN"].includes(tax.icms_kind)
    ||!(tax.icms_kind==="CST"?digits(tax.icms_code,2):digits(tax.icms_code,3)))
    add(blockers,"sales_tax_rule_unapproved");
}

export function evaluateOrderFiscalR8(input){
  const x=obj(input),order=obj(x.order),completion=obj(x.completion),
    intent=obj(x.r7_intent),control=obj(x.fiscal_control),
    blingLink=obj(x.order_bling_link),remote=obj(x.bling_remote_evidence),
    rules=Array.isArray(x.active_rule_sets)?x.active_rule_sets:[],
    profiles=Array.isArray(x.fiscal_profiles)?x.fiscal_profiles:[],
    links=Array.isArray(x.product_links)?x.product_links:[],
    salesTaxRules=Array.isArray(x.approved_sales_tax_rules)?x.approved_sales_tax_rules:[],
    cfg=obj(x.fiscal_runtime),hub=obj(x.bling_runtime),errors=[];
  const orderId=String(order.id||"");
  if(!okayId(orderId)){add(errors,"order_not_found");return {ok:true,ready:false,blockers:errors,external_write:false};}
  if(order.status!=="ready"||order.cancelled_at||order.returned_at)
    add(errors,"order_not_ready");
  if(completion.order_id!==orderId||completion.phase!=="completed"
    ||completion?.metadata?.stock_applied!==true||!completion.completed_at)
    add(errors,"physical_separation_not_completed");
  const manifest=completion?.metadata?.r6_reconciliation;
  if(!manifest||manifest.ok!==true||manifest.ready!==true||manifest.order_id!==orderId
    ||!Array.isArray(manifest.lines)||manifest.lines.length===0
    ||(Array.isArray(manifest.blockers)&&manifest.blockers.length>0))
    add(errors,"r6_frozen_manifest_invalid");
  if(intent.order_id!==orderId||intent.status!=="verified"||n(intent.bling_order_id)<=0
    ||typeof intent.payload_hash!=="string"||!/^[0-9a-f]{64}$/.test(intent.payload_hash))
    add(errors,"r7_bling_order_not_verified");
  if(!manifest||!intent.manifest||stableJson(intent.manifest)!==stableJson(manifest))
    add(errors,"manifest_changed_after_bling_sync");
  const canonicalBlingId=n(order.bling_order_id),remoteBlingId=n(intent.bling_order_id);
  if(!Number.isInteger(canonicalBlingId)||canonicalBlingId<=0||
    canonicalBlingId!==remoteBlingId||blingLink.status!=="matched"
    ||blingLink.source_id!==orderId||n(blingLink.bling_id)!==canonicalBlingId)
    add(errors,"bling_order_identity_mismatch");

  // Existing invoice must be reconciled, NEVER newly emitted.
  if(n(control.bling_invoice_id)>0||control.dispatch_fiscal_status==="authorized"
     ||control.sefaz_status==="100")
    add(errors,"invoice_already_exists_reconcile_only");
  const jobs=Array.isArray(x.existing_fiscal_jobs)?x.existing_fiscal_jobs:[];
  if(jobs.some(j=>j&&j.status&&!["cancelled"].includes(j.status)))
    add(errors,"fiscal_job_already_exists_reconcile_only");

  const fiscal=manifest?obj(manifest.financial):{};
  const total=money(order.total),fTotal=money(fiscal.final_total),
    fiscalSubtotal=money(order.fiscal_subtotal),
    other=money(order.other_expenses??0),discount=money(order.discount??0),
    hidden=money(order.basket_hidden_adjustment??0);
  if(![total,fTotal,fiscalSubtotal,other,discount,hidden].every(Number.isSafeInteger)
    ||total<=0||fTotal!==total||fiscalSubtotal<0||other<0||discount<0||hidden<0
    ||fiscalSubtotal+other-discount!==total)
    add(errors,"fiscal_total_reconciliation_failed");
  if(money(fiscal.final_fiscal_subtotal)!==fiscalSubtotal||
    money(fiscal.other_expenses??0)!==other||
    money(fiscal.discount??0)!==discount||
    money(fiscal.basket_hidden_adjustment??0)!==hidden)
    add(errors,"r6_commercial_adjustments_mismatch");

  let checkedLines=0,pickedCents=0,missing=0;
  const seen=new Set(),profileById=new Map(profiles.map(z=>[z.product_id,z])),
    linksById=new Map(links.map(z=>[z.source_id,z])),
    salesById=new Map(salesTaxRules.map(z=>[z.product_id,z]));
  for(const line of Array.isArray(manifest?.lines)?manifest.lines:[]){
    const lineId=String(line.order_item_id||"");
    if(!okayId(lineId)||seen.has(lineId))add(errors,"duplicate_or_invalid_picked_item");
    seen.add(lineId);
    const expectedDeliverable=line.state==="separated"&&line.display_only!==true;
    if(line.deliverable!==expectedDeliverable||!["separated","missing"].includes(line.state))
      add(errors,"picked_line_state_invalid");
    if(line.state==="missing")missing++;
    if(!expectedDeliverable)continue;
    checkedLines++;
    const qty=n(line.quantity),unit=money(line.unit_price),amount=money(line.line_total);
    if(!Number.isFinite(qty)||qty<=0||Math.abs(qty-Math.round(qty*1000)/1000)>1e-8
      ||!Number.isSafeInteger(unit)||unit<0||!Number.isSafeInteger(amount)||amount<0
      ||Math.abs(Math.round(qty*unit)-amount)>1)
      add(errors,"picked_item_price_or_quantity_invalid");
    else pickedCents+=amount;
    const pid=String(line.product_id||"");
    fiscalLineStatus(line,profileById.get(pid),linksById.get(pid),salesById.get(pid),errors);
  }
  if(!checkedLines)add(errors,"no_taxable_deliverable_items");
  if(!Number.isSafeInteger(pickedCents)||pickedCents<=0)add(errors,"picked_total_invalid");
  // Basket's hidden adjustment is NOT a second product. Account for it in
  // the commercial delta and never apply it a second time in the XML.
  if(Number.isSafeInteger(total)&&Number.isSafeInteger(pickedCents)){
    const delta=total-pickedCents;
    if(!Number.isSafeInteger(delta)||Math.abs(delta)>1e9)
      add(errors,"commercial_delta_out_of_range");
    if(Number.isSafeInteger(fiscalSubtotal)&&
      Math.abs(pickedCents-fiscalSubtotal)>Math.max(0,hidden)+1)
      add(errors,"fiscal_product_sum_requires_review");
  }

  // Active legislation is a human-reviewed legal input, not a syntactic NCM.
  if(!rules.some(r=>r.status==="active"&&r.activated_at
      &&r.jurisdiction==="MT"&&r.tax_kind==="icms"
      &&(!r.valid_to||new Date(r.valid_to)>=new Date(x.as_of||"2026-10-08"))))
    add(errors,"active_mt_tax_rules_not_approved");
  if(cfg.require_fiscal_authorization_before_dispatch!==true)
    add(errors,"dispatch_fiscal_authorization_gate_disabled");
  if(cfg.enabled!==true||cfg.bling_invoice_prepare_enabled!==true
    ||!["homologation","canary","live"].includes(String(cfg.execution_mode||"")))
    add(errors,"fiscal_runtime_not_ready");
  if(hub.hub_enabled!==true||hub.orders_enabled!==true)
    add(errors,"bling_order_hub_not_ready");
  // R08 does NOT call external Bling. R09 must perform fresh GET of the
  // exact order and compare its commercial item projection against R7 hash.
  const remoteAge=new Date(x.as_of??Date.now()).getTime()-new Date(remote.checked_at||0).getTime();
  if(remote.source!=="bling_get"||remote.commercial_match!==true
     ||n(remote.bling_order_id)!==remoteBlingId
     ||remote.r7_payload_hash!==intent.payload_hash
     ||remote.invoice_linked!==false||!remote.checked_at
     ||!Number.isFinite(remoteAge)||remoteAge<0||remoteAge>300000)
    add(errors,"fresh_bling_order_readback_required");
  return {ok:true,ready:errors.length===0,blockers:errors,
    order_id:orderId,order_number:order.order_number||null,
    bling_order_id:Number.isFinite(remoteBlingId)?remoteBlingId:null,
    line_counts:{picked:checkedLines,missing},
    monetary:{total_cents:total,product_lines_cents:pickedCents,
      commercial_delta_cents:total-pickedCents,other_expenses_cents:other,
      discount_cents:discount,hidden_adjustment_cents:hidden},
    fiscal_status:"preflight_only",external_write:false,invoice_created:false,
    approval_required:true};
}
