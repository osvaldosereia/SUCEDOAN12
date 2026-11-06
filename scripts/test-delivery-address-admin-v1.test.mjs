import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("admin delivery cards expose the saved address point, alternatives, and facade photo", async () => {
  const [admin, edge, html] = await Promise.all([
    read("../site/admin/delivery-admin.js"),
    read("../supabase/functions/delivery-ops-v1/index.ts"),
    read("../site/admin/index.html"),
  ]);
  assert.match(admin, /delivery-address-reference/);
  assert.match(admin, /primary_latitude/);
  assert.match(admin, /saved_locations/);
  assert.match(admin, /address_photo/);
  assert.match(edge, /customer_address_reference_photos_v1/);
  assert.match(edge, /primary_latitude/);
  assert.match(html, /delivery-admin\.js\?v=5/);
  assert.match(html, /delivery-admin\.css\?v=4/);
});
