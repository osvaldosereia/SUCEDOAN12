from pathlib import Path


def rep(s, old, new, label):
    if old not in s:
        raise SystemExit(f'anchor not found: {label}')
    return s.replace(old, new, 1)


edge_path = Path('supabase/functions/admin-products-live-v1/index.ts')
edge = edge_path.read_text()
edge = rep(
    edge,
    '.eq("identifier_kind","base_gtin").eq("status","confirmed").in("identifier_value",desired);',
    '.in("identifier_kind",["base_gtin","package_gtin"]).eq("status","confirmed").in("identifier_value",desired);',
    'identifier prevalidation kinds',
)
old_fiscal_fn = '''async function saveProductEditorFiscal(productId:string,value:any,operator:any){
  const f=normalizedFiscal(value),now=new Date().toISOString();
  const q=await db.from("product_fiscal_profiles").select("*").eq("product_id",productId).maybeSingle();if(q.error)throw q.error;
  const before=q.data||{};
  const row:any={
    ...before,product_id:productId,ncm:f.ncm,cest:f.cest,origin_code:f.origin_code,
    commercial_gtin:f.commercial_gtin,tax_gtin:f.tax_gtin,commercial_unit:f.commercial_unit,tax_unit:f.tax_unit,
    fiscal_description:f.fiscal_description,st_status:before.st_status||"unknown",
    classification_source:"admin_product_editor",review_status:"human_validated",validated_at:now,
    metadata:{...meta(before.metadata),last_manual_edit_at:now,last_manual_edit_by:tx(operator,80)||"Operação"},updated_at:now
  };
  delete row.created_at;
  const up=await db.from("product_fiscal_profiles").upsert(row,{onConflict:"product_id"});if(up.error)throw up.error;
  return {ok:true};
}'''
new_fiscal_fn = '''async function saveProductEditorFiscal(productId:string,value:any,operator:any){
  const f=normalizedFiscal(value),now=new Date().toISOString();
  const q=await db.from("product_fiscal_profiles").select("*").eq("product_id",productId).maybeSingle();if(q.error)throw q.error;
  const before=q.data||null,keys=["ncm","cest","origin_code","commercial_gtin","tax_gtin","commercial_unit","tax_unit","fiscal_description"];
  const comparable=(v:any)=>v===null||v===undefined||String(v).trim()===""?null:String(v);
  const fiscalChanged=keys.some(k=>comparable(before?.[k])!==comparable((f as any)[k]));
  if(!fiscalChanged)return {ok:true,changed:false};
  const row:any={
    ...(before||{}),product_id:productId,ncm:f.ncm,cest:f.cest,origin_code:f.origin_code,
    commercial_gtin:f.commercial_gtin,tax_gtin:f.tax_gtin,commercial_unit:f.commercial_unit,tax_unit:f.tax_unit,
    fiscal_description:f.fiscal_description,st_status:before?.st_status||"unknown",
    classification_source:"admin_product_editor",review_status:"human_validated",validated_at:now,
    metadata:{...meta(before?.metadata),last_manual_edit_at:now,last_manual_edit_by:tx(operator,80)||"Operação"},updated_at:now
  };
  delete row.created_at;
  const up=await db.from("product_fiscal_profiles").upsert(row,{onConflict:"product_id"});if(up.error)throw up.error;
  return {ok:true,changed:true};
}'''
edge = rep(edge, old_fiscal_fn, new_fiscal_fn, 'fiscal audit only on change')
edge_path.write_text(edge)

admin_path = Path('vitrine/admin/index.html')
admin = admin_path.read_text()
admin = rep(
    admin,
    "const fiscal=isDuplicate?{}:(p?.fiscal||{}),additionalGtins=isDuplicate?[]:(Array.isArray(p?.additional_gtins)?p.additional_gtins:[]);",
    "const fiscal=isDuplicate?{ncm:p?.ncm||p?.fiscal?.ncm||''}:(p?.fiscal||{}),additionalGtins=isDuplicate?[]:(Array.isArray(p?.additional_gtins)?p.additional_gtins:[]);",
    'duplicate fiscal baseline',
)
admin = rep(
    admin,
    "'<label><span>GTIN comercial</span><input name=\"fiscal_commercial_gtin\" inputmode=\"numeric\" value=\"'+esc(fiscal?.commercial_gtin||p?.gtin||'')+'\"></label>'+",
    "'<label><span>GTIN comercial</span><input name=\"fiscal_commercial_gtin\" inputmode=\"numeric\" value=\"'+esc(isDuplicate?'':(fiscal?.commercial_gtin||p?.gtin||''))+'\"></label>'+",
    'duplicate fiscal gtin',
)
admin = rep(
    admin,
    "  function centsFromInput(v){\n",
    "  function productFiscalDraft(form){return {ncm:form.querySelector('[name=\"fiscal_ncm\"]')?.value||'',cest:form.querySelector('[name=\"fiscal_cest\"]')?.value||'',origin_code:form.querySelector('[name=\"fiscal_origin_code\"]')?.value||'',commercial_gtin:form.querySelector('[name=\"fiscal_commercial_gtin\"]')?.value||'',tax_gtin:form.querySelector('[name=\"fiscal_tax_gtin\"]')?.value||'',commercial_unit:form.querySelector('[name=\"fiscal_commercial_unit\"]')?.value||'',tax_unit:form.querySelector('[name=\"fiscal_tax_unit\"]')?.value||'',fiscal_description:form.querySelector('[name=\"fiscal_description\"]')?.value||''}}\n  function centsFromInput(v){\n",
    'fiscal draft helper',
)
admin = rep(
    admin,
    "    const form=$('#productForm');\n    const auto=form.querySelector('[name=\"auto_expiry_offer_enabled\"]');",
    "    const form=$('#productForm');\n    form.dataset.fiscalOriginal=JSON.stringify(productFiscalDraft(form));\n    const auto=form.querySelector('[name=\"auto_expiry_offer_enabled\"]');",
    'fiscal original dataset',
)
admin = rep(
    admin,
    "    const form=new FormData($('#productForm')),btn=$('#saveProduct');\n",
    "    const formEl=$('#productForm'),form=new FormData(formEl),btn=$('#saveProduct');\n    const fiscalDraft=productFiscalDraft(formEl),fiscalOriginal=formEl.dataset.fiscalOriginal||'',fiscalChanged=JSON.stringify(fiscalDraft)!==fiscalOriginal;\n",
    'fiscal changed save prelude',
)
old_fiscal_payload = "          fiscal:{ncm:form.get('fiscal_ncm'),cest:form.get('fiscal_cest'),origin_code:form.get('fiscal_origin_code'),commercial_gtin:form.get('fiscal_commercial_gtin'),tax_gtin:form.get('fiscal_tax_gtin'),commercial_unit:form.get('fiscal_commercial_unit'),tax_unit:form.get('fiscal_tax_unit'),fiscal_description:form.get('fiscal_description')},\n"
admin = rep(
    admin,
    old_fiscal_payload,
    "          ...(fiscalChanged?{fiscal:fiscalDraft}:{}),\n",
    'conditional fiscal payload',
)
admin_path.write_text(admin)

print('review fixes applied')
