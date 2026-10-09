import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {extractNfeAuthorizationProofR10,verifySefazNfeAuthorizationR10,
  validNfeAccessKey} from "../supabase/functions/_shared/order-fiscal-r10-sefaz-proof-v1.mjs";
const oid="00000000-0000-4000-8000-000000000010",cnpj="11222333000181";
const seed="51"+"2610"+cnpj+"55"+"001"+"000000001"+"1"+"00000001";
let weight=2,sum=0;for(let i=seed.length-1;i>=0;i--){sum+=Number(seed[i])*weight;weight=weight===9?2:weight+1}
const key=seed+((11-(sum%11))%11),time="2026-10-08T22:00:00-04:00";
function xml({cstat=100,environment="1",issuer=cnpj,amount="198.00",
  protocol="123456789012345",documentKey=key,proofKey=key}={}){
 return '<nfeProc><NFe><infNFe Id="NFe'+documentKey+'"><ide><tpAmb>'+environment+'</tpAmb></ide><emit><CNPJ>'+issuer+'</CNPJ></emit><total><ICMSTot><vNF>'+amount+'</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><chNFe>'+proofKey+'</chNFe><cStat>'+cstat+'</cStat><nProt>'+protocol+'</nProt><dhRecbto>'+time+'</dhRecbto></infProt></protNFe></nfeProc>';
}
function attested(overrides={},xmlOverrides={}){
 const e=extractNfeAuthorizationProofR10(xml(xmlOverrides));
 assert.equal(e.ok,true,JSON.stringify(e));
 return {order_id:oid,bling_invoice_id:901,
  bling_detail:{id:901,numeroLoja:"VITRINE-"+oid,chaveAcesso:key,
    situation:{authorized:true,label:"Autorizada"}},
  proof:e.proof,expected_environment:"1",expected_emitter_cnpj:cnpj,
  expected_total:198,bling_fetched_at:time,as_of:time,...overrides};
}
test("R10 requires valid 44-digit modulo-11 NF-e access key",()=>{
 assert.equal(seed.length,43);
 assert.equal(key.length,44);
 assert.equal(validNfeAccessKey(key),true);
 assert.equal(validNfeAccessKey(key.slice(0,-1)+String((Number(key.at(-1))+1)%10)),false);
 assert.equal(validNfeAccessKey("1".repeat(44)),false);
 assert.equal(validNfeAccessKey("5".repeat(42)),false);
});
test("R10 verifies coherent authorized XML cStat 100 and 150",()=>{
 for(const status of [100,150]){
  const verified=verifySefazNfeAuthorizationR10(attested({}, {cstat:status}));
  assert.equal(verified.authorized,true,JSON.stringify(verified.blockers));
  assert.equal(verified.cstat,status);
  assert.equal(verified.protocol,"123456789012345");
  assert.equal(verified.external_write,false);
 }
});
test("R10 rejects cancelled, rejected or denied NF-e",()=>{
 for(const cstat of [0,101,110,301,302,539]){
  const verified=verifySefazNfeAuthorizationR10(attested({}, {cstat}));
  assert.equal(verified.authorized,false,"cStat "+cstat);
  assert.ok(verified.blockers.includes("sefaz_authorization_code_invalid"));
 }
 assert.equal(verifySefazNfeAuthorizationR10(attested({
  bling_detail:{id:901,numeroLoja:"VITRINE-"+oid,chaveAcesso:key,
    situation:{authorized:false,label:"Gerada"}}
 })).authorized,false);
});
test("R10 blocks access key, protocol, CNPJ, total and environment inconsistencies",()=>{
 const changes=[
  [attested({}, {documentKey:key.slice(0,-1)+"0"}),"access_key_mismatch_or_invalid"],
  [attested({}, {proofKey:key.slice(0,-1)+"0"}),"access_key_mismatch_or_invalid"],
  [attested({}, {protocol:"123"}),"sefaz_protocol_missing"],
  [attested({}, {issuer:"00000000000000"}),"issuer_cnpj_mismatch"],
  [attested({}, {amount:"199.00"}),"invoice_total_mismatch"],
  [attested({}, {environment:"2"}),"sefaz_environment_mismatch"],
  [attested({bling_invoice_id:902}),"invoice_order_identity_mismatch"],
  [attested({bling_detail:{id:901,numeroLoja:"OTHER",chaveAcesso:key,
    situation:{authorized:true}}}),"invoice_order_identity_mismatch"],
  [attested({expected_emitter_cnpj:"00000000000000"}),"issuer_cnpj_mismatch"],
  [attested({bling_fetched_at:"2026-10-08T21:00:00-04:00"}),"bling_authorization_evidence_stale"]
 ];
 for(const [value,code] of changes){
  const proof=verifySefazNfeAuthorizationR10(value);
  assert.equal(proof.authorized,false,code);
  assert.ok(proof.blockers.includes(code),JSON.stringify({code,blockers:proof.blockers}));
 }
});
test("R10 rejects missing nfeProc/protocol and misleading labels",()=>{
 for(const invalid of ["","Autorizada","<NFe></NFe>",
   '<nfeProc><NFe><infNFe Id="NFe'+key+'"></infNFe></NFe></nfeProc>']){
  assert.equal(extractNfeAuthorizationProofR10(invalid).ok,false);
 }
});
test("R10 guards every authorization route and gates generation",()=>{
 const hub=fs.readFileSync("supabase/functions/admin-service-intelligence-v1/index.ts","utf8");
 assert.match(hub,/ORDER_R10_SEFAZ_PROOF_ENABLED/);
 assert.match(hub,/R10_FISCAL_ISSUER_CNPJ/);
 assert.match(hub,/blingHubNfeXml\(sb,token,key\)/);
 assert.match(hub,/extractNfeAuthorizationProofR10\(xml\)/);
 assert.match(hub,/verifySefazNfeAuthorizationR10/);
 assert.match(hub,/ops2_r10_finalize_authorized_v1/);
 assert.equal((hub.match(/await blingHubR10MarkOrLegacy\(sb,\{/g)||[]).length,4);
 assert.equal((hub.match(/await sb\.rpc\("mark_order_dispatch_fiscal_authorized_v1"/g)||[]).length,0);
 assert.match(hub,/ops2_r10_claim_fiscal_generation_v1/);
 assert.match(hub,/r10_generation_not_authorized/);
});
test("R10 SQL uses existing outbox, unique evidence and new dispatch trigger",()=>{
 const sql=fs.readFileSync("supabase/sql/orders-r10-sefaz-authorization-gate-v1.sql","utf8");
 assert.match(sql,/order_id uuid PRIMARY KEY REFERENCES public\.orders/);
 assert.match(sql,/bling_invoice_id bigint NOT NULL UNIQUE/);
 assert.match(sql,/access_key text NOT NULL UNIQUE/);
 assert.match(sql,/status='authorized'/);
 assert.match(sql,/NEW.status IN \('out_for_delivery','delivered'\)/);
 assert.match(sql,/ops2_r10_guard_dispatch_v1/);
 assert.match(sql,/trg_ops2_r10_require_sefaz_before_dispatch/);
 assert.match(sql,/r8_approved_tax_attestation_not_integrated/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.ops2_r10_finalize_authorized_v1/);
 assert.doesNotMatch(sql,/POST \/nfe|blingHubPostOnce/);
});
