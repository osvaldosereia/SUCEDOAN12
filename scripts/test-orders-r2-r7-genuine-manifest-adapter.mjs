// Offline R02-R07: convert ACTUAL R06 frozen receipts exported from
// PostgreSQL after a genuine R02 checkout + R04/R05 + real R06 callbacks.
// R07 adapter imported from the original pinned R07 source; no Bling API.
import assert from "node:assert/strict";
import fs from "node:fs";
import {
 buildReconciledBlingSnapshot,fingerprintBlingPayload,stableJson
} from "../r07-source/supabase/functions/_shared/order-bling-r7-manifest-v1.mjs";
const raw=fs.readFileSync(process.argv[2],"utf8").trim().split(/\r?\n/);
const output=process.argv[3];
if(!output||raw.length!==2)throw Error("two_actual_post_separation_manifests_required");
const expected={
 basket:{total:140,product:"00000000-0000-4000-8000-0000000000e1",
   qty:1,unit:5000,delta:9000,miss:2000},
 mold:{total:75,product:"00000000-0000-4000-8000-0000000000e3",
   qty:1,unit:6000,delta:1500,miss:3000}
};
const ids=new Set(),rows=[],hashes=new Set();
for(const rawRow of raw){
 const row=JSON.parse(rawRow),exp=expected[row.kind];
 assert.ok(exp,"unexpected_checkout_kind");
 assert.ok(/^[a-f0-9-]{36}$/.test(row.order_id));
 assert.ok(!ids.has(row.order_id),"duplicate_order_receipt");
 ids.add(row.order_id);
 assert.equal(row.total,exp.total,"real_order_total");
 assert.equal(row.manifest.order_id,row.order_id);
 assert.equal(row.manifest.public_order_number,row.order_number);
 assert.equal(row.manifest.ready,true);
 assert.equal(row.manifest.blockers.length,0);
 const original=JSON.parse(JSON.stringify(row.manifest));
 const base={
   source_order_id:row.order_id,order_number:row.order_number,
   status:"ready",totals:{commercial_order_cents:exp.total*100},
   items:[]
 };
 const snapshot=buildReconciledBlingSnapshot(base,row.manifest);
 assert.equal(snapshot.items.length,1,"only deliverable line may reach Bling");
 const product=snapshot.items[0];
 assert.equal(product.product_id,exp.product);
 assert.equal(product.quantity,exp.qty);
 assert.equal(product.unit_price_cents,exp.unit);
 assert.equal(snapshot.totals.commercial_delta_cents,exp.delta);
 assert.equal(snapshot.r7_reconciliation.missing_subtotal_cents,exp.miss);
 assert.equal(snapshot.r7_reconciliation.final_total_cents,exp.total*100);
 assert.equal(snapshot.order_number,row.order_number,"original public code unchanged");
 assert.equal(snapshot.r7_reconciliation.missing_line_count,1);
 const picked=row.manifest.lines.filter(x=>x.deliverable===true);
 assert.equal(picked.length,1);
 assert.ok(snapshot.items.every(x=>x.product_id!=="00000000-0000-4000-8000-0000000000e2"
   &&x.product_id!=="00000000-0000-4000-8000-0000000000e4"),"FALTOU item leaked");
 assert.deepEqual(row.manifest,original,"adapter must NOT mutate persisted manifest");
 const hash=await fingerprintBlingPayload(snapshot);
 const replay=await fingerprintBlingPayload(
   buildReconciledBlingSnapshot({...base},JSON.parse(stableJson(row.manifest)))
 );
 assert.equal(hash,replay,"fingerprint depends on key order");
 assert.match(hash,/^[0-9a-f]{64}$/);
 assert.ok(!hashes.has(hash));
 hashes.add(hash);
 const invalid=structuredClone(row.manifest);
 invalid.lines[0].deliverable=!invalid.lines[0].deliverable;
 assert.throws(()=>buildReconciledBlingSnapshot(base,invalid));
 rows.push({kind:row.kind,id:row.order_id,hash,
   total:exp.total,missing:exp.miss,individual:snapshot.totals.individual_products_cents});
}
assert.deepEqual([...rows.map(x=>x.kind)].sort(),["basket","mold"]);
const quote=v=>"'"+v.replaceAll("'","''")+"'";
let sql="-- Synthesized in GitHub Actions from real R02/R06 receipts; NEVER production.\n";
sql+="CREATE TABLE public.r2_r7_verified_payloads(order_id uuid PRIMARY KEY,kind text UNIQUE,payload_hash text UNIQUE,expected_total numeric,product_lines_cents integer);\n";
for(const r of rows)sql+="INSERT INTO public.r2_r7_verified_payloads VALUES ("+quote(r.id)+"::uuid,"+quote(r.kind)+","+quote(r.hash)+","+r.total+","+r.individual+");\n";
fs.writeFileSync(output,sql);
for(const r of rows)process.stdout.write("PASS R07 projection "+r.kind+": original checkout, total "+r.total+", missing "+r.missing+", product cents "+r.individual+", sha256 "+r.hash.slice(0,12)+"\n");
