import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const src=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const root=fs.readFileSync('index.html','utf8');
const nested=fs.readFileSync('vitrine/index.html','utf8');
assert.equal(root,nested,'public storefront entrypoints must stay in sync');
assert.match(src,/HOME_SNAPSHOT_TABLE="storefront_public_home_snapshot_v1"/);
assert.match(src,/\.select\("payload,generated_at"\)\.eq\("snapshot_key","home"\)/);
assert.match(src,/\.lt\("refresh_lease_until",new Date\(now\)\.toISOString\(\)\)/,'refresh must require an unexpired-free lease');
assert.match(src,/\.eq\("snapshot_key","home"\)\.eq\("refresh_token",token\)/,'refresh completion must hold the same lease');
assert.match(src,/EdgeRuntime\.waitUntil\(task\)/,'a slow rebuild must not block visitors');
assert.match(src,/if\(stale\)refreshPublicHomeInBackground\(\)/,'stale data should schedule revalidation');
assert.match(src,/async function cachedHomePriority\(\)\{[\s\S]*?priorityFromPublicHome\(await cachedHome\(\)\)/,'priority and full home must share one build');
assert.match(src,/homePromise=loadPublicHome\(\)\.finally/,'simultaneous cold requests must share a promise');
assert.match(src,/HOME_SNAPSHOT_MAX_STALE_MS=2\*60\*60_000/);
assert.match(src,/max-age=30, stale-while-revalidate=120/);
assert.match(src,/async function moldQuote\(/,'checkout quote remains dynamic');
assert.match(src,/async function submit\(/,'order submission remains dynamic');
assert.match(src,/offer_priority:p\.metadata\?\.offer_source/,'expiry offers must remain enabled');

const fns=src.slice(src.indexOf('function isValidPublicHome('),src.indexOf('function keepHomeInMemory('))
  .replace(/:any\b|:boolean\b/g,'');
assert.ok(fns.includes('function priorityFromPublicHome'),'extract the same production priority selector');
const pure=vm.runInNewContext(fns+';({isValidPublicHome,priorityFromPublicHome})');
const full={
 ok:true,version:'test',priority:false,
 basket_categories:[
  {id:'complete',slug:'cestas-completas',subcategories:[{id:'large',name:'Grande'},{id:'mini',name:'Mini'}]},
  {id:'other',slug:'cestas-so-alimentos',subcategories:[{id:'other-large',name:'Grande'}]}
 ],
 baskets:[
  {id:'a',category_id:'complete',subcategory_id:'large',name:'Grande'},
  {id:'b',category_id:'complete',subcategory_id:'mini',name:'Mini'},
  {id:'c',category_id:'other',subcategory_id:'other-large',name:'Só Alimentos'}
 ],
 categories:[{key:'mercearia',label:'Mercearia'}]
};
assert.equal(pure.isValidPublicHome(full),true);
assert.equal(pure.isValidPublicHome({...full,baskets:[]}),true,'an empty current catalog must replace stale unavailable baskets');
assert.equal(pure.isValidPublicHome({...full,priority:true}),false,'never store a priority-only response');
const priority=pure.priorityFromPublicHome(full);
assert.equal(priority.priority,true);
assert.deepEqual(JSON.parse(JSON.stringify(priority.baskets.map(b=>b.id))),['a']);
assert.equal(priority.categories[0].key,'mercearia');
assert.equal(full.baskets.length,3,'selector must not mutate the source catalog');
assert.equal(pure.priorityFromPublicHome({...full,catalog_stale:true}).catalog_stale,true);

const migration=fs.readdirSync('supabase/migrations').find(x=>x.includes('storefront_public_home_snapshot_v1.sql'));
assert.ok(migration,'new snapshot table requires a tracked migration');
const ddl=fs.readFileSync('supabase/migrations/'+migration,'utf8');
assert.match(ddl,/enable row level security/i);
assert.match(ddl,/revoke all on table public\.storefront_public_home_snapshot_v1 from public, anon, authenticated/i);
assert.match(ddl,/grant select, insert, update on table public\.storefront_public_home_snapshot_v1 to service_role/i);
assert.match(ddl,/refresh_token uuid/);
assert.match(ddl,/refresh_lease_until timestamptz/);
console.log('Storefront persistent snapshot R2 contract passed');
