import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const readIfExists = (path) => existsSync(resolve(root, path)) ? read(path) : "";

test("admin delivery script is loaded as a module", () => {
  const html = read("site/admin/index.html");
  assert.ok(/<script\s+type="module"\s+src="delivery-admin\.js\?v=\d+"><\/script>/.test(html), "delivery-admin.js must load with type=module");
});

test("changed admin scripts use fresh cache versions", () => {
  const html = read("site/admin/index.html");
  assert.ok(/src="admin\.js\?v=25"/.test(html), "admin navigation code must bypass the previously cached script");
  assert.ok(/src="orders-admin\.js\?v=9"/.test(html), "delivery action in the expedition list must bypass the old script");
  assert.ok(/src="separation-message-admin\.js\?v=4"/.test(html), "new template controls must bypass the old script");
  assert.ok(/src="delivery-admin\.js\?v=3"/.test(html), "delivery admin imports must bypass cached modules");
  assert.ok(/src="driver\.js\?v=2"/.test(read("site/entregador/index.html")), "driver portal imports must bypass cached modules");
});

test("delivery function delegates bearer authentication to its handler", () => {
  const config = readIfExists("supabase/config.toml");
  const source = read("supabase/functions/delivery-ops-v1/index.ts");
  assert.ok(/\[functions\.delivery-ops-v1\]\s*verify_jwt\s*=\s*false/.test(config), "platform JWT verification must be disabled for this custom-token endpoint");
  assert.ok(/async function requireDriver\(req: Request\)/.test(source), "driver bearer token must be checked by the handler");
  assert.ok(/\.eq\("token_hash", tokenHash\)/.test(source), "handler must compare only the stored token hash");
  assert.ok(/\.gt\("expires_at", new Date\(\)\.toISOString\(\)\)/.test(source), "handler must reject expired driver access tokens");
});

test("admin delivery queue uses the service date and only renders today's orders", () => {
  const html = read("site/admin/index.html");
  const admin = read("site/admin/delivery-admin.js");
  const domain = read("site/admin/delivery-domain.mjs");
  assert.ok(/delivery-admin\.js\?v=3/.test(html), "the delivery module must use a fresh cache version");
  assert.ok(/partitionDeliveryOrders\(/.test(admin), "the ready queue must be partitioned by service date");
  const edge = read("supabase/functions/delivery-ops-v1/index.ts");
  assert.ok(/const serviceDate = serviceDateInCuiaba\(\)/.test(edge), "the API must use Cuiabá's service date");
  assert.ok(/service_date:\s*serviceDate/.test(edge), "the API must return its service date to the admin");
  assert.ok(/export function partitionDeliveryOrders\(/.test(domain), "the queue partition must be covered by the tested domain module");
});

test("prepaid selector starts unselected and cannot fall back to Pix", () => {
  const admin = read("site/admin/delivery-admin.js");
  assert.ok(/<option value="" selected disabled>Selecione se já foi pago<\/option>/.test(admin), "the operator must choose the actual prepaid method");
  assert.ok(/prepaidPaymentMethod\(select\?\.value\)/.test(admin), "the selected method must be explicitly validated");
  assert.ok(/if \(!method\)\s*\{[\s\S]*?return;\s*\}/.test(admin), "the prepaid action must stop when no valid method was selected");
  assert.doesNotMatch(admin, /select\?\.value\s*\|\|\s*"pix"/, "the UI must never assume Pix as the default");
});

test("confirmed address uses address_line when street is empty", () => {
  const migration = read("supabase/migrations/20261105090000_delivery_driver_portal_v1.sql");
  assert.ok(
    /v_street\s*:=\s*coalesce\(\s*nullif\(trim\(v_address_doc->>'street'\),\s*''\),\s*nullif\(trim\(v_address_doc->>'address_line'\),\s*''\)\s*\);/s.test(migration),
    "blank street must fall through to address_line",
  );
});

test("driver replanning merges the locked live route and blocks loading before cancelling it", () => {
  const migration = read("supabase/migrations/20261105090000_delivery_driver_portal_v1.sql");
  const start = migration.indexOf("create or replace function public.ops_plan_delivery_run_v1(");
  const end = migration.indexOf("$function$;", start) + "$function$;".length;
  const functionSql = migration.slice(start, end);
  const lock = functionSql.indexOf("perform pg_advisory_xact_lock");
  const liveRouteLock = functionSql.indexOf("for v_existing_run_row in");
  const loadingGuard = functionSql.indexOf("v_existing_run_row.loading_started_at");
  const merge = functionSql.indexOf("array_append(v_order_ids");
  const cancel = functionSql.indexOf("set status = 'cancelled'");

  assert.ok(lock >= 0 && liveRouteLock > lock, "the advisory lock must be followed by a fresh locked route read");
  assert.ok(loadingGuard > liveRouteLock && merge > loadingGuard, "loading must be checked before the current stops are merged");
  assert.ok(cancel > merge, "the live route may only be cancelled after its stops have been merged");
  assert.ok(functionSql.indexOf("for v_existing_order_id in") < functionSql.indexOf("foreach v_order_id in array p_order_ids loop"), "the live stop order must take precedence over a stale admin snapshot");
  assert.ok(/service_date\s*=\s*v_today[\s\S]*?vehicle_key\s*=\s*v_vehicle_key[\s\S]*?status\s*=\s*'planned'[\s\S]*?for update/i.test(functionSql));
  assert.match(functionSql, /foreach v_order_id in array v_order_ids loop/i);
});

