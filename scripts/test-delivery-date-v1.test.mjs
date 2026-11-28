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

test("assignment blocks overdue orders and Sundays before invoking a route mutation", () => {
  const start = edgeSource.indexOf("async function assignOrder(input: JsonRecord)");
  const end = edgeSource.indexOf("async function adminReleaseStop", start);
  const assignOrder = edgeSource.slice(start, end);
  const pastDate = assignOrder.indexOf("if (serviceDate < today)");
  const sunday = assignOrder.indexOf("delivery_not_available_sunday");
  const firstMutation = assignOrder.indexOf("await db.rpc(");
  assert.ok(pastDate >= 0 && sunday >= 0 && firstMutation > pastDate && firstMutation > sunday);
});
