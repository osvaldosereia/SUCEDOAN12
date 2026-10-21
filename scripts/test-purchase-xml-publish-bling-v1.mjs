import fs from "node:fs";
import assert from "node:assert/strict";
import { ensureXmlProductInBling } from "../supabase/functions/admin-products-live-v1/xml-product-publication-policy.mjs";

const product={id:"product-1",gtin:"7891910000197"};
let calls=0,last=null;
const existing=await ensureXmlProductInBling(product,async input=>{calls++;last=input;return {ok:true,bling_id:8001,created:false}});
assert.deepEqual(existing,{ok:true,bling_product_id:8001,created:false,linked:true});
assert.equal(calls,1);
const created=await ensureXmlProductInBling(product,async()=>({ok:true,bling_id:8002,created:true}));
assert.equal(created.bling_product_id,8002);
assert.equal(created.created,true);
const retry=await ensureXmlProductInBling(product,async input=>{assert.equal(input.idempotency_key,last.idempotency_key);return {ok:true,bling_id:8002,created:false}});
assert.equal(retry.ok,true,"a retry for the same product keeps the same identity key");
let calledForMissing=false;
const missing=await ensureXmlProductInBling({...product,gtin:""},async()=>{calledForMissing=true;return {ok:true,bling_id:1}});
assert.equal(missing.ok,false);
assert.equal(calledForMissing,false);
const failed=await ensureXmlProductInBling(product,async()=>({ok:false,error:"bling_timeout"}));
assert.equal(failed.ok,false);

const source=fs.readFileSync("supabase/functions/admin-products-live-v1/index.ts","utf8");
assert.match(source,/async function ensureXmlProductInBling\(/);
assert.match(source,/ensureProductLinkedForStock\(/);
assert.match(source,/xmlPublishRequested/);
assert.match(source,/patch\.is_active=false;patch\.is_whatsapp_active=false/);
assert.match(source,/xml_product_bling_link_unconfirmed/);
assert.equal(fs.readFileSync("supabase/functions/admin-products-live-v1/xml-product-publication-policy.mjs","utf8").includes("idempotency_key"),true);
console.log("PASS: XML product activation waits for an exact, idempotent Bling link");
