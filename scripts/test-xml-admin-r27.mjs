import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
const ui=readFileSync(new URL("../vitrine/admin/index.html",import.meta.url),"utf8");
const parent=readFileSync(new URL("../supabase/functions/admin-service-intelligence-v1/index.ts",import.meta.url),"utf8");
const xml=readFileSync(new URL("../supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts",import.meta.url),"utf8");
const inline=[...ui.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)].filter(x=>x[1].trim());
assert.ok(inline.length>=3,"All inline scripts must be parsable");
for(const script of inline)new Script(script[1],{filename:"vitrine/admin/index.html"});
for(const s of [
 "function xmlCatalogFiscalEvidenceMarkup()","function xmlCatalogFieldApplicationMarkup(active)",
 "async function xmlCatalogFiscalLoad()","xml_catalog_fiscal_dossier",
 "xml_field_apply_preview","xml_field_apply_list","xml_field_apply_commit",
 "xml_field_apply_rollback","data-xml-apply-preview","data-xml-apply-commit",
 "data-xml-apply-rollback","xmlFiscalRequestId","state.xmlFieldApplyBusy",
 "APLICAR_NOME_APROVADO_XML","REVERTER_NOME_APLICADO_XML"
])assert.ok(ui.includes(s),"R27 UI missing "+s);
assert.ok(ui.includes("if(prompt('Digite APLICAR_NOME_APROVADO_XML"));
assert.ok(ui.includes("if(prompt('Digite REVERTER_NOME_APLICADO_XML"));
assert.ok(ui.includes("p.can_apply!==true"),"Client should fail closed without server preview");
assert.ok(ui.includes("preview.can_apply===true"),"Preview must control commit visibility");
assert.ok(ui.includes("xmlFiscalData=data"),"Fiscal dossier must be on demand");
assert.ok(ui.includes("state.xmlCatalogDetailKey!==key"),"Late responses must not change candidate");
assert.ok(ui.includes("state.xmlFieldApplyPreview=null"),"Old approvals should not remain armed");
assert.match(xml,/action==="xml_catalog_fiscal_dossier"/);
assert.match(xml,/xmlFieldApplyGateway\\(sb,action,body,a\\)/);
assert.match(parent,/if\\(action==="purchase_xml"\\)\\{\\s*return await handlePurchaseXmlRequest\\(req,body,false\\);/);
const applyGateway=readFileSync(new URL("../supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/xml-catalog-field-apply-gateway.mjs",import.meta.url),"utf8");
assert.ok(applyGateway.includes('body.confirmation!=="APLICAR_NOME_APROVADO_XML"'));
assert.ok(applyGateway.includes('body.confirmation!=="REVERTER_NOME_APLICADO_XML"'));
assert.match(applyGateway,/auth\\?\\.internal===false/);
assert.doesNotMatch(ui,/SUPABASE_SERVICE_ROLE_KEY\\s*=|sb_secret_[a-z0-9]+/i);
console.log("PASS R27: Admin scripts parse, fiscal dossier lazy, preview/apply/rollback UX and server authorization invariants");
