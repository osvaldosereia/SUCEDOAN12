import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
const source=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const code=source.slice(source.indexOf('async function loadCustomerForCheckout('),source.indexOf('async function lookupCustomer('));
const db={from:table=>({select(){return this},eq(){return this},order(){return this},limit(){return this},maybeSingle:async()=>({data:table==='customers'?{id:'existing',name:'Antonia Guedes',cpf_cnpj:'12345678909'}:{reference:'Grade branca',street:'Rua',number:'10'}})}),rpc:async()=>({data:{registration_complete:true}})};
const sandbox={db,uid:v=>v};
vm.runInNewContext(stripTypeScriptTypes(code)+';this.loadCustomerForCheckout=loadCustomerForCheckout;',sandbox);
const customer=await sandbox.loadCustomerForCheckout('existing');
assert.equal(customer.address.raw_text,'Grade branca','checkout reference must reach the canonical order field used by Admin');
assert.equal(customer.address.reference,'Grade branca');
assert.equal(customer.cpf_cnpj,undefined,'private document must remain server-side');
console.log('checkout reference -> canonical delivery / Admin: OK');

