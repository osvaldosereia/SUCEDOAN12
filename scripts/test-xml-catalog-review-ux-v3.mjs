import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync("vitrine/admin/index.html","utf8");
const from=html.indexOf("  function xmlCatalogFiscalAlerts(");
const until=html.indexOf("  function bindXmlCatalog(){",from);
assert.ok(from>0 && until>from,"New XML review UI helpers must exist");
const code=html.slice(from,until);
const state={
  xmlCatalogOpen:true,
  xmlCatalogSelectedObservation:"item-1",
  xmlCatalogDraft:{role:"package",factor:"12",search:"Limpol",newName:"Limpol Teste"},
  xmlCatalogDetail:{candidate:{display_name:"Limpol 500 ml",observations_count:1,suppliers_count:1,ncm_variations:1},
    observations:[{purchase_item_id:"item-1",commercial_gtin:"7891022640007",purchase_unit:"UN",
      xml_description:"Detergente Limpol Coco",xml_ncm:"34025000",linked_product_ncm:"34022000",
      xml_cest:"1101100",linked_product_cest:"1101000",linked_product_id:"product-1",
      linked_product_name:"Detergente Coco",issued_at:"2026-10-08"}]}
};
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;");
const fields={"#xmlDetailRole":"package","#xmlDetailFactor":"24","#xmlDetailProductSearch":"Limpol Neutro","#xmlDetailNewName":"Nome novo"};
const host={querySelector(k){return k in fields?{value:fields[k]}:null},innerHTML:""};
const get=k=>k==="#xmlCatalogBody"?host:null;
const f=new Function("state","esc","dateOnly","purchaseMoney","$","xmlCatalogDisplayHtml","bindXmlCatalogInner",
  code+"\nreturn {render:xmlCatalogDetailMarkup,refresh:xmlCatalogDetailRefresh,alerts:xmlCatalogFiscalAlerts};");
const app=f(state,esc,v=>v,v=>v,get,()=>"<div>ok</div>",()=>{});
const flagged=app.render();
assert.match(flagged,/NCM do XML diverge do cadastro/);
assert.match(flagged,/CEST do XML diverge do perfil fiscal/);
assert.match(flagged,/nenhum campo será alterado/);
const fiscalFormatted=app.alerts({...state.xmlCatalogDetail.observations[0],
  xml_ncm:"3402.20.00",linked_product_ncm:"34022000",
  xml_cest:"11.011.00",linked_product_cest:"1101100"});
assert.equal(fiscalFormatted,"","Formatting punctuation alone must not be a fiscal conflict");
state.xmlCatalogDetail.observations[0].linked_product_id=null;
const form=app.render();
assert.match(form,/<option value="package" selected>/);
assert.match(form,/id="xmlDetailFactor"[^>]*value="12"/);
assert.match(form,/id="xmlDetailProductSearch"[^>]*value="Limpol"/);
assert.match(form,/id="xmlDetailNewName"[^>]*value="Limpol Teste"/);
app.refresh(true);
assert.deepEqual(state.xmlCatalogDraft,{
  role:"package",factor:"24",search:"Limpol Neutro",newName:"Nome novo"
});
app.refresh(false);
assert.equal(host.innerHTML,"<div>ok</div>");
assert.match(code,/state\.xmlCatalogDraft=null;xmlCatalogDetailRefresh\(false\)/,
  "Switching an XML item must discard the previous line's draft");
assert.match(code,/if\(!confirm\(msg\)\)return/,"Manual confirmation must stay mandatory");
assert.match(code,/catalog_evidence_only:true/,"Keep catalog-only safety mode");
assert.doesNotMatch(code,/update_stock|\\.from\(["']products["']\)/,
  "The historical viewer must not change the product database");
console.log("PASS: XML catalog draft persistence, fiscal discrepancy alerts, and guarded manual identification");
