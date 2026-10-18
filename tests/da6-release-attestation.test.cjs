const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const url=pathToFileURL(path.resolve(__dirname,'../scripts/da6-release-attestation.mjs')).href;
const fingerprint='b'.repeat(64);
const gate='physical_thermal_203dpi_print';
const good=`<!-- DA6_ATTESTATION_V1
gate: ${gate}
source_fingerprint: ${fingerprint}
result: PASS
-->
# Registro do ensaio físico
Este texto não é comprovação de um ensaio real; apenas fixture de parser.`;
test('R8 header estrito: hash, gate e aprovação explícitos devem corresponder',async()=>{
 const {verifyDa6EvidenceHeader:verify}=await import(url);
 assert.deepEqual(verify(good,gate,fingerprint),{ok:true});
 assert.equal(verify(good.replace(/\n/g,'\r\n'),gate,fingerprint).ok,true);
});
test('R8 impede reutilizar evidência de outro gate',async()=>{
 const {verifyDa6EvidenceHeader:verify}=await import(url);
 assert.equal(verify(good,'real_cell_phone_photos_omr',fingerprint).reason,'attestation_gate_mismatch');
});
test('R8 impede reutilizar evidência de versão anterior',async()=>{
 const {verifyDa6EvidenceHeader:verify}=await import(url);
 assert.equal(verify(good,gate,'a'.repeat(64)).reason,'attestation_source_fingerprint_mismatch');
});
test('R8 texto informal PASS e hash em corpo não substituem cabeçalho',async()=>{
 const {verifyDa6EvidenceHeader:verify}=await import(url);
 const note=`# PASS
gate: ${gate}
source_fingerprint: ${fingerprint}
`;
 assert.equal(verify(note,gate,fingerprint).reason,'attestation_header_missing_or_invalid');
 assert.equal(verify('INFORMAL\n'+good,gate,fingerprint).reason,'attestation_header_missing_or_invalid');
});
test('R8 rejeita FAIL, campos duplicados, campo vazio e versão desconhecida',async()=>{
 const {verifyDa6EvidenceHeader:verify}=await import(url);
 for(const bad of [
  good.replace('result: PASS','result: FAIL'),
  good.replace('result: PASS','result: PASS\ngate: '+gate),
  good.replace('gate: '+gate,'gate: '),
  good.replace('DA6_ATTESTATION_V1','DA6_ATTESTATION_V0')
 ]) assert.equal(verify(bad,gate,fingerprint).reason,'attestation_header_missing_or_invalid');
});
test('R8 rejeita fingerprint malformado mesmo com documento presente',async()=>{
 const {verifyDa6EvidenceHeader:verify}=await import(url);
 assert.equal(verify(good,gate,'123').reason,'attestation_invalid_input');
});
