import fs from "node:fs";
import assert from "node:assert/strict";

const source=fs.readFileSync("vitrine/admin/runtime-src/03-operations.part.js.txt","utf8");
const runtime=fs.readFileSync("vitrine/admin/admin-runtime.js","utf8");
const api=fs.readFileSync("supabase/functions/admin-products-live-v1/index.ts","utf8");
const migration=fs.readFileSync("supabase/migrations/20261019190000_ean_capture_resolution_v1.sql","utf8");

assert.ok(source.includes('id="productSource"'),"Products includes a source segment selector");
assert.ok(source.includes('state.productFilters.sourceSystem'),"source selection is persisted with current product filters");
assert.ok(source.includes("source_system:filters.sourceSystem"),"selected source is sent with product queries");
assert.ok(runtime.includes('id="productSource"'),"generated admin runtime includes the source segment");
assert.ok(api.includes('u.searchParams.get("source_system")'),"products API reads the source filter");
assert.ok(api.includes('q.eq("source_system",sourceSystem)'),"products API filters at the database query");
assert.ok(migration.includes("'ean_capture_admin','local'"),"products created by EAN carry a stable source marker");
console.log("EAN product source segmentation: PASS");
