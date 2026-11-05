import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const deliveryDate = await import("../supabase/functions/_shared/delivery-date-v1.mjs").catch(() => ({}));
const edgeSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../supabase/functions/delivery-ops-v1/index.ts"), "utf8");

test("service date follows Cuiabá midnight boundaries", () => {
  assert.equal(typeof deliveryDate.serviceDateInCuiaba, "function");
  assert.equal(deliveryDate.serviceDateInCuiaba(new Date("2026-11-05T03:59:59.000Z")), "2026-11-04");
  assert.equal(deliveryDate.serviceDateInCuiaba(new Date("2026-11-05T04:00:00.000Z")), "2026-11-05");
});

test("explicit delivery date wins and a missing date falls back to creation day in Cuiabá", () => {
  assert.equal(typeof deliveryDate.deliveryDateForOrder, "function");
  assert.equal(deliveryDate.deliveryDateForOrder({
    checkout_snapshot: { delivery: { date: "2026-11-06" } },
    created_at: "2026-11-05T04:30:00.000Z",
  }), "2026-11-06");
  assert.equal(deliveryDate.deliveryDateForOrder({
    checkout_snapshot: {},
    created_at: "2026-11-05T04:30:00.000Z",
  }), "2026-11-05");
  assert.equal(deliveryDate.deliveryDateForOrder({
    checkout_snapshot: { delivery: { date: "not-a-date" } },
    created_at: "2026-11-05T04:30:00.000Z",
  }), null);
});

test("server guard only accepts orders scheduled for the route service date", () => {
  assert.equal(typeof deliveryDate.isScheduledForDate, "function");
  assert.equal(deliveryDate.isScheduledForDate({ checkout_snapshot: { delivery: { date: "2026-11-05" } } }, "2026-11-05"), true);
  assert.equal(deliveryDate.isScheduledForDate({ checkout_snapshot: { delivery: { date: "2026-11-04" } } }, "2026-11-05"), false);
  assert.equal(deliveryDate.isScheduledForDate({ checkout_snapshot: {} }, "2026-11-05"), false);
});

test("route API applies the delivery-date guard before creating or merging a route", () => {
  const start = edgeSource.indexOf("async function planRun(input: JsonRecord)");
  const end = edgeSource.indexOf("async function assignRun", start);
  const planRun = edgeSource.slice(start, end);
  const guard = planRun.indexOf("isScheduledForDate");
  const createRoute = planRun.indexOf('db.rpc("smart_delivery_plan_run_v1"');
  assert.ok(guard >= 0 && createRoute > guard, "the API must reject past and future orders before invoking the route RPC");
});
