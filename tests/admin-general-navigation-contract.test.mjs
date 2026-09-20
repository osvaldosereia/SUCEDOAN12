import test from 'node:test';
import assert from 'node:assert/strict';
import {ADMIN_GROUPS,ADMIN_MODULES,validateAdminRegistry} from '../admin/module-registry.js';
import {adminGateState,adminHref,adminNavigationModel,isAdminModuleVisible} from '../admin/navigation-contract.js';

test('registry has unique valid modules and known groups',()=>{
  const result=validateAdminRegistry();
  assert.equal(result.ok,true,result.errors.join('\n'));
  assert.equal(new Set(ADMIN_MODULES.map(x=>x.id)).size,ADMIN_MODULES.length);
  assert.ok(ADMIN_GROUPS.length>=6);
});

test('planned modules never leak into current navigation',()=>{
  const model=adminNavigationModel({runtimeConfig:{marketingUiEnabled:true},adminConfig:{}});
  const ids=model.flatMap(group=>group.modules.map(item=>item.id));
  for(const id of ['integrations','health','settings','labs'])assert.equal(ids.includes(id),false);
});

test('gated modules stay hidden by default',()=>{
  const gates=adminGateState();
  for(const id of ['relationship','commercial','logistics','financial','automations']){
    const item=ADMIN_MODULES.find(x=>x.id===id);
    assert.equal(isAdminModuleVisible(item,gates),false,id);
  }
});

test('relationship canary only opens relationship navigation',()=>{
  const runtimeConfig={relationshipCanaryEnabled:true,relationshipCanaryParam:'relationship_os',relationshipCanaryValue:'canary'};
  const gates=adminGateState({runtimeConfig,search:'?relationship_os=canary'});
  assert.equal(gates.relationship,true);
  assert.equal(gates.customerOs,false);
});

test('navigation href preserves existing hash and page routes',()=>{
  const products=ADMIN_MODULES.find(x=>x.id==='products');
  const gondolas=ADMIN_MODULES.find(x=>x.id==='shelves');
  assert.equal(adminHref(products),'#products');
  assert.equal(adminHref(gondolas),'./gondolas.html');
});

test('external-effect metadata is explicit on sensitive modules',()=>{
  for(const id of ['marketing','logistics','automations']){
    const item=ADMIN_MODULES.find(x=>x.id===id);
    assert.equal(item.externalEffects,true,id);
  }
});
