// Source-only comparison for XML NF-e candidate dossiers.
// All values are evidence, NEVER authorizations to update products, taxes or stock.
const value=(v)=>String(v??"").trim();
const text=(v)=>value(v).slice(0,300);
function groups(rows,field,validator){
  const grouped=new Map();
  for(const o of rows){
    const val=value(o?.[field]);
    if(!val||(validator&&!validator(val)))continue;
    const key=val.toUpperCase();
    const old=grouped.get(key)||{value:val,observations:0,suppliers:new Set(),last_issued_at:null};
    old.observations+=1;
    const supplier=value(o.supplier_document)||value(o.supplier_name);
    if(supplier)old.suppliers.add(supplier);
    const dt=value(o.issued_at);
    if(dt&&(!old.last_issued_at||dt>old.last_issued_at))old.last_issued_at=dt;
    grouped.set(key,old);
  }
  return [...grouped.values()].map(g=>({
    value:g.value,observations:g.observations,
    suppliers:g.suppliers.size,last_issued_at:g.last_issued_at
  })).sort((a,b)=>b.observations-a.observations||a.value.localeCompare(b.value));
}
function status(existing,groups,identityConflict){
  if(identityConflict)return "identity_review";
  if(!groups.length)return "not_in_xml";
  if(groups.length>1)return "supplier_disagreement";
  if(!existing)return "missing_in_catalog";
  return value(existing).toUpperCase()===value(groups[0].value).toUpperCase()
    ?"aligned":"catalog_disagreement";
}
export function catalogXmlComparison(observations) {
  const rows=Array.isArray(observations)?observations:[];
  const linked=[...new Set(rows.map(x=>value(x.linked_product_id)).filter(Boolean))];
  const identityConflict=linked.length>1;
  const linkedRow=linked.length===1
    ?rows.find(x=>value(x.linked_product_id)===linked[0])||null:null;
  const catalog={
    product_id:linked.length===1?linked[0]:null,
    name:linkedRow?.linked_product_name||null,
    ncm:linkedRow?.linked_product_ncm||null,
    cest:linkedRow?.linked_product_cest||null,
    gtin:linkedRow?.linked_product_gtin||null
  };
  const get=(field,original,label,valid,notes)=>{
    const found=groups(rows,field,valid);
    return {field,label,catalog_value:catalog[original]||null,
      xml_values:found,status:status(catalog[original],found,identityConflict),
      requires_human_review:true,notes};
  };
  const numeric=(size)=>(v)=>new RegExp("^\\\\d{"+size+"}$").test(v);
  const result=[
    get("xml_ncm","ncm","NCM",numeric(8),"NCM do fornecedor não é homologação fiscal do produto."),
    get("xml_cest","cest","CEST",numeric(7),"CEST exige enquadramento do produto e legislação, não apenas concordância de XMLs."),
    get("commercial_gtin","gtin","EAN comercial",
      (v)=>/^\\d{8}$|^\\d{12,14}$/.test(v),
      "EAN comercial pode ser da caixa, fardo ou unidade; conferir antes de vincular."),
  ];
  // Never compare uCom to the sellable unit: purchase and sales quantities often differ.
  const units=groups(rows,"purchase_unit",null);
  return {
    compared_product:catalog,
    linked_products_count:linked.length,
    observations_compared:rows.length,
    fields:result,
    packaging_evidence:{
      field:"purchase_unit",xml_values:units,
      status:units.length>1?"multiple_purchase_units":"reference_only",
      notes:"Unidade da NF-e é a unidade de COMPRA. Não atualizar a unidade de venda ou fator de conversão sem conferir embalagem."
    },
    prices_are_historical_only:true,
    fiscal_auto_approved:false,product_autoupdate_allowed:false,stock_autoupdate_allowed:false
  };
}
