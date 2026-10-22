import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = resolve(
  root,
  "supabase/migrations/20261022204000_ops2_address_number_search_path.sql",
);
const migration = await readFile(migrationPath, "utf8");

const functions = [
  "public.ops2_extract_address_number_v1(text)",
  "public.ops2_customer_address_number_fill_v1()",
  "public.ops2_order_delivery_number_fill_v1()",
];

for (const signature of functions) {
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(
    migration,
    new RegExp(`ALTER FUNCTION\\s+${escaped}\\s+SET search_path\\s*=\\s*''`, "i"),
    `must pin ${signature} to an empty search_path`,
  );
  assert.match(
    migration,
    new RegExp(`ROLLBACK:.*ALTER FUNCTION\\s+${escaped}\\s+RESET search_path`, "is"),
    `must document rollback for ${signature}`,
  );
}

assert.doesNotMatch(migration, /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|GRANT|REVOKE)\b/im);
assert.doesNotMatch(migration, /SECURITY\s+DEFINER/i);
assert.doesNotMatch(migration, /CREATE\s+OR\s+REPLACE/i);

console.log("OPS2 address-number functions pin search_path without changing bodies, grants, or rows.");
