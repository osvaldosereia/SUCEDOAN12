import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createSafeRolloutConfig,decideInboundRoute,makeRollbackConfig,shouldRollback
} from '../src/rollout-1018.mjs';
const verified={
 userApprovedActivation:true,
 exclusiveSendOwnershipVerified:true,
 originalRoutingSnapshotVerified:true,
 restoreDrillPassed:true,
 appSubscriptionsVerified:true,
 competingAutomationDisabledForPilot:true
};
const phone='5565999999999';
const call=(c,channel='1018',more={})=>decideInboundRoute(c,{
 channel,recipientPhone:phone,existingConversation:false,...more
});
test('The 1018 pilot defaults to legacy, without any change to current service',()=>{
 const config=createSafeRolloutConfig();
 assert.equal(config.mode,'off');
 assert.deepEqual(call(config),{
  route:'LEGACY',sendAllowed:false,channel:'1018',reason:'pilot_off'
 });
});
test('The 0975 never joins the lab even if a future config is fully enabled',()=>{
 const config=createSafeRolloutConfig({
  ...verified,mode:'expanded',testPhones:[phone],enrollPercent:100
 });
 assert.equal(call(config,'0975').route,'LEGACY');
 assert.equal(call(config,'0975').reason,'outside_1018');
});
test('Shadow mode observes but cannot send and retains legacy ownership',()=>{
 const config=createSafeRolloutConfig({mode:'shadow',testPhones:[phone]});
 const route=call(config);
 assert.equal(route.route,'LEGACY');
 assert.equal(route.sendAllowed,false);
 assert.equal(route.mirrorToLab,true);
});
test('An allowlisted recipient only qualifies after every single preflight is verified',()=>{
 const unsafe=createSafeRolloutConfig({mode:'pilot',testPhones:[phone]});
 assert.equal(call(unsafe).reason,'pilot_preflight_missing');
 for(const key of Object.keys(verified)){
  const partial={...verified,[key]:false};
  assert.equal(call(createSafeRolloutConfig({
    ...partial,mode:'pilot',testPhones:[phone]
  })).route,'LEGACY',key);
 }
 const safe=createSafeRolloutConfig({...verified,mode:'pilot',testPhones:[phone]});
 const result=call(safe);
 assert.equal(result.route,'LAB_CANDIDATE');
 assert.equal(result.sendAllowed,false,'route selection does not grant outbound send');
 assert.equal(result.reason,'allowlisted_test');
});
test('Ordinary and preexisting clients stay in the old 1018 flow by default',()=>{
 const c=createSafeRolloutConfig({...verified,mode:'pilot',testPhones:[phone]});
 const other=call(c,'1018',{recipientPhone:'5565988888888'});
 assert.equal(other.route,'LEGACY');
 const existing=call(c,'1018',{existingConversation:true});
 assert.equal(existing.reason,'existing_conversation_kept_legacy');
 assert.equal(call(c,'1018',{existingConversation:true,explicitlyOptedIn:true}).route,'LAB_CANDIDATE');
});
test('A critical failure overrides even a fully enabled pilot',()=>{
 const c=createSafeRolloutConfig({...verified,mode:'expanded',testPhones:[phone],enrollPercent:100});
 const r=call(c,'1018',{criticalFailure:true});
 assert.equal(r.route,'LEGACY');
 assert.equal(r.reason,'emergency_fallback');
});
test('Manual rollback returns both allowlisted and random 1018 clients to legacy',()=>{
 const before=createSafeRolloutConfig({...verified,mode:'expanded',testPhones:[phone],enrollPercent:100});
 assert.equal(call(before).route,'LAB_CANDIDATE');
 const after=makeRollbackConfig(before,'operador_solicitou_reversao');
 assert.equal(after.mode,'off');
 assert.equal(after.enrollPercent,0);
 assert.equal(call(after).route,'LEGACY');
 assert.equal(call(after,'1018',{recipientPhone:'5565988888888'}).route,'LEGACY');
 assert.equal(call(after,'0975').route,'LEGACY');
});
test('Outages or duplicate responses recommend automatic rollback',()=>{
 assert.equal(shouldRollback({replyDuplication:true}),true);
 assert.equal(shouldRollback({webhookConflict:true}),true);
 assert.equal(shouldRollback({customerComplaint:true}),true);
 assert.equal(shouldRollback({tests:100,deliveryFailures:5}),true);
 assert.equal(shouldRollback({tests:100,deliveryFailures:4}),false);
});
test('Expanded traffic never sends automatically; it only selects eligible route',()=>{
 const c=createSafeRolloutConfig({...verified,mode:'expanded',enrollPercent:100});
 const result=call(c,'1018',{recipientPhone:'5565988888888'});
 assert.equal(result.route,'LAB_CANDIDATE');
 assert.equal(result.sendAllowed,false);
});
test('Unknown mode, channel or malformed allowlist fails closed',()=>{
 assert.throws(()=>createSafeRolloutConfig({channel:'0975'}),/rollout_config_invalid/);
 assert.throws(()=>createSafeRolloutConfig({mode:'on'}),/rollout_config_invalid/);
 assert.throws(()=>createSafeRolloutConfig({mode:'pilot',testPhones:['098765432']}),/rollout_allowlist_invalid/);
 assert.throws(()=>createSafeRolloutConfig({mode:'expanded',enrollPercent:0}),/expanded_percentage_required/);
});
