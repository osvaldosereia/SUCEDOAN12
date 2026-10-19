import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=path=>fs.readFileSync(path,'utf8');
const polish=read('vitrine/admin/marketing/marketing-polish.js');
const templates=read('vitrine/admin/marketing/template-center.js');
const picker=read('vitrine/admin/marketing/template-type-picker.js');
const campaignEntry=read('vitrine/admin/marketing/campaign-entry.js');
const campaignList=read('vitrine/admin/marketing/campaign-list-simple.js');
const campaignSimple=read('vitrine/admin/marketing/campaign-simple-ui.js');
const bootstrap=read('vitrine/admin/basket-lot-image.js');
const admin=read('vitrine/admin/index.html');
const backend=read('supabase/functions/admin-whatsapp-templates-v1/index.ts');

for(const [file,source] of Object.entries({
 'marketing-polish.js':polish,'template-center.js':templates,
 'template-type-picker.js':picker,'campaign-entry.js':campaignEntry,
 'campaign-list-simple.js':campaignList,'campaign-simple-ui.js':campaignSimple,'basket-lot-image.js':bootstrap
})){
  const normalized=source.replace(/^import[^\n]*\n/gm,'').replace(/^export\s*\{[^}]*\};?/gm,'');
  new vm.Script(normalized,{filename:file});
}

for(const [name,source] of Object.entries({
 picker,campaignEntry,campaignList,campaignSimple
})){
  assert.doesNotMatch(source,/new MutationObserver\s*\(/,name+' must not self-observe the DOM');
  assert.doesNotMatch(source,/\.observe\(document\.documentElement/,name+' must not observe all document changes');
}
assert.equal((polish.match(/new MutationObserver\s*\(/g)||[]).length,1,'one Marketing coordinator');
assert.match(polish,/observer\.disconnect\(\)/,'coordinator must ignore its own DOM writes');
assert.match(polish,/requestAnimationFrame\(apply\)/,'no microtask starvation');
assert.match(polish,/observer\.observe\(observedNode,\{subtree:true,childList:true\}\)/);
assert.doesNotMatch(polish,/characterData:true/,'avoid characterData self-triggering');
assert.match(polish,/window\.DAMarketingCampaignEntry\?\.enhance\?\.\(\)/,'coordinator must refresh campaign navigation');
assert.match(campaignList,/center\.querySelector\('\[data-simple-campaign-list\]'\)/,'campaigns never reload their own list render');

const countSource=picker.match(/function updateCount\(center\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(countSource,'find updateCount');
const updateCount=vm.runInNewContext('('+countSource+')');
let mutations=0;
function titleNode(initial){
  let value=initial;
  return {get textContent(){return value},set textContent(v){value=v;mutations++}};
}
const title=titleNode('Templates'),subtitle=titleNode('Carregando');
const head={querySelector:sel=>sel==='h2'?title:sel==='p'?subtitle:null};
const center={querySelector:sel=>sel==='.marketing-template-head'?head:null,querySelectorAll:()=>[{},{}]};
updateCount(center);const first=mutations;updateCount(center);
assert.equal(first,2,'labels should update once');
assert.equal(mutations,first,'second render must not mutate DOM');

assert.match(templates,/action:sync\?'sync':'list',channel:requestedChannel/,'channel directly resolved by Templates API');
assert.match(templates,/LOAD_TIMEOUT_MS/,'network should have finite deadline');
assert.match(templates,/data-template-retry/,'load failures should offer retry');
assert.match(templates,/lastLoadError/,'errors must not masquerade as an empty catalog');
assert.match(templates,/pendingTemplateLoads/,'busy user requests must not be dropped');
assert.match(backend,/channel_or_account_required/);
assert.match(backend,/\.eq\("slug","dona-antonia-"\+channel\)/,'backend only accepts the two official channels');
assert.match(backend,/const auth=await adminAuth\(req\)/,'all list and sync reads remain authenticated');
assert.match(bootstrap,/meta-template-stable-v1/,'force new stable template module');
assert.match(bootstrap,/marketing-campaign-entry-v2/,'force new stable campaign module');
assert.match(admin,/basket-lot-image\.js\?v=marketing-selection-firstname-v1/,'force browser to load fixed marketing');
for(const route of ['overview','strategy','templates','campaigns','audiences'])
 assert.match(polish,new RegExp(route),'retain '+route+' navigation');
assert.match(polish,/data-marketing-admin-consents/,'retain consent access');

console.log('PASS Marketing unified: no recursive observer, stable listing, retry, channels, navigation');
