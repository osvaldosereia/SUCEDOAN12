import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const migrationName = readdirSync(resolve(root, "supabase/migrations"))
  .find((name) => /delivery_dispatch_without_fiscal_gate_v1\.sql$/.test(name));
const migration = migrationName ? read(`supabase/migrations/${migrationName}`) : "";

function functionSql(source, functionName) {
  const lower = source.toLowerCase();
  const start = lower.indexOf(`create or replace function public.${functionName.toLowerCase()}(`);
  assert.notEqual(start, -1, `migration must redefine ${functionName}`);
  const end = source.indexOf("$function$;", start);
  assert.notEqual(end, -1, `${functionName} definition must end cleanly`);
  return source.slice(start, end + "$function$;".length);
}

test("dispatch no longer blocks on invoice authorization and keeps physical-stock gate", () => {
  assert.ok(migrationName, "a versioned delivery dispatch migration must exist");
  assert.match(
    migration,
    /require_fiscal_authorization_before_dispatch\s*=\s*false/i,
    "the runtime fiscal authorization requirement must be disabled",
  );
  const dispatch = functionSql(migration, "ops4_start_dispatch_v1");
  assert.doesNotMatch(
    dispatch,
    /dispatch_fiscal_status\s+not\s+in\s*\(\s*'authorized'\s*,\s*'not_required'\s*\)/i,
    "dispatch must not require an authorized invoice",
  );
  assert.match(dispatch, /check_order_dispatch_fiscal_gate_v1/i, "the shared gate must remain active for physical stock checks");
  assert.match(dispatch, /gate->>'allowed'/i, "a failed physical-stock gate must still block dispatch");
});

test("fiscal delivery control accepts the out-for-delivery transition", () => {
  const statusMigration = read("supabase/migrations/20261106035000_delivery_fiscal_status_out_for_delivery_v1.sql");
  assert.match(statusMigration, /order_fiscal_controls_delivery_status_check/i, "the incompatible legacy status check must be replaced");
  assert.match(statusMigration, /'out_for_delivery'/i, "the fiscal control must accept an order entering delivery");
});

test("separation honors the invoice-send kill switch before any fiscal send call", () => {
  const source = read("supabase/functions/site-admin-v1/index.ts");
  const start = source.indexOf("async function runSeparationFiscalIntegration(");
  const end = source.indexOf("async function completeOrderSeparation(", start);
  assert.ok(start >= 0 && end > start, "separation integration function must be present");
  const integration = source.slice(start, end);
  const guard = integration.indexOf("if (!invoiceSendingEnabled)");
  const preview = integration.indexOf('separationFiscalHubCall("fiscal_dispatch_preview"');
  const send = integration.indexOf('separationFiscalHubCall("fiscal_dispatch_canary_human_execute"');
  assert.ok(integration.includes('from("fiscal_runtime_config")'), "automatic issue must read the Supabase runtime flags");
  assert.ok(integration.includes("bling_invoice_send_enabled"), "automatic issue must honor the invoice-send flag");
  assert.ok(guard >= 0 && preview > guard && send > guard, "disabled invoice sending must return before preview or issue calls");
  assert.ok(integration.includes("fiscal_invoice_sending_disabled"), "the skipped issuance must be recorded clearly");
});

test("single-order dispatch skips fiscal preview and still reports invoice as deferred", () => {
  const source = read("supabase/functions/admin-products-live-v1/index.ts");
  const start = source.indexOf("async function orderDispatchStartV4(");
  const end = source.indexOf("async function rejectCriticalStatusBypass(", start);
  assert.ok(start >= 0 && end > start, "single-order dispatch function must be present");
  const dispatch = source.slice(start, end);
  assert.doesNotMatch(dispatch, /orderFiscalStatusV4\(oid\)/, "dispatch must not call the fiscal preview endpoint");
  assert.doesNotMatch(dispatch, /fiscal_authorization_required_before_dispatch/, "dispatch must not reject a pending invoice");
  assert.match(dispatch, /fiscal_invoice_sending_disabled/, "the response must explain that invoice sending is deferred");
  assert.match(dispatch, /ops4_start_dispatch_v1/, "the order must still enter the delivery flow");
});

test("manual and automatic invoice actions honor the runtime send-off switch", () => {
  const source = read("supabase/functions/admin-products-live-v1/index.ts");
  assert.match(source, /async function fiscalInvoiceSendBlocked\(/, "one shared guard must read the invoice-send runtime flag");
  const gateStart = source.indexOf("async function fiscalInvoiceSendBlocked(");
  const gateEnd = source.indexOf("async function orderFiscalIssueV4(", gateStart);
  const sendGate = source.slice(gateStart, gateEnd);
  assert.match(sendGate, /bling_invoice_send_enabled/, "the send flag must be checked before issuance");
  assert.match(sendGate, /execution_mode/, "automatic or manual sending must require live execution mode");
  const issueStart = source.indexOf("async function orderFiscalIssueV4(");
  const issueEnd = source.indexOf("async function orderDispatchStartV4(", issueStart);
  const manualIssue = source.slice(issueStart, issueEnd);
  assert.ok(manualIssue.indexOf("fiscalInvoiceSendBlocked()") < manualIssue.indexOf("ops2_fiscal_dispatch_preflight_v1"), "manual issue must stop before fiscal preflight when sending is off");

  const autoStart = source.indexOf("async function autoIssueFiscalAfterSeparation(");
  const autoEnd = source.indexOf("async function runSeparationPostCompletionIntegrations(", autoStart);
  const automaticIssue = source.slice(autoStart, autoEnd);
  assert.ok(automaticIssue.indexOf("fiscalInvoiceSendBlocked()") < automaticIssue.indexOf("ops2_fiscal_dispatch_preflight_v1"), "automatic issue must stop before fiscal preflight when sending is off");

  const integrationStart = source.indexOf("async function runSeparationPostCompletionIntegrations(");
  const integrationEnd = source.indexOf("\nasync function ", integrationStart + 1);
  const integration = source.slice(integrationStart, integrationEnd);
  assert.match(integration, /fiscalAuto\?\.skipped!==true/, "an intentional pause must not create a failure alert");
  assert.match(integration, /fiscal_auto_skipped:\s*fiscalAuto\?\.skipped===true/, "an intentional pause must be saved in separation metadata");

  const handlerStart = source.indexOf("Deno.serve(async(r:Request)=>");
  const routeStart = source.indexOf('if(r.method==="POST"&&a==="order_fiscal_dispatch_canary_execute"){', handlerStart);
  const directGuard = source.indexOf('if(a==="order_fiscal_dispatch_canary_execute"){', handlerStart);
  const preflight = source.indexOf('db.rpc("ops2_fiscal_dispatch_preflight_v1"', routeStart);
  const send = source.indexOf('hub("fiscal_dispatch_canary_human_execute"', routeStart);
  const guard = source.indexOf("fiscalInvoiceSendBlocked()", handlerStart);
  assert.ok(directGuard >= 0 && directGuard < guard && guard < routeStart, "the direct issue action must be blocked at the request boundary");
  assert.ok(preflight > routeStart && send > preflight, "the guarded direct action must otherwise retain its explicit preflight and send path");
});
