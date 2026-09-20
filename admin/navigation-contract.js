import {ADMIN_GROUPS,ADMIN_MODULES,getAdminModule} from './module-registry.js';

const bool=value=>value===true;

export function adminGateState({adminConfig={},runtimeConfig={},search=''}={}){
  const params=new URLSearchParams(String(search||'').replace(/^\?/,''));
  const customerCanary=bool(runtimeConfig.customerOsCanaryEnabled)&&params.get(String(runtimeConfig.customerOsCanaryParam||'customer_os'))===String(runtimeConfig.customerOsCanaryValue||'canary');
  const relationshipCanary=bool(runtimeConfig.relationshipCanaryEnabled)&&params.get(String(runtimeConfig.relationshipCanaryParam||'relationship_os'))===String(runtimeConfig.relationshipCanaryValue||'canary');
  return Object.freeze({
    customerOs:bool(runtimeConfig.customerOsSecureUiEnabled)||customerCanary,
    relationship:bool(runtimeConfig.relationshipUiEnabled)||relationshipCanary,
    marketing:bool(runtimeConfig.marketingUiEnabled),
    commercialTruth:bool(adminConfig.commercialTruthUiEnabled),
    logistics:bool(adminConfig.logisticsUiEnabled),
    financial:bool(adminConfig.financialAdminUiEnabled),
    automationBuilder:bool(adminConfig.automationBuilderUiEnabled)
  });
}

export function isAdminModuleVisible(item,gates={}){
  if(!item)return false;
  if(item.status==='planned')return false;
  if(!item.gate)return true;
  return gates[item.gate]===true;
}

export function adminNavigationModel(options={}){
  const gates=adminGateState(options);
  return ADMIN_GROUPS.map(group=>Object.freeze({
    ...group,
    modules:Object.freeze(ADMIN_MODULES
      .filter(item=>item.group===group.id&&isAdminModuleVisible(item,gates))
      .sort((a,b)=>a.order-b.order))
  })).filter(group=>group.modules.length>0);
}

export function adminHref(item){
  if(!item?.route)return null;
  if(item.route.type==='hash')return `#${item.route.value}`;
  if(item.route.type==='page'||item.route.type==='external')return item.route.value;
  return null;
}

export function resolveAdminModule(id){
  const item=getAdminModule(id);
  return item?Object.freeze({...item,href:adminHref(item)}):null;
}
