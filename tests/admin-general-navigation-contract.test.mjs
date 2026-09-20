import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const registry=read('admin/module-registry.js');
const navigation=read('admin/navigation-contract.js');

test('registry defines the six canonical admin groups',()=>{
  for(const value of ['operation','catalog','customer','marketing','management','system']){
    assert.match(registry,new RegExp(`id:'${value}'`));
  }
});

test('registry keeps core current routes compatible',()=>{
  for(const value of ['dashboard','storefront','baskets','products','categories','orders','customers']){
    assert.match(registry,new RegExp(`value:'${value}'`));
  }
  assert.match(registry,/value:'\.\/gondolas\.html'/);
  assert.match(registry,/value:'\.\.\/contagem\/'/);
});

test('planned system destinations remain explicitly planned',()=>{
  for(const id of ['integrations','health','settings','labs']){
    assert.match(registry,new RegExp(`id:'${id}'.*status:'planned'`));
  }
  assert.match(navigation,/if\(item\.status==='planned'\)return false/);
});

test('sensitive modules retain gates and external-effect metadata',()=>{
  assert.match(registry,/id:'marketing'.*externalEffects:true.*gate:'marketing'/);
  assert.match(registry,/id:'logistics'.*gate:'logistics'.*externalEffects:true/);
  assert.match(registry,/id:'automations'.*gate:'automationBuilder'.*externalEffects:true/);
  assert.match(navigation,/commercialTruth:bool\(adminConfig\.commercialTruthUiEnabled\)/);
  assert.match(navigation,/financial:bool\(adminConfig\.financialAdminUiEnabled\)/);
});

test('canaries are read-only navigation visibility inputs',()=>{
  assert.match(navigation,/relationshipCanaryEnabled/);
  assert.match(navigation,/customerOsCanaryEnabled/);
  assert.doesNotMatch(navigation,/fetch\(|\.insert\(|\.update\(|\.delete\(/);
});

test('navigation contract preserves hash and page href semantics',()=>{
  assert.match(navigation,/item\.route\.type==='hash'/);
  assert.match(navigation,/item\.route\.type==='page'\|\|item\.route\.type==='external'/);
});
