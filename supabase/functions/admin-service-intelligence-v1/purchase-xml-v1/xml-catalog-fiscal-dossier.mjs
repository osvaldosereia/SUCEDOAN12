// R25: server-side fiscal evidence dossier. Read-only by construction.
// NF-e supplier fields are NOT tax classifications approved for a retail product.
import { compareCandidateFullHistory } from "./xml-catalog-full-comparison.mjs";

const GTIN=/^(?:[0-9]{8}|[0-9]{12,14})$/;
const text=v=>String(v??"").trim();
function validCheckDigit(v){
  const n=text(v);
  if(!GTIN.test(n))return false;
  let sum=0,weight=3;
  for(let i=n.length-2;i>=0;i--){sum+=Number(n[i])*weight;weight=weight===3?1:3;}
  return (10-sum%10)%10===Number(n[n.length-1]);
}
function values(x){
  return Array.isArray(x?.xml_values)?x.xml_values.map(v=>({
    value:text(v.value),observations:Number(v.observations)||0,
    suppliers:Number(v.suppliers)||0,last_issued_at:v.last_issued_at||null
  })):[];
}
export function buildFiscalDossier(history){
  const cmp=history?.field_comparisons||{};
  const fields=Array.isArray(cmp.fields)?cmp.fields:[];
  const ncm=fields.find(f=>f.field==="xml_ncm")||{};
  const cest=fields.find(f=>f.field==="xml_cest")||{};
  const commercial=fields.find(f=>f.field==="commercial_gtin")||{};
  const commercialBarcodes=values(commercial);
  const taxBarcodes=values(cmp.tax_gtin_evidence);
  const purchaseUnits=values(cmp.packaging_evidence);
  const taxUnits=Array.isArray(cmp.packaging_evidence?.tax_unit_values)?
     cmp.packaging_evidence.tax_unit_values.map(v=>({value:text(v.value),
       observations:Number(v.observations)||0,suppliers:Number(v.suppliers)||0})):[];
  const ncmVals=values(ncm),cestVals=values(cest);
  const malformedGtins=[...commercialBarcodes,...taxBarcodes]
    .filter(x=>!validCheckDigit(x.value)).map(x=>x.value);
  const scope=history?.comparison_scope||{};
  const partial=scope.partial!==false||scope.kind!=="full_history";
  const invalidFields=ncmVals.length===0||cestVals.length===0;
  const isConflict=cmp.linked_products_count>1||
    [ncm,cest].some(f=>["identity_review","supplier_disagreement","catalog_disagreement"].includes(f.status));
  const packagingReview=taxBarcodes.length>1||commercialBarcodes.length>1||
    purchaseUnits.length>1||taxUnits.length>1||
    taxBarcodes.some(t=>commercialBarcodes.length&&!commercialBarcodes.some(c=>c.value===t.value))||
    (purchaseUnits.length===1&&taxUnits.length===1&&purchaseUnits[0].value!==taxUnits[0].value);
  const reasons=[];
  if(partial)reasons.push("partial_history");
  if(cmp.linked_products_count!==1)reasons.push("product_identity_not_unique");
  if(isConflict)reasons.push("fiscal_source_conflict");
  if(invalidFields)reasons.push("fiscal_source_incomplete");
  if(packagingReview)reasons.push("packaging_or_tax_gtin_review");
  if(malformedGtins.length)reasons.push("gtin_checksum_invalid");
  return {
    ok:true,readonly:true,source:"xml_verified_supplier_evidence",
    review_state:partial?"partial_history":
      isConflict?"conflict_requires_review":"manual_fiscal_review_required",
    comparison_scope:scope,
    reviewed_product_id:cmp.compared_product?.product_id||null,
    fields:{
      ncm:{catalog_value:ncm.catalog_value||null,status:ncm.status||"not_in_xml",values:ncmVals},
      cest:{catalog_value:cest.catalog_value||null,status:cest.status||"not_in_xml",values:cestVals},
      commercial_gtin:{catalog_value:commercial.catalog_value||null,
        status:commercial.status||"not_in_xml",values:commercialBarcodes},
      tax_gtin:{values:taxBarcodes},purchase_unit:{values:purchaseUnits},
      tax_unit:{values:taxUnits}
    },reasons:[...new Set(reasons)],
    malformed_gtins:[...new Set(malformedGtins)],
    ncm_cest_legal_eligibility_confirmed:false,
    conversion_factor_authorized:false,
    fiscal_approved:false,
    product_updated:false,stock_updated:false,price_updated:false,
    cost_updated:false,bling_called:false,finance_updated:false
  };
}
export async function loadFiscalDossier(sb,candidateKey){
  const result=await compareCandidateFullHistory(sb,candidateKey);
  if(!result.ok)return result;
  return {candidate_key:result.candidate_key,...buildFiscalDossier(result)};
}
