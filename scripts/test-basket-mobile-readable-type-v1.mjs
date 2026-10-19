import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync("vitrine/index.html","utf8");
const style=html.slice(html.indexOf("<style>"),html.indexOf("</style>"));

assert.ok(style.includes("/* Accessible typography for basket editor */"),"basket typography override is present");
assert.ok(style.includes(".basket-item-mold-card .checkout-copy .checkout-name{font-size:18px"),"basket product names use readable mobile sizing");
assert.ok(style.includes(".basket-item-mold-card .basket-option-label{font-size:16px"),"carousel guidance meets mobile body sizing");
assert.ok(style.includes(".basket-option-carousel-track .basket-option-choice-name{font-size:15px"),"alternative product names are readable");
assert.ok(style.includes(".basket-option-carousel-track .basket-option-choice-price{font-size:16px"),"alternative prices are readable");
assert.ok(style.includes(".basket-item-remove{min-height:48px")&&style.includes("font-size:16px"),"remove button has a comfortable touch target and readable label");
assert.ok(style.includes(".basket-option-carousel-buttons button{min-width:48px;min-height:48px"),"carousel arrows have comfortable touch targets");
assert.ok(style.includes("overflow-x:auto"),"the brand carousel remains horizontally scrollable");


const optionRendererSource=html.slice(html.indexOf("function moldItemOptions("),html.indexOf("\\n    function moldExtraRow"));
assert.ok(optionRendererSource.startsWith("function moldItemOptions("),"basket option renderer is present");
const renderOptions=new Function("esc","money","safeImage","moldSelectedProduct","moldOptionShortName",optionRendererSource+"\\nreturn moldItemOptions;")(
  value=>String(value??""),value=>String(value??""),value=>String(value??""),item=>item,value=>String(value??"")
);
const singleOption=renderOptions({name:"Arroz",product_id:"p1",alternatives:[{product_id:"p1",name:"Arroz",price_cents:100}]},0);
assert.equal(singleOption,"","products with one available option do not render a redundant selector");
const multipleOptions=renderOptions({name:"Arroz",product_id:"p1",alternatives:[{product_id:"p1",name:"Arroz",price_cents:100},{product_id:"p2",name:"Arroz tipo 1",price_cents:110}]},1);
assert.ok(multipleOptions.includes("basket-option-carousel-track"),"products with multiple options keep the carousel");
assert.equal((multipleOptions.match(/class="basket-option-choice /g)||[]).length,2,"all product options remain selectable");

console.log("Basket mobile readable typography and option selector: PASS");
