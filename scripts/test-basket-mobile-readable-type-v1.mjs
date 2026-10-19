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

console.log("Basket mobile readable typography: PASS");
