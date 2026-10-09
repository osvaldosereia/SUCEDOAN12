// R02-R10: ORIGINAL R10 pure checker receives order ID and amount from
// checkout R02 -> missing-items R06 (R$160 -> R$140) in the SAME test run.
// The NF-e XML and issuer are SYNTHETIC, never signed or submitted to SEFAZ.
import assert from "node:assert/strict";
import fs from "node:fs";
import { extractNfeAuthorizationProofR10,verifySefazNfeAuthorizationR10,
 validNfeAccessKey } from
 "../r10-source/supabase/functions/_shared/order-fiscal-r10-sefaz-proof-v1.mjs";
const path=process.argv[2];
if(!path)throw Error("genuine_r02_r09_receipts_required");
const rows=fs.readFileSync(path,"utf8").trim().split(/\r?\n/).map(JSON.parse);
const basket=rows.find(x=>x.kind==="basket"),mold=rows.find(x=>x.kind==="mold");
assert.ok(basket&&mold);
assert.equal(basket.order.total,140);
assert.equal(basket.r7_intent.status,"verified");
assert.equal(basket.observation.status,"observed_no_invoice");
assert.equal(mold.r7_intent.status,"uncertain");
assert.equal(mold.observation,null);
const oid=basket.order.id,cnpj="11222333000181";
const seed="51"+"2610"+cnpj+"55"+"001"+"000000001"+"1"+"00000001";
let weight=2,sum=0;
for(let i=seed.length-1;i>=0;i--){sum+=Number(seed[i])*weight;weight=weight===9?2:weight+1;}
const key=seed+((11-(sum%11))%11);
assert.equal(validNfeAccessKey(key),true);
const when=new Date().toISOString(),invoiceId=901;
const xml=(code=100,amt=basket.order.total,invoiceKey=key,documentKey=key)=>
 '<nfeProc><NFe><infNFe Id="NFe'+documentKey+'"><ide><tpAmb>1</tpAmb></ide>'+
 '<emit><CNPJ>'+cnpj+'</CNPJ></emit>'+
 '<total><ICMSTot><vNF>'+Number(amt).toFixed(2)+'</vNF></ICMSTot></total>'+
 '</infNFe></NFe><protNFe><infProt><chNFe>'+invoiceKey+'</chNFe>'+
 '<cStat>'+code+'</cStat><nProt>123456789012345</nProt>'+
 '<dhRecbto>'+when+'</dhRecbto></infProt></protNFe></nfeProc>';
function verify(xmlText,overrides={}){
 const extracted=extractNfeAuthorizationProofR10(xmlText);
 assert.equal(extracted.ok,true,JSON.stringify(extracted));
 return verifySefazNfeAuthorizationR10({
  order_id:oid,bling_invoice_id:invoiceId,
  bling_detail:{id:invoiceId,numeroLoja:"VITRINE-"+oid,
    chaveAcesso:key,situation:{authorized:true,label:"Autorizada"}},
  proof:extracted.proof,
  expected_environment:"1",expected_emitter_cnpj:cnpj,
  expected_total:basket.order.total,bling_fetched_at:when,
  as_of:when,...overrides
 });
}
const yes=verify(xml());
assert.equal(yes.authorized,true,JSON.stringify(yes.blockers));
assert.equal(yes.cstat,100);
assert.equal(yes.external_write,false);
for(const code of [101,110,301,302,539]){
 const denied=verify(xml(code));
 assert.equal(denied.authorized,false,"synthetic rejected SEFAZ cStat "+code);
 assert.ok(denied.blockers.includes("sefaz_authorization_code_invalid"));
}
const wrongPrice=verify(xml(100,basket.order.total+10));
assert.equal(wrongPrice.authorized,false);
assert.ok(wrongPrice.blockers.includes("invoice_total_mismatch"));
const changedKey=key.slice(0,-1)+String((Number(key.at(-1))+1)%10);
const wrongKey=verify(xml(100,basket.order.total,changedKey));
assert.ok(wrongKey.blockers.includes("access_key_mismatch_or_invalid"));
const wrongOrder=verify(xml(),{
 bling_detail:{id:901,numeroLoja:"VITRINE-"+mold.order.id,
  chaveAcesso:key,situation:{authorized:true,label:"Autorizada"}}
});
assert.ok(wrongOrder.blockers.includes("invoice_order_identity_mismatch"));
const notAuthorized=verify(xml(),{
 bling_detail:{id:901,numeroLoja:"VITRINE-"+oid,
  chaveAcesso:key,situation:{authorized:false,label:"Gerada"}}
});
assert.ok(notAuthorized.blockers.includes("bling_invoice_not_authorized"));
assert.equal(extractNfeAuthorizationProofR10("Autorizada").ok,false);
assert.equal(extractNfeAuthorizationProofR10("<NFe></NFe>").ok,false);
console.log("PASS original R10 SEFAZ verifier with REAL separated checkout amount, SYNTHETIC XML and CNPJ");
console.log("PASS rejection, invoice identity, key, total, and generated-but-unauthorized guard");
console.log("PASS no network or real NF-e: R08 outbound tax gate remains OFF");
