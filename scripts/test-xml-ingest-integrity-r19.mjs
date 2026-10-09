import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertCatalogXmlSize, assertCatalogXmlIntegrity, assertExistingXmlDigest, MAX_CATALOG_XML_BYTES }
  from "../supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/xml-catalog-ingest-guard.mjs";
import { assertCatalogXmlSize as mirrorSize, assertCatalogXmlIntegrity as mirrorIntegrity }
  from "../supabase/functions/purchase-xml-v1/xml-catalog-ingest-guard.mjs";

const root = new URL("../",import.meta.url);
const read=path=>readFileSync(new URL(path,root),"utf8");
const dirs=["supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/","supabase/functions/purchase-xml-v1/"];
for(const name of ["index.ts","xml-catalog-extractor.mjs","xml-catalog-ingest-guard.mjs"]){
  assert.equal(read(dirs[0]+name),read(dirs[1]+name),name+" mirror drift");
}
const src=read(dirs[0]+"index.ts");
const order=[src.indexOf("async function processXml("),src.indexOf("async function manualCatalogOnlyImport("),
 src.indexOf("async function xmlCatalogReprocess(")];
assert.ok(order.every(x=>x>=0));
const normal=src.slice(order[0],src.indexOf("async function ",order[0]+20));
const manual=src.slice(order[1],src.indexOf("// Return source evidence",order[1]));
const replay=src.slice(order[2],src.indexOf("async function catalogQueue(",order[2]));
assert.ok(normal.indexOf("assertCatalogXmlIntegrity(xml,p.document_key)")<
  normal.indexOf('sb.storage.from("purchase-xml").upload('),
  "Bling XML preflight must precede storage write");
assert.ok(normal.indexOf("assertCatalogXmlIntegrity(xml,p.document_key)")<
  normal.indexOf("ensureContact(token,p)"),
  "Preflight must precede Bling contact operations");
assert.match(normal,/assertExistingXmlDigest\(ex\.data\.content_sha256,hash\)/);
assert.match(normal,/\.select\("id,processing_status,financial_eligible,finance_status,bling_nfe_id,content_sha256,metadata"\)/);
assert.ok(manual.indexOf("assertCatalogXmlSize(xml)")<manual.indexOf("const original=parseXml(xml)"));
assert.ok(manual.indexOf("assertCatalogXmlIntegrity(xml,original.document_key)")<
  manual.indexOf('sb.storage.from("purchase-xml").upload('));
assert.ok(replay.indexOf("assertCatalogXmlIntegrity(xml,d.document_key)")<
  replay.indexOf("persistXmlCatalogEvidence("));
assert.ok(replay.indexOf("assertCatalogXmlSize(xml)")<
  replay.indexOf("sha256(xml)"));
