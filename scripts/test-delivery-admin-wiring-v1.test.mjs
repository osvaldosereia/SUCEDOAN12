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

test("admin delivery scripts and styles have cache versions", () => {
  const html = read("site/admin/index.html");
  for (const asset of ["admin.js", "orders-admin.js", "orders-admin.css", "separation-message-admin.js", "delivery-admin.js", "delivery-admin.css"]) {
    const escaped = asset.replace(".", "\\.");
    assert.match(html, new RegExp('(?:src|href)="' + escaped + '\\?v=[1-9]\\d*"'), asset);
  }
});

test("delivery function delegates bearer authentication to its handler", () => {
  const config = readIfExists("supabase/config.toml");
  const source = read("supabase/functions/delivery-ops-v1/index.ts");
  assert.ok(/\[functions\.delivery-ops-v1\]\s*verify_jwt\s*=\s*false/.test(config), "platform JWT verification must be disabled for this custom-token endpoint");
  assert.ok(/async function requireDriver\(req: Request\)/.test(source), "driver bearer token must be checked by the handler");
  assert.ok(/\.eq\("token_hash", tokenHash\)/.test(source), "handler must compare only the stored token hash");
  assert.ok(/\.gt\("expires_at", new Date\(\)\.toISOString\(\)\)/.test(source), "handler must reject expired driver access tokens");
});

test("admin shows today's and scheduled routes separately for each driver", () => {
  const admin = read("site/admin/delivery-admin.js");
  const edge = read("supabase/functions/delivery-ops-v1/index.ts");
  assert.match(admin, /allRoutes\.filter\(\(run\) => \(run\.driver_id \|\| run\.driver\?\.id\) === state\.activeDriverId\)/);
  assert.match(admin, /run\.service_date === state\.data\?\.service_date \? "Pronta para entrega" : "Agendada"/);
  assert.match(edge, /const serviceDate = serviceDateInCuiaba\(\)/);
  assert.match(edge, /service_date:\s*serviceDate/);
});

test("route management is in the admin with order details and safe stop actions", () => {
  const html = read("site/admin/index.html");
  const admin = read("site/admin/delivery-admin.js");
  const orders = read("site/admin/orders-admin.js");
  const edge = read("supabase/functions/delivery-ops-v1/index.ts");
  const migration = read("supabase/migrations/20261106021520_delivery_route_admin_actions_v1.sql");
  assert.match(html, /id="delivery-routes-list"/);
  assert.match(admin, /data-view-delivery-order/);
  assert.match(orders, /DonaOrdersAdmin\s*=\s*\{[^}]*openOrder/);
  assert.match(orders, /Endereço de entrega/);
  assert.match(admin, /data-stop-cancel/);
  assert.match(admin, /data-stop-reassign/);
  assert.match(admin, /data-stop-reschedule/);
  assert.match(admin, /data-admin-delivered/);
  assert.match(edge, /action === "admin_cancel_stop"/);
  assert.match(edge, /action === "admin_reassign_stop"/);
  assert.match(edge, /action === "admin_reschedule_stop"/);
  assert.match(edge, /action === "admin_complete_stop"/);
  assert.match(edge, /p_idempotency_key:\s*"driver-delivery-v1:" \+ stop\.order_id/);
  assert.match(migration, /v_run\.status <> 'planned'[\s\S]*?v_run\.loading_started_at is not null[\s\S]*?v_run\.loaded_at is not null/);
  assert.match(migration, /delivery_not_available_sunday/);
  assert.match(migration, /grant execute on function public\.smart_delivery_admin_reassign_stop_v1[\s\S]*?to service_role/);
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

