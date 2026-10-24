import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const helperUrl = new URL("../supabase/functions/admin-service-intelligence-v1/_shared/admin-service-outcome-telemetry.mjs", import.meta.url);
assert.ok(existsSync(fileURLToPath(helperUrl)), "telemetry helper should exist");

const {
  ADMIN_SERVICE_OUTCOME_ACTIONS,
  buildAdminServiceOutcomeEvent,
  classifyAdminServiceOutcomeStatus,
  formatAdminServiceOutcomeEvent,
  withAdminServiceOutcomeTelemetry,
} = await import(helperUrl.href);

const sourceUrl = new URL("../supabase/functions/admin-service-intelligence-v1/index.ts", import.meta.url);
const source = readFileSync(sourceUrl, "utf8");
const dispatcherStart = source.indexOf("Deno.serve(");
assert.notEqual(dispatcherStart, -1, "dispatcher entrypoint should exist");
const dispatcher = source.slice(dispatcherStart);
const dispatcherActions = [...new Set([...dispatcher.matchAll(/\baction\s*===?\s*["']([^"']+)["']/g)].map((m) => m[1]))].sort();
assert.deepEqual([...ADMIN_SERVICE_OUTCOME_ACTIONS].sort(), dispatcherActions, "fixed allowlist must exactly cover dispatcher action branches");
assert.match(source, /import\s+\{\s*withAdminServiceOutcomeTelemetry\s*\}\s+from\s+["']\.\/_shared\/admin-service-outcome-telemetry\.mjs["']/);
assert.match(dispatcher, /return\s+withAdminServiceOutcomeTelemetry\(action,\s*async\s*\(\)\s*=>\s*\{/);
assert.match(dispatcher, /return json\(\{ok:false,error:"unknown_action"\},400\);\s*\}\);\s*\}\);/);

assert.equal(classifyAdminServiceOutcomeStatus(200), "none");
assert.equal(classifyAdminServiceOutcomeStatus(400), "request");
assert.equal(classifyAdminServiceOutcomeStatus(401), "authorization");
assert.equal(classifyAdminServiceOutcomeStatus(403), "authorization");
assert.equal(classifyAdminServiceOutcomeStatus(409), "conflict");
assert.equal(classifyAdminServiceOutcomeStatus(429), "rate_limited");
assert.equal(classifyAdminServiceOutcomeStatus(502), "upstream");
assert.equal(classifyAdminServiceOutcomeStatus(500), "server");
assert.equal(classifyAdminServiceOutcomeStatus(Number.NaN), "server");

const attack = "vitrine_customer_lookup_phone:cliente@example.com:555-0100";
const event = buildAdminServiceOutcomeEvent(attack, 502, { payload: "sensitive request" });
assert.deepEqual(Object.keys(event).sort(), ["action", "error_class", "event", "status"]);
assert.deepEqual(event, {
  event: "admin_service_action_result",
  action: "unknown",
  status: 502,
  error_class: "upstream",
});
const serialized = formatAdminServiceOutcomeEvent(attack, 502, { detail: "sensitive" });
assert.doesNotMatch(serialized, /cliente@example\.com|555-0100|sensitive/i);

const logs = [];
const response = new Response("response body must not be logged", { status: 502 });
const returned = await withAdminServiceOutcomeTelemetry("r8_orders", async () => response, (line) => logs.push(JSON.parse(line)));
assert.equal(returned, response, "telemetry must return the original Response object");
assert.equal(returned.status, 502);
assert.equal(returned.bodyUsed, false);
assert.deepEqual(logs, [{
  event: "admin_service_action_result",
  action: "r8_orders",
  status: 502,
  error_class: "upstream",
}]);

const thrown = new Error("customer=cliente@example.com token=private");
const thrownLogs = [];
await assert.rejects(
  withAdminServiceOutcomeTelemetry("r8_orders", async () => { throw thrown; }, (line) => thrownLogs.push(JSON.parse(line))),
  (error) => error === thrown,
);
assert.deepEqual(thrownLogs, [{
  event: "admin_service_action_result",
  action: "r8_orders",
  status: 500,
  error_class: "server",
}]);
assert.doesNotMatch(JSON.stringify([...logs, ...thrownLogs]), /cliente@example\.com|private|response body/i);

const brokenLoggerResponse = new Response(null, { status: 204 });
assert.equal(
  await withAdminServiceOutcomeTelemetry("dashboard", async () => brokenLoggerResponse, () => { throw new Error("logger failure"); }),
  brokenLoggerResponse,
  "a logging failure must not change dispatcher behavior",
);

console.log("Admin service action outcome telemetry contract: OK");
