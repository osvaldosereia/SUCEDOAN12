import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const uiPath='admin-v3/marketing-quick-edit-revision-comparison-readonly-v1.js';
assert.ok(fs.existsSync(uiPath),'readonly revision comparison UI must exist');

const source=fs.readFileSync(uiPath,'utf8');
for(const forbidden of ['fetch(','XMLHttpRequest','axios','Authorization','Bearer ','access_token','client_secret','service_role','localStorage','sessionStorage','indexedDB','writeFile(','approve','schedule','publish(','execute(','requeue(']) {
  assert.ok(!source.includes(forbidden),`comparison UI must remain dormant/read-only: ${forbidden}`);
}

const publicLoader=fs.readFileSync('admin/app-lite.js','utf8');
assert.ok(!publicLoader.includes('marketing-quick-edit-revision-comparison-readonly-v1.js'),'comparison UI must not be wired into public Admin loader');

const comparison={
  schema_version:'marketing-quick-edit-revision-comparison-v1',
  asset_id:'asset-1',
  from_revision:2,
  to_revision:3,
  status:'contiguous',
  paths:[
    {path:'/layers/0/text<script>',before_sha256:'a'.repeat(64),after_sha256:'b'.repeat(64),status:'changed'},
    {path:'/layers/1/visible',before_sha256:'c'.repeat(64),after_sha256:'d'.repeat(64),status:'added'},
  ],
  preview_only:true,
  mutations_allowed:false,
  network_allowed:false,
  external_side_effect:false,
};
const snapshot={latest:{asset_id:'asset-1',revision:3},history:[{asset_id:'asset-1',revision:2},{asset_id:'asset-1',revision:3}],comparison};

const context={window:{DAMarketingQuickEditReviewHandoffV1:{getSnapshot:()=>snapshot}},document:{}};
vm.createContext(context);
vm.runInContext(source,context,{filename:uiPath});
const ui=context.window.DAMarketingQuickEditRevisionComparisonReadonlyV1;
assert.ok(ui,'comparison UI must export a private API');
for(const fn of ['validateComparison','renderHtml','mount','mountFromHandoff']) assert.equal(typeof ui[fn],'function',`${fn} must exist`);

const validated=ui.validateComparison(comparison);
assert.equal(validated.asset_id,'asset-1');
assert.equal(validated.from_revision,2);
assert.equal(validated.to_revision,3);
assert.equal(validated.preview_only,true);
assert.equal(validated.mutations_allowed,false);
assert.equal(validated.network_allowed,false);
assert.equal(validated.external_side_effect,false);

const html=ui.renderHtml(comparison);
assert.ok(html.includes('Revisão 2 → 3'));
assert.ok(html.includes('changed'));
assert.ok(html.includes('added'));
assert.ok(html.includes('aaaaaaaaaaaaaaaa'));
assert.ok(html.includes('bbbbbbbbbbbbbbbb'));
assert.ok(html.includes('&lt;script&gt;'),'path text must be escaped');
assert.ok(!html.includes('<script>'),'raw script markup must never be emitted');

const root={innerHTML:''};
const mounted=ui.mountFromHandoff(root);
assert.equal(mounted.asset_id,'asset-1');
assert.ok(root.innerHTML.includes('Revisão 2 → 3'));

assert.throws(()=>ui.validateComparison({...comparison,network_allowed:true}),/unsafe_comparison/);
assert.throws(()=>ui.validateComparison({...comparison,to_revision:4}),/non_contiguous_comparison/);
assert.throws(()=>ui.validateComparison({...comparison,paths:[{...comparison.paths[0],before_sha256:'bad'}]}),/comparison_hash_invalid/);
console.log('PASS: revision comparison UI is private, escaped, handoff-only and read-only.');
