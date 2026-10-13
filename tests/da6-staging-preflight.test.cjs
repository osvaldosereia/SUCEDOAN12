const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const script=path.resolve(__dirname,'../scripts/da6-staging-preflight.mjs');
const moduleUrl=pathToFileURL(script).href;
const REF='abcdefghijklmnopqrst';
const URL='https://'+REF+'.supabase.co/functions/v1/admin-products-live-v1?action=inventory_label_worker_tick';
const stage={projectRef:REF,confirmedRef:REF,workerUrl:URL,environment:'staging'};
test('R8 staging: only a separate explicitly confirmed URL is eligible',async()=>{
 const {validateDa6Staging:check}=await import(moduleUrl);
 assert.deepEqual(check(stage).errors,[]);
 assert.equal(check(stage).ok,true);
});
test('R8 staging: both real Dona Antônia projects are blocked',async()=>{
 const {validateDa6Staging:check}=await import(moduleUrl);
 for(const ref of ['ssbesxgaijknwsjbsbcz','qxstkwshuvplmmftrctj']){
  const value=check({...stage,projectRef:ref,confirmedRef:ref,
    workerUrl:'https://'+ref+'.supabase.co/functions/v1/admin-products-live-v1?action=inventory_label_worker_tick'});
  assert.equal(value.ok,false);
  assert.ok(value.errors.includes('production_project_forbidden'));
 }
});
test('R8 staging: unexpected origin, protocol, endpoint or query are rejected',async()=>{
 const {validateDa6Staging:check}=await import(moduleUrl);
 for(const url of [
  URL.replace('https:','http:'),
  URL.replace(REF,'ssbesxgaijknwsjbsbcz'),
  URL+'&force=true',
  URL.replace('inventory_label_worker_tick','health'),
  URL.replace('.supabase.co','-evil.supabase.co'),
  'https://attacker:token@'+REF+'.supabase.co/functions/v1/admin-products-live-v1?action=inventory_label_worker_tick'
 ])assert.ok(check({...stage,workerUrl:url}).errors.includes('worker_url_not_exact_staging_endpoint'));
});
test('R8 staging: explicit independent confirmation and staging environment required',async()=>{
 const {validateDa6Staging:check}=await import(moduleUrl);
 assert.ok(check({...stage,confirmedRef:''}).errors.includes('staging_ref_not_independently_confirmed'));
 assert.ok(check({...stage,confirmedRef:'qrstuvwxyzabcdefghij'}).errors.includes('staging_ref_not_independently_confirmed'));
 assert.ok(check({...stage,environment:'production'}).errors.includes('environment_not_staging'));
 assert.ok(check({...stage,projectRef:''}).errors.includes('project_ref_missing_or_invalid'));
});
test('R8 staging: CLI enforce fails closed without configuration and never prints credentials',()=>{
 const r=spawnSync(process.execPath,[script,'--enforce'],{
  env:{PATH:process.env.PATH,HOME:process.env.HOME},encoding:'utf8',timeout:10000});
 assert.equal(r.status,3,r.stderr);
 const data=JSON.parse(r.stdout);
 assert.equal(data.ok,false);
 assert.doesNotMatch(r.stdout,/token|service_role|password/i);
});
test('R8 staging: CLI report is read-only and documents blockers',()=>{
 const r=spawnSync(process.execPath,[script,'--report'],{
  env:{PATH:process.env.PATH,HOME:process.env.HOME},encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);
 assert.equal(JSON.parse(r.stdout).ok,false);
});