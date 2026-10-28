import test from "node:test";
import assert from "node:assert/strict";
import { cacheInboundMetaMedia } from "./whatsapp-inbound-media-cache-v1.mjs";

function makeDb(existingCache = null) {
  const calls = { uploads: [], upserts: [] };
  return {
    calls,
    storage: {
      from(bucket) {
        return {
          async upload(path, body, options) {
            calls.uploads.push({ bucket, path, body, options });
            return { error: null };
          },
        };
      },
    },
    from(table) {
      return {
        select() {
          return {
            eq() {
              return {
                gt() { return this; },
                async maybeSingle() { return { data: existingCache, error: null }; },
              };
            },
          };
        },
        async upsert(row, options) {
          calls.upserts.push({ table, row, options });
          return { error: null };
        },
      };
    },
  };
}

test("caches an inbound Meta audio message in the private attendance bucket", async () => {
  const db = makeDb();
  const result = await cacheInboundMetaMedia({
    db,
    message: {
      id: "550e8400-e29b-41d4-a716-446655440001",
      direction: "inbound",
      message_type: "audio",
      metadata: { source: "meta", media: { provider_media_id: "meta-media-1", mime_type: "audio/ogg", filename: "voice.ogg" } },
    },
    accessToken: "test-token",
    graphVersion: "v24.0",
    fetchMediaInfo: async () => ({ url: "https://lookaside.fbsbx.com/media", mimeType: "audio/ogg", fileSize: 3 }),
    fetchMediaResponse: async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/ogg" } }),
    now: () => new Date("2026-10-28T12:00:00.000Z"),
  });

  assert.equal(result.mimeType, "audio/ogg");
  assert.equal(result.fileSize, 3);
  assert.equal(db.calls.uploads.length, 1);
  assert.equal(db.calls.uploads[0].bucket, "attendance-media-v1");
  assert.equal(db.calls.upserts[0].row.message_id, "550e8400-e29b-41d4-a716-446655440001");
  assert.equal(db.calls.upserts[0].row.expires_at, "2026-11-27T12:00:00.000Z");
});

test("reuses a live private cache instead of downloading the same media again", async () => {
  const db = makeDb({ object_path: "inbound/550e8400-e29b-41d4-a716-446655440004/voice.ogg" });
  let fetched = false;
  const result = await cacheInboundMetaMedia({
    db,
    message: { id: "550e8400-e29b-41d4-a716-446655440004", direction: "inbound", message_type: "audio", metadata: { source: "meta", media: { provider_media_id: "meta-media-4" } } },
    accessToken: "test-token",
    graphVersion: "v24.0",
    fetchMediaInfo: async () => { fetched = true; },
    fetchMediaResponse: async () => { fetched = true; },
  });
  assert.equal(result.cached, true);
  assert.match(result.path, /^inbound\//);
  assert.equal(fetched, false);
  assert.equal(db.calls.uploads.length, 0);
});

test("does not fetch media without an inbound Meta provider media id", async () => {
  let fetched = false;
  const result = await cacheInboundMetaMedia({
    db: makeDb(),
    message: { id: "550e8400-e29b-41d4-a716-446655440002", direction: "inbound", message_type: "image", metadata: { source: "papoai" } },
    accessToken: "test-token",
    graphVersion: "v24.0",
    fetchMediaInfo: async () => { fetched = true; },
    fetchMediaResponse: async () => { fetched = true; },
  });
  assert.equal(result, null);
  assert.equal(fetched, false);
});

test("rejects media larger than 20 MiB before downloading", async () => {
  const db = makeDb();
  let downloaded = false;
  const result = await cacheInboundMetaMedia({
    db,
    message: { id: "550e8400-e29b-41d4-a716-446655440003", direction: "inbound", message_type: "image", metadata: { source: "meta", media: { provider_media_id: "meta-media-3" } } },
    accessToken: "test-token",
    graphVersion: "v24.0",
    fetchMediaInfo: async () => ({ url: "https://lookaside.fbsbx.com/media", mimeType: "image/jpeg", fileSize: 20 * 1024 * 1024 + 1 }),
    fetchMediaResponse: async () => { downloaded = true; return new Response(); },
  });
  assert.equal(result.error, "media_too_large");
  assert.equal(downloaded, false);
  assert.equal(db.calls.uploads.length, 0);
});
