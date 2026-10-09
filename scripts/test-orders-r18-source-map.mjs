import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
const read=name=>JSON.parse(fs.readFileSync(new URL("./fixtures/"+name,import.meta.url),"utf8"));
const canonical=read("orders-r18-canonical-function-fingerprints-20261009.json");
const map=read("orders-r18-source-candidates-20261009.json");
const triggers=read("orders-r17-canonical-trigger-dependencies-20261009.json");
const nameOf=x=>x.schema+"."+x.function;
test("R18 source candidates cover every distinct canonical trigger function, no phantom",()=>{
 const a=canonical.functions.map(nameOf).sort();
 const b=map.functions.map(x=>x.name).sort();
 assert.equal(a.length,29); assert.deepEqual(b,a);
 assert.equal(new Set(b).size,29);
 assert.equal(triggers.triggers.length,30);
});
test("R18 never claims unverified source matches as canonical",()=>{
 const verified=map.functions.filter(x=>x.status==="pg17_exact_canonical_fingerprint_verified");
 assert.deepEqual(verified.map(x=>x.name).sort(),[
  "public.enforce_storefront_checkout_basics_v1",
  "public.ops2_guard_dispatch_fiscal_job_v1",
  "public.ops2_require_separator_completion_v4"
 ]);
 assert.ok(map.functions.every(x=>x.requires_dependency_closure===true));
 assert.ok(map.functions.every(x=>x.status!=="pg17_exact_canonical_fingerprint_verified"||x.candidates.length===1));
});
test("R18 misses are visible and do not hallucinate installed SQL",()=>{
 const missing=map.functions.filter(x=>x.status==="no_github_index_match");
 assert.equal(missing.length,4);
 assert.ok(missing.every(x=>x.candidates.length===0));
 assert.equal(map.contains_business_data,false);
 assert.match(map.method,/not source-of-truth/);
});
test("R18 source paths are repository-relative and SQL only",()=>{
 const all=map.functions.flatMap(x=>x.candidates);
 assert.ok(all.length>20);
 assert.ok(all.every(x=>x.startsWith("supabase/")&&x.endsWith(".sql")&&!x.includes("..")));
});
test("R18 digest-only capture: no PLPGSQL function body or secrets",()=>{
 assert.equal(canonical.contains_business_data,false);
 assert.equal(canonical.functions.length,29);
 assert.ok(canonical.functions.every(x=>/^[a-f0-9]{32}$/.test(x.function_md5)));
 assert.ok(canonical.functions.every(x=>!Object.hasOwn(x,"source_sql")&&!Object.hasOwn(x,"body")));
});
