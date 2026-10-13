import test from 'node:test';
import assert from 'node:assert/strict';
import {assertIsolatedMetaEnvironment} from '../src/lab-release-gate.mjs';
const base={
 mode:'LAB_ONLY',allowProductionWrites:false,allowCustomerMessages:false,
 testWabaId:'1234567890',testPhoneNumberId:'9999999999',
 productionWabaIds:['8888888888'],productionPhoneNumberIds:['7777777777'],
 recipientAllowlist:['5565999999999'],testAppReady:true
};
test('Distinct test WABA and test number are accepted only with customer sends disabled',()=>{
 const out=assertIsolatedMetaEnvironment(base);
 assert.equal(out.mode,'LAB_ONLY');assert.equal(out.productionWrites,false);
 assert.equal(out.customerMessaging,false);
});
test('Production Meta WABA/phone cannot be used by the laboratory',()=>{
 assert.throws(()=>assertIsolatedMetaEnvironment({...base,testPhoneNumberId:'7777777777'}),/production_meta_resource_forbidden/);
 assert.throws(()=>assertIsolatedMetaEnvironment({...base,testWabaId:'8888888888'}),/production_meta_resource_forbidden/);
});
test('Lab cannot turn on production writes or customer messaging',()=>{
 assert.throws(()=>assertIsolatedMetaEnvironment({...base,allowProductionWrites:true}),/production_write_guard_missing/);
 assert.throws(()=>assertIsolatedMetaEnvironment({...base,allowCustomerMessages:true}),/customer_message_guard_missing/);
 assert.throws(()=>assertIsolatedMetaEnvironment({...base,mode:'PRODUCTION'}),/production_mode_forbidden/);
});
test('No real test app, or no recipient allowlist, means no Meta access',()=>{
 assert.throws(()=>assertIsolatedMetaEnvironment({...base,testAppReady:false}),/test_meta_app_unverified/);
 assert.throws(()=>assertIsolatedMetaEnvironment({...base,recipientAllowlist:[]}),/test_recipient_allowlist_missing/);
});
