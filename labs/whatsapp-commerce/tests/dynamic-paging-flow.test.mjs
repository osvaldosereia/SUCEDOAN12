import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const flow=JSON.parse(readFileSync(new URL('../flows/dynamic-paging.candidate.flow.json',import.meta.url)));
const screen=id=>flow.screens.find(s=>s.id===id);
const controls=id=>screen(id).layout.children[0].children;
const footer=id=>controls(id).at(-1);
test('Candidate has acyclic routing and a single terminal Flow screen',()=>{
  assert.equal(flow.version,'7.3');
  assert.equal(flow.data_api_version,'3.0');
  assert.deepEqual(flow.screens.map(x=>x.id),
    ['CHOOSE_MODE','PRODUCT_PILOT','UPSELL','CHECKOUT','SIMULATED_FINISH']);
  assert.ok(!flow.routing_model.PRODUCT_PILOT.includes('PRODUCT_PILOT'));
  assert.deepEqual(flow.screens.filter(x=>x.terminal).map(x=>x.id),['SIMULATED_FINISH']);
  assert.equal(footer('SIMULATED_FINISH')['on-click-action'].name,'complete');
});
test('Current product selection updates quote without committing to the next item',()=>{
  const productRadio=controls('PRODUCT_PILOT').find(x=>x.name==='product_choice');
  assert.equal(productRadio.type,'RadioButtonsGroup');
  assert.equal(productRadio['data-source'],'$'+'{data.options}');
  assert.equal(productRadio['on-select-action'].name,'data_exchange');
  assert.equal(productRadio['on-select-action'].payload.task,'preview_product');
  assert.equal(footer('PRODUCT_PILOT')['on-click-action'].payload.task,'commit_product');
  assert.equal(footer('PRODUCT_PILOT')['on-click-action'].payload.position_id,'$'+'{data.position_id}');
  assert.equal(screen('PRODUCT_PILOT').refresh_on_back,true);
  assert.equal(screen('PRODUCT_PILOT').layout.children[0]['init-values'].product_choice,'$'+'{data.selected_id}');
});
test('Checkout only collects data and never sends a real order',()=>{
  assert.equal(footer('CHECKOUT')['on-click-action'].payload.task,'checkout');
  assert.deepEqual(flow.routing_model.CHECKOUT,['SIMULATED_FINISH']);
  const src=JSON.stringify(flow);
  for(const forbidden of ['service_role','submit_order','hidden_adjustment','0975','1018','ssbesxgaijknwsjbsbcz'])
    assert.ok(!src.includes(forbidden),forbidden);
});
test('Short labels and compact options comply with basic Flow restrictions',()=>{
  for(const s of flow.screens){
    assert.match(s.id,/^[A-Z_]+$/);
    assert.ok(s.title.length<=80);
    assert.equal(controls(s.id).filter(x=>x.type==='Footer').length,1);
    assert.equal(controls(s.id).at(-1).type,'Footer');
    for(const c of controls(s.id)){
      if(c.type==='RadioButtonsGroup'||c.type==='CheckboxGroup'){
        assert.ok(c.label.length<=30);
        const options=Array.isArray(c['data-source'])?c['data-source']:[];
        assert.ok(options.length<=20);
        for(const opt of options)assert.ok(opt.title.length<=30);
      }
      if(c.type==='TextInput')assert.ok(c.label.length<=20);
    }
  }
});
