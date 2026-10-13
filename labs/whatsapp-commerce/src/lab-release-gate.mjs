/**
 * Mandatory environment isolation for a future TEST-only Meta connector.
 * No API calls. The live Dona Antônia senders must never be reconfigured by
 * the laboratory; publishing to production requires a separate release gate.
 */
export function assertIsolatedMetaEnvironment(config){
  if(!config||typeof config!=='object')throw Error('test_environment_missing');
  if(config.mode!=='LAB_ONLY')throw Error('production_mode_forbidden');
  if(config.allowProductionWrites!==false)throw Error('production_write_guard_missing');
  if(config.allowCustomerMessages!==false)throw Error('customer_message_guard_missing');
  const validId=(v)=>typeof v==='string'&&/^[1-9]\d{5,24}$/.test(v);
  if(!validId(config.testWabaId)||!validId(config.testPhoneNumberId))
    throw Error('test_meta_resources_missing');
  if(!Array.isArray(config.productionWabaIds)||!Array.isArray(config.productionPhoneNumberIds))
    throw Error('production_resource_blocklist_missing');
  if(config.productionWabaIds.includes(config.testWabaId)||
     config.productionPhoneNumberIds.includes(config.testPhoneNumberId))
    throw Error('production_meta_resource_forbidden');
  if(config.testAppReady!==true)throw Error('test_meta_app_unverified');
  if(!Array.isArray(config.recipientAllowlist)||config.recipientAllowlist.length===0)
    throw Error('test_recipient_allowlist_missing');
  if(config.recipientAllowlist.some(n=>!/^55\d{10,11}$/.test(n)))
    throw Error('test_recipient_invalid');
  return Object.freeze({
    mode:'LAB_ONLY',
    wabaId:config.testWabaId,phoneNumberId:config.testPhoneNumberId,
    recipientCount:config.recipientAllowlist.length,
    productionWrites:false,customerMessaging:false
  });
}
