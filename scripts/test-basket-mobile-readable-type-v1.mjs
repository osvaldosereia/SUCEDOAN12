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

const rendererStart=html.indexOf("function moldItemOptions(");
const rendererEnd=html.indexOf("function moldExtraRow(",rendererStart);
assert.ok(rendererStart>=0&&rendererEnd>rendererStart,"basket option renderer is present");
const optionRendererSource=html.slice(rendererStart,rendererEnd).trim();
const renderOptions=new Function("esc","money","safeImage","moldSelectedProduct","moldOptionShortName",optionRendererSource+"; return moldItemOptions;")(
  value=>String(value??""),value=>String(value??""),value=>String(value??""),item=>item,value=>String(value??"")
);
const singleOption=renderOptions({name:"Arroz",product_id:"p1",alternatives:[{product_id:"p1",name:"Arroz",price_cents:100}]},0);
assert.equal(singleOption,"","products with one available option do not render a redundant selector");
const multipleOptions=renderOptions({name:"Arroz",product_id:"p1",alternatives:[{product_id:"p1",name:"Arroz",price_cents:100},{product_id:"p2",name:"Arroz tipo 1",price_cents:110}]},1);
assert.ok(multipleOptions.includes("basket-option-carousel-track"),"products with multiple options keep the carousel");
assert.equal((multipleOptions.match(/class="basket-option-choice /g)||[]).length,2,"all product options remain selectable");


assert.ok(style.includes(".product-card .name{font-size:16px"),"catalog product names use readable 16px sizing");
assert.ok(style.includes(".product-card .meta{font-size:12px"),"catalog product details use readable 12px sizing");
assert.ok(style.includes(".product-buy-row .price{font-size:18px"),"catalog product prices use readable 18px sizing");
assert.ok(style.includes(".offer-tag{position:absolute;z-index:1;top:8px;left:8px;display:inline-flex;background:#fff;color:var(--offer);border:1px solid #f2d8dc;border-radius:999px;padding:5px 8px;font-size:12px"),"offer labels are not rendered as tiny 9px text");
assert.ok(style.includes(".basket-card.basket-size-card .basket-card-title{text-align:center;text-transform:uppercase;font-size:16px!important"),"basket size card titles use readable sizing");
assert.ok(style.includes(".basket-card-item-total{align-self:center;max-width:100%;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.68);color:#174b35;font-size:14px"),"basket item counts use readable sizing");
assert.ok(style.includes(".basket-card .add{width:100%!important;min-height:44px!important;margin:auto 0 0!important;padding:9px 8px!important;border-radius:10px;font-size:14px!important"),"basket card actions use readable sizing");

console.log("Basket mobile readable typography and option selector: PASS");
