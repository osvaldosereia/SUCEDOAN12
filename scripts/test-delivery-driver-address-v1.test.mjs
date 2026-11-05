import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const capture = await import("../supabase/functions/_shared/delivery-driver-address-v1.mjs").catch(() => ({}));

test("driver GPS capture accepts valid primary coordinates and normalizes numeric values", () => {
  assert.equal(typeof capture.normalizeDriverLocationInput, "function");
  assert.deepEqual(capture.normalizeDriverLocationInput({
    latitude: "-15.6014",
    longitude: "-56.0979",
    accuracy_m: "12.5",
    mode: "primary",
  }), {
    latitude: -15.6014,
    longitude: -56.0979,
    accuracy_m: 12.5,
    mode: "primary",
    label: "",
  });
});

test("driver GPS capture rejects missing, out-of-range, and zero coordinates", () => {
  assert.throws(() => capture.normalizeDriverLocationInput({ latitude: "", longitude: -56, accuracy_m: 10, mode: "primary" }), /invalid_location_coordinates/);
  assert.throws(() => capture.normalizeDriverLocationInput({ latitude: 91, longitude: -56, accuracy_m: 10, mode: "primary" }), /invalid_location_coordinates/);
  assert.throws(() => capture.normalizeDriverLocationInput({ latitude: 0, longitude: 0, accuracy_m: 10, mode: "primary" }), /invalid_location_coordinates/);
});

test("alternate GPS point requires a short label and trims unsafe control characters", () => {
  assert.throws(() => capture.normalizeDriverLocationInput({ latitude: -15, longitude: -56, accuracy_m: 20, mode: "alternate" }), /alternate_location_label_required/);
  assert.deepEqual(capture.normalizeDriverLocationInput({ latitude: -15, longitude: -56, accuracy_m: 20, mode: "alternate", label: "  Portão\n lateral  " }), {
    latitude: -15,
    longitude: -56,
    accuracy_m: 20,
    mode: "alternate",
    label: "Portão lateral",
  });
});

test("facade photo validation accepts supported images up to the private bucket limit", () => {
  assert.equal(typeof capture.validateAddressPhoto, "function");
  assert.deepEqual(capture.validateAddressPhoto({ type: "image/jpeg", size: 4 * 1024 * 1024 }), {
    contentType: "image/jpeg",
    extension: "jpg",
    sizeBytes: 4 * 1024 * 1024,
  });
  assert.throws(() => capture.validateAddressPhoto({ type: "image/jpeg", size: 5 * 1024 * 1024 + 1 }), /address_photo_too_large/);
  assert.throws(() => capture.validateAddressPhoto({ type: "image/svg+xml", size: 1000 }), /address_photo_type_invalid/);
});

test("driver address capture controls exist in the mobile portal markup", async () => {
  const [script, html] = await Promise.all([
    readFile(new URL("../site/entregador/driver.js", import.meta.url), "utf8"),
    readFile(new URL("../site/entregador/index.html", import.meta.url), "utf8"),
  ]);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const referenced = new Set([...script.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]));
  for (const id of referenced) assert.ok(ids.has(id), `missing driver portal element #${id}`);
  assert.match(html, /capture="environment"/);
  assert.match(html, /id="driver-address-dialog"/);
  assert.match(script, /driver_save_location/);
  assert.match(script, /driver_upload_address_photo/);
});

test("driver-only address RPCs and private photo metadata are restricted to the server role", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20261105170000_delivery_driver_address_photo_v1.sql", import.meta.url), "utf8");
  const edge = await readFile(new URL("../supabase/functions/delivery-ops-v1/index.ts", import.meta.url), "utf8");
  assert.match(migration, /grant execute on function public\.smart_delivery_driver_save_location_v1[\s\S]*?to service_role/i);
  assert.match(migration, /grant execute on function public\.smart_delivery_driver_select_location_v1[\s\S]*?to service_role/i);
  assert.match(migration, /enable row level security[\s\S]*?customer_address_reference_photos_v1/i);
  assert.match(edge, /"driver_upload_address_photo"/);
  assert.match(edge, /"delivery-proof-v1"\)\.upload/);
});
