const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const CACHE_DAYS = 30;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/amr", "audio/wav", "audio/x-wav",
  "video/mp4", "video/3gpp", "text/plain",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip", "application/octet-stream",
]);

function safeFilename(value, fallback) {
  const filename = String(value || "")
    .replace(/[\\/\u0000-\u001f\u007f]/g, "_")
    .replace(/\.\.+/g, ".")
    .trim()
    .slice(0, 180);
  return filename || fallback;
}

async function readBounded(response, maxBytes) {
  if (response.body) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        total += part.value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          return { error: "media_too_large", status: 413 };
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { bytes };
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.byteLength > maxBytes ? { error: "media_too_large", status: 413 } : { bytes };
}

export async function cacheInboundMetaMedia({
  db,
  message,
  accessToken,
  graphVersion,
  fetchMediaInfo,
  fetchMediaResponse,
  now = () => new Date(),
  maxBytes = MAX_MEDIA_BYTES,
  allowedMimeTypes = ALLOWED_MIME_TYPES,
} = {}) {
  const metadata = message?.metadata && typeof message.metadata === "object" ? message.metadata : {};
  const media = metadata.media && typeof metadata.media === "object" ? metadata.media : {};
  const source = String(metadata.source || media.source || "").trim().toLowerCase();
  const mediaId = String(media.provider_media_id || metadata.provider_media_id || "").trim();
  const messageId = String(message?.id || "");
  if (message?.direction !== "inbound" || source !== "meta" || !mediaId) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId)) {
    return { error: "invalid_message_id", status: 400 };
  }
  if (!db || !accessToken || !/^v\d+\.\d+$/.test(String(graphVersion || ""))
    || typeof fetchMediaInfo !== "function" || typeof fetchMediaResponse !== "function") {
    return { error: "media_retrieval_failed", status: 503 };
  }

  try {
    const cacheTime = now();
    const cachedResult = await db.from("attendance_media_cache_v1")
      .select("object_path,mime_type,filename")
      .eq("message_id", messageId)
      .gt("expires_at", cacheTime.toISOString())
      .maybeSingle();
    if (cachedResult.error) throw cachedResult.error;
    if (cachedResult.data?.object_path) return {
      cached: true,
      path: cachedResult.data.object_path,
      mimeType: cachedResult.data.mime_type,
      filename: cachedResult.data.filename,
    };

    const info = await fetchMediaInfo({ accessToken, graphVersion, mediaId });
    const infoMime = String(info?.mimeType || media.mime_type || "").split(";", 1)[0].trim().toLowerCase();
    const expectedSize = Number(info?.fileSize ?? media.size_bytes ?? 0);
    if (Number.isFinite(expectedSize) && expectedSize > maxBytes) return { error: "media_too_large", status: 413 };
    if (!info?.url) return { error: "media_retrieval_failed", status: 503 };

    const response = await fetchMediaResponse({ accessToken, url: info.url });
    const responseMime = String(response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
    const mimeType = allowedMimeTypes.has(infoMime) ? infoMime : responseMime;
    if (!allowedMimeTypes.has(mimeType) || (responseMime && !allowedMimeTypes.has(responseMime))) {
      return { error: "media_type_not_allowed", status: 415 };
    }
    const bounded = await readBounded(response, maxBytes);
    if (bounded.error) return bounded;
    if (!bounded.bytes.byteLength) return { error: "media_empty", status: 422 };

    const messageType = String(message.message_type || "media").replace(/[^a-z0-9_-]/gi, "").slice(0, 20) || "media";
    const filename = safeFilename(media.filename || media.file_name, `whatsapp-${messageType}-${messageId}`);
    const path = `inbound/${messageId}/${filename}`;
    const upload = await db.storage.from("attendance-media-v1").upload(path, new Blob([bounded.bytes], { type: mimeType }), {
      contentType: mimeType,
      upsert: true,
    });
    if (upload.error) throw upload.error;

    const expiresAt = new Date(cacheTime.getTime() + CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const cached = await db.from("attendance_media_cache_v1").upsert({
      message_id: messageId,
      object_path: path,
      mime_type: mimeType,
      filename,
      expires_at: expiresAt,
    }, { onConflict: "message_id" });
    if (cached.error) throw cached.error;
    return { path, mimeType, filename, fileSize: bounded.bytes.byteLength };
  } catch {
    return { error: "media_retrieval_failed", status: 503 };
  }
}