assert.doesNotMatch(manual,/\b(?:ensureContact|syncFinanceDocument|oauth\(|postStock|blingXml\()/);

const seed="3526101234567800012355001000000123100000123";
function checkDigit(s){
 let sum=0,w=2;
 for(let i=s.length-1;i>=0;i--){sum+=Number(s[i])*w;w=w===9?2:w+1;}
 const d=11-(sum%11);return String(d>=10?0:d);
}
const key=seed+checkDigit(seed);
assert.equal(key.length,44);
const xml=({protocol=true,protocolKey=key,status="100",description="Produto sintético",nfeKey=key}={})=>
  `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe${nfeKey}">
  <ide><nNF>123</nNF></ide><emit><CNPJ>12345678000123</CNPJ></emit>
  <dest><CNPJ>12345678000123</CNPJ></dest>
  <det nItem="1"><prod><cProd>F1</cProd><xProd>${description}</xProd>
  <cEAN>SEM GTIN</cEAN><cEANTrib>SEM GTIN</cEANTrib>
  <NCM>19059090</NCM><uCom>CX</uCom><qCom>2</qCom><vUnCom>30.00</vUnCom><vProd>60.00</vProd></prod></det>
  </infNFe></NFe>${protocol?`<protNFe><infProt><chNFe>${protocolKey}</chNFe><cStat>${status}</cStat></infProt></protNFe>`:""}</nfeProc>`;

const valid=xml();
assert.equal(assertCatalogXmlIntegrity(valid,key).items.length,1);
assert.equal(mirrorIntegrity(valid,key).items.length,1);
assert.equal(assertCatalogXmlIntegrity(xml({protocol:false}),key).items.length,1);
assert.throws(()=>assertCatalogXmlIntegrity(xml({protocolKey:"9".repeat(44)}),key),/xml_protocol_key_mismatch/);
assert.throws(()=>assertCatalogXmlIntegrity(xml({status:"110"}),key),/xml_protocol_not_authorized/);
assert.throws(()=>assertCatalogXmlIntegrity(xml({nfeKey:"8".repeat(44)}),key),/xml_document_key_mismatch/);
assert.throws(()=>assertCatalogXmlIntegrity(valid.replace("<nfeProc>","<!DOCTYPE x><nfeProc>"),key),/xml_dtd_forbidden/);
assert.throws(()=>assertCatalogXmlIntegrity("<broken>",key),/xml_malformed/);
assert.throws(()=>assertCatalogXmlIntegrity("",key),/xml_size_invalid/);
assert.equal(assertCatalogXmlSize("a".repeat(MAX_CATALOG_XML_BYTES)).length,MAX_CATALOG_XML_BYTES);
assert.throws(()=>assertCatalogXmlSize("a".repeat(MAX_CATALOG_XML_BYTES+1)),/xml_size_invalid/);
// 6 million accent characters are only 6m JS code units but 12m UTF-8 bytes.
assert.throws(()=>assertCatalogXmlSize("é".repeat(6_000_000)),/xml_size_invalid/);
assert.throws(()=>mirrorSize("é".repeat(6_000_000)),/xml_size_invalid/);
const digest="a".repeat(64);
assert.equal(assertExistingXmlDigest(digest,digest),true);
assert.equal(assertExistingXmlDigest(null,digest),true);
assert.throws(()=>assertExistingXmlDigest(digest,"b".repeat(64)),/existing_nfe_key_has_different_xml/);
assert.throws(()=>assertExistingXmlDigest("invalid",digest),/existing_nfe_key_has_different_xml/);

// Execute the actual catalog-only entrypoint with injected non-network DB/storage mocks.
// No Bling OAuth, real customer XML, service-role key, finance, product or stock operations.
const compile=manual
 .replace("async function manualCatalogOnlyImport(input:any)","async function manualCatalogOnlyImport(input)")
 .replace("const results:any[]=","const results=")
 .replaceAll("(e as Error)","e");
assert.doesNotMatch(compile,/(?:\w+):(?:any|string|number)\b/);
function harness(existing=null){
 const calls=[],documents=new Map(existing?[[key,existing]]:[]);
 const query=(table)=>({
   insert(row){
     calls.push([table,"insert",row]);
     return {select(){
       return {async single(){
         if(table==="purchase_xml_import_runs")return {data:{id:"run-1"},error:null};
         if(table==="purchase_xml_documents"){
           documents.set(row.document_key,{id:"document-1",content_sha256:row.content_sha256});
           return {data:{id:"document-1"},error:null};
         }
         throw new Error("unapproved table insert "+table);
       }};
     }};
   },
   update(row){
     calls.push([table,"update",row]);
     return {async eq(){return {data:null,error:null};}};
   },
   select(){
     return {eq(field,value){
       return {async maybeSingle(){return {data:documents.get(value)||null,error:null};}};
     }};
   }
 });
 const sb={from:(name)=>{if(!["purchase_xml_import_runs","purchase_xml_documents"].includes(name))
   throw new Error("unapproved table "+name);return query(name)},
 storage:{from(name){assert.equal(name,"purchase-xml");return {async upload(path,blob,opt){
   calls.push(["purchase-xml","upload",{path,bytes:blob.size,opt}]);
   assert.equal(opt.upsert,false);return {data:{path},error:null};
 }}}}};
 const parseXml=t=>({document_key:(/infNFe Id="NFe([0-9]{44})"/.exec(t)||[])[1]||"",
  cstat:0,issued_at:"2026-10-09",recipient_kind:"CNPJ",
  recipient_document:"12345678000123",supplier_document:"12345678000123",
  supplier_name:"Exemplo",total_amount:60,invoice_number:"123",series:"1"});
 const sha256=async t=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
   new TextEncoder().encode(t)))).map(x=>x.toString(16).padStart(2,"0")).join("");
 const xmlCatalogReprocess=async()=>{calls.push(["replay","called"]);return {results:[{ok:true}]}};
 const clean=(v,n)=>String(v??"").slice(0,n);
 const day=v=>String(v||"2026-10-09").slice(0,10);
 const factory=new Function("sb","parseXml","assertCatalogXmlSize","assertCatalogXmlIntegrity",
   "assertExistingXmlDigest","sha256","xmlCatalogReprocess","clean","day",
   compile+"\nreturn manualCatalogOnlyImport;");
 return {calls,documents,execute:factory(sb,parseXml,assertCatalogXmlSize,assertCatalogXmlIntegrity,
   assertExistingXmlDigest,sha256,xmlCatalogReprocess,clean,day)};
}
{
 const h=harness();const r=await h.execute([{name:"um.xml",xml:valid}]);
 assert.equal(r.ok,true);assert.equal(r.processed,1);assert.equal(r.failed,0);
 assert.equal(r.finance_updated,false);assert.equal(r.stock_updated,false);
 assert.equal(h.calls.filter(x=>x[1]==="upload").length,1);
 const doc=h.calls.find(x=>x[0]==="purchase_xml_documents"&&x[1]==="insert")?.[2];
 assert.equal(doc.financial_eligible,false);assert.equal(doc.metadata.catalog_only,true);
 assert.equal(doc.finance_reference.accounts.length,0);
 assert.equal(doc.receipt_status,"review");
 assert.ok(!h.calls.some(x=>/products|finance|stock|bling/i.test(x[0])));
}
{
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
   new TextEncoder().encode(valid)))).map(x=>x.toString(16).padStart(2,"0")).join("");
 const h=harness({id:"already",content_sha256:hash});
 const r=await h.execute([{name:"again.xml",xml:valid}]);
 assert.equal(r.duplicates,1);assert.equal(r.processed,0);
 assert.equal(h.calls.filter(x=>x[1]==="upload").length,0);
}
{
 const h=harness({id:"already",content_sha256:"b".repeat(64)});
 const r=await h.execute([{name:"collision.xml",xml:valid}]);
 assert.equal(r.failed,1);assert.equal(r.processed,0);
 assert.equal(h.calls.filter(x=>x[1]==="upload").length,0);
 assert.match(r.results[0].error,/existing_nfe_key_has_different_xml/);
}
{
 const h=harness();
 const r=await h.execute([{name:"bad.xml",xml:xml({protocolKey:"9".repeat(44)})},
   {name:"bad2.xml",xml:valid.replace("<nfeProc>","<!DOCTYPE x><nfeProc>")},
   {name:"big.xml",xml:"é".repeat(6_000_000)}]);
 assert.equal(r.failed,3);assert.equal(r.processed,0);
 assert.equal(h.calls.filter(x=>x[1]==="upload").length,0);
}
{
 const h=harness();
 assert.equal((await h.execute([])).status,400);
 assert.equal((await h.execute(Array(11).fill({name:"x",xml:valid}))).status,400);
 assert.equal(h.calls.length,0);
}
console.log("PASS XML R19: UTF-8 size, SEFAZ/document identity, DTD/malformed, duplicate hash, mock catalog-only idempotency, no finance/product/stock writes");
