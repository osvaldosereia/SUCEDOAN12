/**
 * Dona Antônia — reversible WhatsApp 1018 pilot decision engine.
 *
 * PURE LAB MODULE. It never calls Meta, Supabase, PapoAI or sends messages.
 * Production defaults to LEGACY. The 0975 is permanently excluded.
 *
 * CRITICAL: A reversible Git commit is not sufficient to revert a live WhatsApp
 * provider/webhook switch. Runtime rollback requires preserving the original
 * inbound/outbound routing, Meta app subscriptions, bot ownership and all
 * credentials. This module only models and tests the routing decision.
 */
export const PILOT_CHANNEL='1018';
export const ORIGINAL_CHANNEL='0975';
export const ROLLOUT_MODES=Object.freeze(['off','shadow','pilot','expanded']);
const phone=/^55[1-9]\d{9,10}$/;
const fail=(s)=>{throw Error(s)};
const safeBool=x=>x===true;
export function createSafeRolloutConfig(overrides={}){
 const config={
   version:1,mode:'off',channel:PILOT_CHANNEL,
   userApprovedActivation:false,
   exclusiveSendOwnershipVerified:false,
   originalRoutingSnapshotVerified:false,
   restoreDrillPassed:false,
   appSubscriptionsVerified:false,
   competingAutomationDisabledForPilot:false,
   testPhones:[],
   enrollPercent:0,
   ...overrides
 };
 validateConfig(config);
 return config;
}
export function validateConfig(c){
 if(!c||c.version!==1||c.channel!==PILOT_CHANNEL||
    !ROLLOUT_MODES.includes(c.mode))fail('rollout_config_invalid');
 if(!Array.isArray(c.testPhones)||c.testPhones.some(p=>!phone.test(p))||
    new Set(c.testPhones).size!==c.testPhones.length)fail('rollout_allowlist_invalid');
 if(!Number.isInteger(c.enrollPercent)||c.enrollPercent<0||c.enrollPercent>100)
   fail('rollout_percentage_invalid');
 if(c.mode==='expanded'&&c.enrollPercent===0)
   fail('expanded_percentage_required');
 return c;
}
function ready(c){
 return safeBool(c.userApprovedActivation)&&
   safeBool(c.exclusiveSendOwnershipVerified)&&
   safeBool(c.originalRoutingSnapshotVerified)&&
   safeBool(c.restoreDrillPassed)&&
   safeBool(c.appSubscriptionsVerified)&&
   safeBool(c.competingAutomationDisabledForPilot);
}
function stableBucket(phoneE164){
 // Deterministic allowlisting based on digits, not a security / cryptographic hash.
 // Never use this as a customer authentication scheme.
 let hash=2166136261;
 for(const char of phoneE164)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
 return hash%100;
}
/**
 * Evaluate inbound routing only. Returning LAB does not itself send anything.
 * For outbound messages, a separate server-only single-writer send gate is
 * required before any actual Meta request. No calls to Meta occur here.
 *
 * @param {object} inbound {channel,recipientPhone,existingConversation,
 *                           explicitlyOptedIn,criticalFailure}
 */
export function decideInboundRoute(config,inbound){
 const c=validateConfig(config);
 const channel=String(inbound?.channel||'');
 const number=String(inbound?.recipientPhone||'');
 const legacy={route:'LEGACY',sendAllowed:false,channel,reason:'legacy_default'};
 if(channel!==PILOT_CHANNEL)return {...legacy,reason:'outside_1018'};
 if(c.mode==='off')return {...legacy,reason:'pilot_off'};
 if(inbound?.criticalFailure===true)return {...legacy,reason:'emergency_fallback'};
 if(c.mode==='shadow')return {route:'LEGACY',sendAllowed:false,
   channel,reason:'shadow_read_only',mirrorToLab:true};
 if(!ready(c))return {...legacy,reason:'pilot_preflight_missing'};
 if(!phone.test(number))return {...legacy,reason:'invalid_recipient'};
 if(inbound?.existingConversation===true&&inbound?.explicitlyOptedIn!==true)
   return {...legacy,reason:'existing_conversation_kept_legacy'};
 if(c.testPhones.includes(number))
   return {route:'LAB_CANDIDATE',sendAllowed:false,channel,
     reason:'allowlisted_test',mirrorToLab:false};
 if(c.mode==='expanded'&&stableBucket(number)<c.enrollPercent)
   return {route:'LAB_CANDIDATE',sendAllowed:false,channel,
     reason:'expanded_sample',mirrorToLab:false};
 return {...legacy,reason:'not_enrolled'};
}
/** Immediately models the kill switch. No provider configuration is changed. */
export function makeRollbackConfig(config,reason='manual'){
 validateConfig(config);
 if(typeof reason!=='string'||reason.length<3||reason.length>100)
   fail('rollback_reason_invalid');
 return {
   ...config,mode:'off',enrollPercent:0,
   rolledBackAt:new Date().toISOString(),
   rollbackReason:reason
 };
}
/** Minimal health signal to recommend rollback. Does NOT act in production. */
export function shouldRollback({replyDuplication=false,webhookConflict=false,
  deliveryFailures=0,tests=0,customerComplaint=false}={}){
 if(replyDuplication||webhookConflict||customerComplaint)return true;
 if(!Number.isInteger(deliveryFailures)||deliveryFailures<0||
    !Number.isInteger(tests)||tests<0)fail('health_metrics_invalid');
 return tests>=5&&deliveryFailures/tests>=0.05;
}
