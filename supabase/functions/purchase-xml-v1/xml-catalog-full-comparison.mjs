// R20: bounded, on-demand complete XML history comparison.
// Reads source evidence only, never writes catalog/master product, finance or stock.
import { catalogXmlComparison } from "./xml-catalog-comparison.mjs";

export const XML_COMPARISON_PAGE_SIZE = 200;
export const XML_COMPARISON_MAX_ROWS = 5000;
const FIELDS = [
  "observation_id","linked_product_id","linked_product_name",
  "linked_product_gtin","linked_product_ncm","linked_product_cest",
  "supplier_document","supplier_name","issued_at",
  "commercial_gtin","tax_gtin","xml_ncm","xml_cest",
  "purchase_unit","tax_unit","purchase_quantity","tax_quantity"
].join(",");

export async function compareCandidateFullHistory(sb,candidateKey,{
  pageSize=XML_COMPARISON_PAGE_SIZE,maxRows=XML_COMPARISON_MAX_ROWS
}={}) {
  const key=String(candidateKey??"").trim();
  if(key.length>210||!(/^(?:gtin:|tax_gtin:|supplier:|unidentified:)/).test(key))
    return {ok:false,status:400,error:"invalid_candidate_key"};
  // Fixed server caps; the browser cannot enlarge a query by adding parameters.
  const size=Math.min(XML_COMPARISON_PAGE_SIZE,Math.max(1,Math.trunc(pageSize)||XML_COMPARISON_PAGE_SIZE));
  const cap=Math.min(XML_COMPARISON_MAX_ROWS,Math.max(1,Math.trunc(maxRows)||XML_COMPARISON_MAX_ROWS));
  const rows=[],seen=new Set();
  let offset=0,total=null,unstable=false,pages=0,endedEarly=false;
  while(offset<cap&&(total===null||offset<total)) {
    const take=Math.min(size,cap-offset);
    const result=await sb.from("purchase_xml_catalog_observation_details_v2")
      .select(FIELDS,{count:"exact"})
      .eq("candidate_key",key)
      .order("issued_at",{ascending:false,nullsFirst:false})
      .order("document_id",{ascending:true})
      .order("item_number",{ascending:true})
      .range(offset,offset+take-1);
    if(result.error)throw new Error("xml_full_comparison_query_failed");
    if(!Array.isArray(result.data))throw new Error("xml_full_comparison_query_failed");
    if(!Number.isInteger(result.count)||result.count<0)
      throw new Error("xml_full_comparison_count_missing");
    if(total!==null&&total!==result.count)unstable=true;
    total=result.count;
    pages++;
    const fetched=result.data;
    for(const row of fetched) {
      const id=String(row?.observation_id||"");
      if(!id||seen.has(id)){unstable=true;continue;}
      seen.add(id);rows.push(row);
    }
    offset+=fetched.length;
    if(!fetched.length||fetched.length<take&&offset<total){endedEarly=true;break;}
  }
  if(rows.length!==Math.min(total??0,cap))unstable=true;
  const partial=unstable||endedEarly||offset<(total??0);
  const reason=unstable||endedEarly?"unstable_pagination":partial?"limit_reached":null;
  // If the history changes during a multi-page scan, return evidence marked PARTIAL,
  // never assert reconciliation or approvals based on a moving snapshot.
  return {ok:true,readonly:true,candidate_key:key,
    field_comparisons:catalogXmlComparison(rows),
    comparison_scope:{
      kind:partial?"bounded_history":"full_history",
      compared_observations:rows.length,total_observations:total,
      partial,reason,pages,max_rows:cap
    },
    can_auto_match:false,can_auto_apply_fiscal:false,
    can_auto_move_stock:false,prices_are_historical_only:true,
    product_updated:false,bling_called:false,finance_updated:false};
}
