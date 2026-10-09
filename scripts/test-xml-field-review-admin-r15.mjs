import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync(new URL("../vitrine/admin/index.html",import.meta.url),"utf8");
const from=html.indexOf("  function xmlCatalogFieldReviewMarkup(");
const to=html.indexOf("  function xmlCatalogDetailRefresh(",from);
assert.ok(from>=0&&to>from);
const markup=html.slice(from,to);
const make=new Function("state","esc","dateOnly","purchaseMoney",
  markup+"\nreturn xmlCatalogDetailMarkup;");
const escapeValue=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const item={purchase_item_id:"item-1",observation_id:"obs-1",
 linked_product_id:"product-1",linked_product_name:"Arroz",commercial_gtin:"7890000000000",
 purchase_unit:"UN",tax_gtin:"7890000000000",source_state:"xml_verified",
 xml_description:"Arroz",supplier_name:"Fornecedor",item_number:1};
const state={xmlCatalogDetailLoading:false,xmlCatalogSelectedObservation:"item-1",
 xmlCatalogDetail:{candidate:{display_name:"Arroz",observations_count:1,suppliers_count:1,ncm_variations:1},observations:[item]},
 xmlFieldReviewLoaded:false,xmlFieldReviewProductId:null,xmlFieldReviewItems:[]};
const render=()=>make(state,escapeValue,escapeValue,escapeValue)();
let page=render();
assert.match(page,/Revisão campo a campo/);
assert.match(page,/id="xmlFieldReviewLoad"/);
assert.doesNotMatch(page,/id="xmlFieldReviewPrepare"/,"history and actions must stay lazy");
assert.match(page,/NÃO altera produto, preço, estoque, fiscal ou Bling/);
state.xmlFieldReviewLoaded=true;state.xmlFieldReviewProductId="product-1";
state.xmlFieldReviewItems=[{id:"review-1",field_name:"name",
 original_value:"Nome anterior",proposed_value:"Novo nome",status:"pending",revision:0}];
page=render();
assert.match(page,/id="xmlFieldReviewPrepare"/);
assert.match(page,/data-xml-field-decision="approve"/);
assert.match(page,/data-xml-field-decision="reject"/);
state.xmlFieldReviewItems=[{id:"review-2",field_name:"ncm",
 original_value:"19059090",proposed_value:"19059010",status:"fiscal_review_required",revision:0}];
page=render();
assert.match(page,/Análise fiscal obrigatória/);
assert.doesNotMatch(page,/data-xml-field-decision="approve"/);
state.xmlFieldReviewItems=[{id:"review-3",field_name:"name",
 original_value:"<img src=x onerror=bad()>",proposed_value:"Produto",status:"approved",revision:1}];
page=render();
assert.match(page,/&lt;img/);assert.doesNotMatch(page,/<img src=x/);
assert.match(page,/data-xml-field-decision="reopen"/);
state.xmlCatalogDetail.observations=[{...item,linked_product_id:null,commercial_gtin:"SEM GTIN",purchase_unit:"KG"}];
page=render();assert.doesNotMatch(page,/id="xmlFieldReviewLoad"/);
const startBind=html.indexOf("  function xmlCatalogDetailBind(");
const endBind=html.indexOf("  async function xmlCatalogDetailSave(",startBind);
const bind=html.slice(startBind,endBind);
assert.match(bind,/if\(!confirm\('Preparar proposta deste campo/);
assert.match(bind,/confirmation:'PREPARAR_CAMPO_XML'/);
assert.match(bind,/confirmation:labels\[decision\]/);
assert.match(bind,/r\.status==='fiscal_review_required'/);
assert.match(bind,/expected_revision:Number\(r\.revision\)/);
assert.match(bind,/await xmlCatalogFieldReviewLoad\(productId,state\.xmlCatalogDetailKey\)/);
assert.match(html,/if\(state\.xmlCatalogOpen\)await loadXmlCatalog\(\)/,"history must not preload");
console.log("PASS XML R15 UI: on-click history, explicit proposal/decision, fiscal gate, escape, no master updates");
