import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractCatalogFromNfe } from "../supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/xml-catalog-extractor.mjs";

// Run with: deno run --allow-read scripts/test-xml-catalog-protocol-integrity-v6.mjs
const canonical=readFileSync(new URL("../supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/xml-catalog-extractor.mjs",import.meta.url),"utf8");
const standalone=readFileSync(new URL("../supabase/functions/purchase-xml-v1/xml-catalog-extractor.mjs",import.meta.url),"utf8");
assert.equal(canonical,standalone,"Both XML catalog parsers must remain identical");

const seed="3526101234567800012355001000000123100000123";
assert.equal(seed.length,43);
let sum=0,weight=2;
for(let i=seed.length-1;i>=0;i--){sum+=Number(seed[i])*weight;weight=weight===9?2:weight+1;}
const digit=11-sum%11;
const key=seed+String(digit>=10?0:digit);
assert.equal(key.length,44);

function invoice({nfeKey=key,protocolKey=key,status="100",protocol=true}={}){
  const protocolXml=protocol?`<protNFe><infProt><chNFe>${protocolKey}</chNFe><cStat>${status}</cStat></infProt></protNFe>`:"";
  return `<?xml version="1.0" encoding="utf-8"?>
<nfeProc><NFe><infNFe Id="NFe${nfeKey}">
<ide><nNF>123</nNF></ide><emit><CNPJ>12345678000123</CNPJ></emit>
<dest><CNPJ>12345678000123</CNPJ></dest>
<det nItem="1"><prod><cProd>A1</cProd><xProd>Produto de teste</xProd>
<cEAN>SEM GTIN</cEAN><cEANTrib>SEM GTIN</cEANTrib>
<NCM>19059090</NCM><uCom>CX</uCom><qCom>2</qCom><vUnCom>30.00</vUnCom><vProd>60.00</vProd>
</prod><imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST></ICMS00></ICMS></imposto></det>
</infNFe></NFe>${protocolXml}</nfeProc>`;
}
const ok=extractCatalogFromNfe(invoice(),key);
assert.equal(ok.key,key);
assert.equal(ok.items.length,1);
assert.equal(ok.items[0].purchase_unit,"CX");
assert.equal(ok.items[0].purchase_quantity,2);
assert.equal(ok.items[0].commercial_gtin,"SEM GTIN");

assert.throws(()=>extractCatalogFromNfe(invoice({protocolKey:"9".repeat(44)}),key),/xml_protocol_key_mismatch/);
assert.throws(()=>extractCatalogFromNfe(invoice({protocolKey:""}),key),/xml_protocol_key_mismatch/);
for(const status of ["110","101","", "999"]){
  assert.throws(()=>extractCatalogFromNfe(invoice({status}),key),/xml_protocol_not_authorized/);
}
assert.equal(extractCatalogFromNfe(invoice({status:"150"}),key).items.length,1);
assert.throws(()=>extractCatalogFromNfe(invoice({nfeKey:"8".repeat(44)}),key),/xml_document_key_mismatch/);
// Bare NFe without authorization protocol remains catalogable as source evidence;
// absence of a protocol is not proof of SEFAZ authorization.
assert.equal(extractCatalogFromNfe(invoice({protocol:false}),key).items.length,1);
assert.throws(()=>extractCatalogFromNfe(invoice().replace("<nfeProc>","<!DOCTYPE x [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><nfeProc>"),key),/xml_dtd_forbidden/);
assert.throws(()=>extractCatalogFromNfe("<nfeProc><NFe>",key),/xml_malformed/);
console.log("PASS XML V6: protocol key/status coherence, source-only evidence, malformed/DTD and mirrored parsers");
