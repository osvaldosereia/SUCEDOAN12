import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {
  MetaFlowsError,validateFlowJson,flowValidationErrors,assertFlowPublishable,
  listFlowsViaMeta,createFlowViaMeta,uploadFlowJsonViaMeta,configureFlowEndpointViaMeta,
  derivePublicKeyPem,getBusinessPublicKeyStatusViaMeta,registerBusinessPublicKeyViaMeta,publishFlowViaMeta,deleteFlowViaMeta
} from '../supabase/functions/_shared/whatsapp-meta-flows-v1.mjs';
globalThis.crypto??=webcrypto;

const makeFetch=(payload,status=200,inspect=null)=>async(url,init)=>{
  inspect?.(String(url),init);
  return new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}});
};
const dynamicFlow={version:'7.3',data_api_version:'3.0',routing_model:{START:['DONE']},screens:[
  {id:'START',title:'Início',terminal:false,layout:{type:'SingleColumnLayout',children:[{type:'TextHeading',text:'Teste'}]}},
  {id:'DONE',title:'Resumo',terminal:true,layout:{type:'SingleColumnLayout',children:[{type:'Footer',label:'Concluir',on_click_action:{name:'complete',payload:{resultado:'solicitacao_para_atendimento'}}}]}}
]};
assert.equal(validateFlowJson(dynamicFlow).dataApiVersion,'3.0');
assert.throws(()=>validateFlowJson('{'),e=>e.code==='meta_flow_json_invalid');
assert.throws(()=>validateFlowJson({...dynamicFlow,screens:[]}),e=>e.code==='meta_flow_json_invalid');
assert.deepEqual(flowValidationErrors({validation_errors:[]}),[]);
assert.equal(flowValidationErrors({}),null);
assert.equal(flowValidationErrors({validation_errors:null}),null);
assert.equal(flowValidationErrors({validation_errors:[{line:null,column:null}]})[0].line,null);
assert.throws(()=>assertFlowPublishable({status:'DRAFT',endpoint_uri:'https://x.test',validation_errors:[{error_message:'broken'}]},{endpointUri:'https://x.test',publicKeyConfigured:true,privateKeyConfigured:true,metaAppSecretConfigured:true,sessionSecretConfigured:true}),e=>e.code==='meta_flow_validation_failed');
assert.throws(()=>assertFlowPublishable({status:'DRAFT',endpoint_uri:null,validation_errors:[]},{endpointUri:'https://x.test',publicKeyConfigured:true,privateKeyConfigured:true,metaAppSecretConfigured:true,sessionSecretConfigured:true}),e=>e.code==='meta_flow_endpoint_not_configured');

let seen;
const listed=await listFlowsViaMeta({accessToken:'server-token',graphVersion:'v99.0',wabaId:'123456',fetchImpl:makeFetch({data:[{id:'98765',name:'Cesta',status:'DRAFT',categories:['OTHER'],validation_errors:[]}]},200,(url,init)=>{seen={url,init}})});
assert.equal(listed.items[0].id,'98765');
assert.match(seen.url,/123456\/flows/);
assert.equal(new URL(seen.url).searchParams.get('access_token'),null);
assert.equal(seen.init.headers.Authorization,'Bearer server-token');

const created=await createFlowViaMeta({accessToken:'server-token',graphVersion:'v99.0',wabaId:'123456',name:'Cesta dinâmica',fetchImpl:makeFetch({id:'98765',status:'DRAFT'})});
assert.equal(created.id,'98765');
await assert.rejects(createFlowViaMeta({accessToken:'x',graphVersion:'v99.0',wabaId:'123456',name:'x',fetchImpl:makeFetch({id:'98765'})}),e=>e.code==='meta_flow_name_invalid');

let formFile;
const uploaded=await uploadFlowJsonViaMeta({accessToken:'server-token',graphVersion:'v99.0',flowId:'98765',json:dynamicFlow,fetchImpl:makeFetch({success:true,validation_errors:[]},200,(url,init)=>{formFile=init.body.get('file')})});
assert.equal(uploaded.uploaded,true);
assert.equal(formFile.name,'flow.json');
assert.match(await formFile.text(),/data_api_version/);

