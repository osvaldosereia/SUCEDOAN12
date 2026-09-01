import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('loja-integrada/personalizar/v4-make-contract-v1.js','utf8');
const calls=[];
const nativeFetch=async(input,init)=>{calls.push({input,init});return{ok:true,status:200,text:async()=>''};};
const context={
  window:{fetch:nativeFetch},
  document:{documentElement:{dataset:{}}},
  console,
  JSON,
  String,
  Array,
  Object,
  RegExp
};
vm.createContext(context);
vm.runInContext(source,context,{filename:'v4-make-contract-v1.js'});
assert.notEqual(context.window.fetch,nativeFetch,'contrato deve envolver fetch');

async function send(payload){
  calls.length=0;
  await context.window.fetch('https://hook.make.test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload:JSON.stringify(payload)})});
  assert.equal(calls.length,1);
  const outer=JSON.parse(calls[0].init.body);
  return JSON.parse(outer.payload);
}

const nameOnly=await send({action:'personalize_mug_model',mode:'loja_integrada_v4_staging',image_base64:'data:image/webp;base64,ARTEBASE',images_json:'[]'});
assert.equal(nameOnly.image_base64,'data:image/webp;base64,ARTEBASE','sem upload, Make deve receber arte-base no campo legado');
assert.equal(nameOnly.model_art_base64,'data:image/webp;base64,ARTEBASE');
assert.equal(nameOnly.reference_image_base64,'data:image/webp;base64,ARTEBASE');

const withPhoto=await send({action:'personalize_mug_model',mode:'loja_integrada_v4_staging',image_base64:'data:image/webp;base64,ARTEBASE',images_json:JSON.stringify([{field_id:'foto',image_base64:'data:image/png;base64,FOTO'}])});
assert.equal(withPhoto.image_base64,'data:image/png;base64,FOTO','com foto, contrato legado deve continuar recebendo foto do cliente');
assert.equal(withPhoto.model_art_base64,'data:image/webp;base64,ARTEBASE','arte-base não pode se perder quando houver foto');
assert.equal(withPhoto.official_model_art_base64,'data:image/webp;base64,ARTEBASE');

calls.length=0;
const untouchedBody=JSON.stringify({payload:JSON.stringify({action:'outra_acao',image_base64:'X'})});
await context.window.fetch('https://hook.make.test',{method:'POST',body:untouchedBody});
assert.equal(calls[0].init.body,untouchedBody,'outras ações não podem ser reescritas');

console.log('OK V4 Make contract: nome usa arte-base; foto usa upload sem perder arte oficial; outras ações ficam intactas.');
