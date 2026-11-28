import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../supabase/functions/delivery-ops-v1/index.ts", import.meta.url), "utf8");
const start = source.indexOf("async function adminNextNotice(");
const end = source.indexOf("async function adminSaveLocation(", start);
assert.ok(start >= 0 && end > start);
const functionSource = stripTypeScriptTypes(source.slice(start, end));

function setup() {
  const calls = [];
  class ApiFailure extends Error {}
  const context = {
    ApiFailure,
    uuid: (v) => v === "fixture-stop" ? v : "",
    normalizeEta: (v) => { if (v !== 15) throw new ApiFailure("invalid_eta"); return v; },
    ensureAdminStopDispatched: async () => { calls.push("dispatch"); },
    driverForAdminStop: async () => { calls.push("driver"); return { id: "fixture" }; },
    notifyNextStop: async () => { calls.push("notice"); return { ok: true }; },
  };
  runInNewContext(functionSource + "\nglobalThis.call = adminNextNotice;", context);
  return { call: context.call, calls };
}

test("an invalid ETA cannot dispatch an order or route", async () => {
  const { call, calls } = setup();
  await assert.rejects(call({ stop_id: "fixture-stop", eta_minutes: -1 }), /invalid_eta/);
  assert.deepEqual(calls, []);
});

test("a valid ETA proceeds in order from dispatch to notification", async () => {
  const { call, calls } = setup();
  await call({ stop_id: "fixture-stop", eta_minutes: 15 });
  assert.deepEqual(calls, ["dispatch", "driver", "notice"]);
});