let endpointBody;
await configureFlowEndpointViaMeta({accessToken:'server-token',graphVersion:'v99.0',flowId:'98765',endpointUri:'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/whatsapp-1018-basket-flow-v1',fetchImpl:makeFetch({success:true},200,(url,init)=>{endpointBody=JSON.parse(init.body)})});
assert.equal(endpointBody.endpoint_uri,'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/whatsapp-1018-basket-flow-v1');
await assert.rejects(configureFlowEndpointViaMeta({accessToken:'x',graphVersion:'v99.0',flowId:'98765',endpointUri:'http://bad.test',fetchImpl:makeFetch({success:true})}),e=>e.code==='meta_flow_endpoint_invalid');

const pair=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
const privatePem='-----BEGIN PRIVATE KEY-----\n'+btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8',pair.privateKey)))).match(/.{1,64}/g).join('\n')+'\n-----END PRIVATE KEY-----';
const publicPem=await derivePublicKeyPem(privatePem);
assert.match(publicPem,/BEGIN PUBLIC KEY/);
assert.doesNotMatch(publicPem,/BEGIN PRIVATE KEY/);
const matchingKey=await getBusinessPublicKeyStatusViaMeta({accessToken:'server-token',graphVersion:'v99.0',phoneNumberId:'55555',expectedPublicKeyPem:publicPem,fetchImpl:makeFetch({business_public_key:publicPem})});
assert.equal(matchingKey.matches_expected,true);
const mismatchingKey=await getBusinessPublicKeyStatusViaMeta({accessToken:'server-token',graphVersion:'v99.0',phoneNumberId:'55555',expectedPublicKeyPem:publicPem,fetchImpl:makeFetch({business_public_key:publicPem.replace('BEGIN PUBLIC KEY','BEGIN DIFFERENT KEY')})});
assert.equal(mismatchingKey.matches_expected,false);
let publicBody;
const registration=await registerBusinessPublicKeyViaMeta({accessToken:'server-token',graphVersion:'v99.0',phoneNumberId:'55555',privateKeyPem:privatePem,fetchImpl:makeFetch({success:true},200,(url,init)=>{publicBody=JSON.parse(init.body)})});
assert.equal(registration.success,true);
assert.match(publicBody.business_public_key,/BEGIN PUBLIC KEY/);
assert.doesNotMatch(JSON.stringify(publicBody),/BEGIN PRIVATE KEY/);

let publishCalls=0;
const publishFetch=async(url,init)=>{
  const target=String(url);publishCalls++;
  if(target.includes('whatsapp_business_encryption'))return new Response(JSON.stringify({business_public_key:publicPem}),{status:200});
  if(target.includes('/publish'))return new Response(JSON.stringify({success:true}),{status:200});
  return new Response(JSON.stringify({id:'98765',name:'Cesta',status:'DRAFT',endpoint_uri:'https://flow.test',validation_errors:[]}),{status:200});
};
const published=await publishFlowViaMeta({accessToken:'server-token',graphVersion:'v99.0',flowId:'98765',endpointUri:'https://flow.test',phoneNumberId:'55555',privateKeyConfigured:true,privateKeyPem:privatePem,metaAppSecretConfigured:true,sessionSecretConfigured:true,fetchImpl:publishFetch});
assert.equal(published.published,true);
assert.ok(publishCalls>=3);
await assert.rejects(publishFlowViaMeta({accessToken:'server-token',graphVersion:'v99.0',flowId:'98765',endpointUri:'https://flow.test',phoneNumberId:'55555',privateKeyConfigured:true,privateKeyPem:privatePem,metaAppSecretConfigured:true,sessionSecretConfigured:true,fetchImpl:async(url,init)=>String(url).includes('whatsapp_business_encryption')?new Response(JSON.stringify({business_public_key:'different-key'}),{status:200}):new Response(JSON.stringify({id:'98765',name:'Cesta',status:'DRAFT',endpoint_uri:'https://flow.test',validation_errors:[]}),{status:200})}),e=>e.code==='meta_flow_public_key_mismatch');
assert.equal(await deleteFlowViaMeta({accessToken:'server-token',graphVersion:'v99.0',flowId:'98765',fetchImpl:makeFetch({success:true})}).then(x=>x.deleted),true);
console.log('PASS Meta Flow Graph API, fixed endpoint, encrypted key registration, validation and publish gates');
