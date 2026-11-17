import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { Image } from "jsr:@matmen/imagescript@3.20.3";


const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const DONA_ADMIN_CODE = (Deno.env.get("DONA_ADMIN_CODE") || "").trim();
const BUCKET = "daily-offer-status";
const TABLE = "da_offer_status_images_v1";
const MAX_IMAGE_BYTES = 100_000;
const LOGO_URL = "https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/main/img/logoantonia5.png";
const FONT_URL = "https://raw.githubusercontent.com/google/fonts/7af0d90b4d532ffa4b041937b560c6df4e7b1e95/ofl/roboto/Roboto%5Bwdth%2Cwght%5D.ttf";
const ALLOWED_IMAGE_HOSTS = new Set(["raw.githubusercontent.com", "ssbesxgaijknwsjbsbcz.supabase.co"]);
const ALLOWED_ORIGINS = new Set(["https://donaantonia.com.br", "https://www.donaantonia.com.br"]);
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://donaantonia.com.br",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-admin-code, x-da-offer-cron-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function secureEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let i = 0; i < length; i++) mismatch |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return mismatch === 0;
}

function verifyAdminCode(supplied: string | null) {
  if (DONA_ADMIN_CODE.length < 13 || DONA_ADMIN_CODE.length > 128) return "not_configured";
  if (typeof supplied !== "string" || supplied.length !== DONA_ADMIN_CODE.length) return "invalid";
  let mismatch = 0;
  for (let i = 0; i < DONA_ADMIN_CODE.length; i++) mismatch |= DONA_ADMIN_CODE.charCodeAt(i) ^ supplied.charCodeAt(i);
  return mismatch === 0 ? "valid" : "invalid";
}

function todayInCuiaba() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Cuiaba", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

function safeText(value: unknown, limit = 300) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function xmlText(value: unknown) {
  return safeText(value, 240).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function wrapName(value: unknown, maxChars = 21, maxLines = 4) {
  const words = safeText(value, 240).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? current + " " + word : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else current = next;
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/[.…]*$/, "") + "…";
  }
  return lines;
}

async function fetchImage(urlValue: unknown) {
  const url = new URL(String(urlValue || ""));
  if (url.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("Uma imagem de produto está fora das origens permitidas.");
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Foto indisponível (HTTP " + response.status + ").");
  const finalUrl = new URL(response.url || url.toString());
  if (finalUrl.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(finalUrl.hostname.toLowerCase())) {
    throw new Error("A origem de uma foto foi redirecionada para um endereço não permitido.");
  }
  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) {
    throw new Error("Uma foto de produto não está em PNG, JPEG ou WebP.");
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > 8 * 1024 * 1024) throw new Error("Uma foto de produto ultrapassa o limite de 8 MB.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("Uma foto de produto está vazia ou é grande demais.");
  return bytes;
}

async function fetchFont() {
  const url = new URL(FONT_URL);
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "raw.githubusercontent.com") {
    throw new Error("A origem da fonte de texto não é permitida.");
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("A fonte de texto está indisponível (HTTP " + response.status + ").");
  const finalUrl = new URL(response.url || url.toString());
  if (finalUrl.protocol !== "https:" || finalUrl.hostname.toLowerCase() !== "raw.githubusercontent.com") {
    throw new Error("A origem da fonte foi redirecionada para um endereço não permitido.");
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > 2 * 1024 * 1024) throw new Error("A fonte de texto ultrapassa o limite de 2 MB.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new Error("A fonte de texto está vazia ou é grande demais.");
  return bytes;
}


async function encodeCompactJpeg(image: Image) {
  const candidates = [
    { width: 720, quality: 54 },
    { width: 600, quality: 48 },
    { width: 480, quality: 40 },
  ];
  for (const candidate of candidates) {
    const resized = image.clone().resize({ width: candidate.width });
    const bytes = await resized.encodeJPEG({ quality: candidate.quality });
    if (bytes.byteLength <= MAX_IMAGE_BYTES) return bytes;
  }
  throw new Error("Uma montagem ultrapassou 100 KB mesmo após a compressão.");
}

async function renderOfferStory(products: any[], logoBytes: Uint8Array, fontBytes: Uint8Array, date: string) {

  const imageBytes = await Promise.all(products.map(async (product) => {
    try {
      return await fetchImage(product.image_url);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "não foi possível baixar a foto";
      throw new Error("Foto de " + safeText(product.name, 100) + ": " + safeText(detail, 180));
    }
  }));
  const images: Record<string, Uint8Array> = { "brand.png": logoBytes };
  const cards = products.map((product, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 34 + column * 506;
    const y = 262 + row * 432;
    const original = Number(product.price || 0);
    const offer = Number(product.offer_price || 0);
    const discount = Math.max(0, Math.round(Number(product.discount_percent || (original > 0 ? (1 - offer / original) * 100 : 0))));
    const imageKey = "product-" + index + ".img";
    images[imageKey] = imageBytes[index];
    const nameLines = wrapName(product.name, 16, 4);
    const nameSvg = nameLines.map((line, lineIndex) =>
      '<text x="' + (x + 265) + '" y="' + (y + 137 + lineIndex * 32) + '" font-family="Roboto, Arial, sans-serif" font-size="23" font-weight="700" fill="#302820">' + xmlText(line) + "</text>"
    ).join("");
    return '<g><rect x="' + x + '" y="' + y + '" width="492" height="410" rx="24" fill="#fffdf9" stroke="#e7d7c5" stroke-width="3"/>'
      + '<rect x="' + (x + 20) + '" y="' + (y + 20) + '" width="142" height="42" rx="12" fill="#c9382f"/>'
      + '<text x="' + (x + 91) + '" y="' + (y + 49) + '" text-anchor="middle" font-family="Roboto, Arial, sans-serif" font-size="22" font-weight="800" fill="#ffffff">OFERTA ' + discount + '%</text>'
      + '<rect x="' + (x + 19) + '" y="' + (y + 72) + '" width="244" height="282" rx="20" fill="#f5f0e9"/>'
      + '<image href="' + imageKey + '" x="' + (x + 27) + '" y="' + (y + 82) + '" width="228" height="262" preserveAspectRatio="xMidYMid meet"/>'
      + nameSvg
      + '<text x="' + (x + 265) + '" y="' + (y + 310) + '" font-family="Roboto, Arial, sans-serif" font-size="20" fill="#796e63">De ' + xmlText(money(original)) + '</text>'
      + '<line x1="' + (x + 265) + '" y1="' + (y + 302) + '" x2="' + (x + 475) + '" y2="' + (y + 302) + '" stroke="#c9382f" stroke-width="3"/>'
      + '<text x="' + (x + 265) + '" y="' + (y + 362) + '" font-family="Roboto, Arial, sans-serif" font-size="29" font-weight="800" fill="#842f28">Por ' + xmlText(money(offer)) + "</text></g>";
  }).join("");
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Cuiaba", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(new Date(date + "T12:00:00-04:00"));
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">',
    '<rect width="1080" height="1920" fill="#f4eee5"/>',
    '<image href="brand.png" x="270" y="14" width="540" height="118" preserveAspectRatio="xMidYMid meet"/>',
    '<text x="540" y="160" text-anchor="middle" font-family="Roboto, Arial, sans-serif" font-size="52" font-weight="800" fill="#7e3029">OFERTAS DO DIA</text>',
    '<text x="540" y="205" text-anchor="middle" font-family="Roboto, Arial, sans-serif" font-size="23" fill="#71665b">' + xmlText(dateLabel) + '</text>',
    cards,
    '<rect x="34" y="1604" width="1012" height="260" rx="28" fill="#7e3029"/>',
    '<text x="540" y="1680" text-anchor="middle" font-family="Roboto, Arial, sans-serif" font-size="40" font-weight="800" fill="#ffffff">Pedidos a partir de R$ 75</text>',
    '<text x="540" y="1733" text-anchor="middle" font-family="Roboto, Arial, sans-serif" font-size="32" font-weight="700" fill="#ffffff">com entrega grátis</text>',
    '<text x="540" y="1812" text-anchor="middle" font-family="Roboto, Arial, sans-serif" font-size="30" font-weight="700" fill="#ffffff">WhatsApp 65 99815-0975</text>',
    "</svg>",
  ].join("");
  const image = await Image.renderSVG(svg, { images, fonts: [fontBytes] });
  return await encodeCompactJpeg(image);
}

async function getRow(date: string) {
  const { data, error } = await db.from(TABLE).select("*").eq("offer_date", date).maybeSingle();
  if (error) throw error;
  return data;
}

async function responseFor(date: string, row: any) {
  const storedImages = Array.isArray(row?.image_paths) ? row.image_paths : [];
  const images = await Promise.all(storedImages.map(async (entry: any, index: number) => {
    const path = typeof entry === "string" ? entry : safeText(entry?.path || "", 300);
    const sizeBytes = typeof entry === "object" && entry !== null ? Number(entry.size_bytes || 0) : 0;
    const imageNumber = index + 1;
    const fileName = "Ofertas-Dona-Antonia-" + date + "-" + String(imageNumber).padStart(2, "0") + ".jpg";
    const withinLimit = path.toLowerCase().endsWith(".jpg") && sizeBytes > 0 && sizeBytes <= MAX_IMAGE_BYTES;
    let downloadUrl = "";
    if (row?.status === "ready" && withinLimit) {
      const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 3600, { download: fileName });
      if (!error) downloadUrl = String(data?.signedUrl || "");
    }
    return {
      number: imageNumber, file_name: fileName, size_bytes: sizeBytes,
      size_kb: Math.round(sizeBytes / 1024 * 10) / 10,
      download_url: downloadUrl, within_limit: withinLimit && Boolean(downloadUrl),
    };
  }));
  const needsRegeneration = row?.status === "ready" && (
    images.length !== Number(row?.image_count || 0) || images.some((image) => !image.within_limit)
  );
  return {
    ok: true, date, status: String(row?.status || "pending"),
    product_count: Number(row?.product_count || 0), image_count: Number(row?.image_count || 0),
    unpictured_count: Number(row?.unpictured_count || 0), generated_at: row?.generated_at || null,
    error_message: safeText(row?.error_message || "", 500),
    images, needs_regeneration: needsRegeneration, max_image_bytes: MAX_IMAGE_BYTES,
  };
}

async function statusToday() {
  const date = todayInCuiaba();
  return responseFor(date, await getRow(date));
}

async function generatePage(input: any) {
  const date = safeText(input?.date, 10);
  const pageNumber = Number(input?.page_number || 0);
  const products = Array.isArray(input?.products) ? input.products : [];
  if (date !== todayInCuiaba() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("A data da montagem não é válida.");
  }
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 8 || products.length !== 6) {
    throw new Error("A montagem deve conter uma página com seis produtos.");
  }

  const [logoBytes, fontBytes] = await Promise.all([fetchImage(LOGO_URL), fetchFont()]);
  const jpeg = await renderOfferStory(products, logoBytes, fontBytes, date);
  if (!jpeg.byteLength || jpeg.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("A montagem excedeu o limite de 100 KB.");
  }

  const imageNumber = String(pageNumber).padStart(2, "0");
  const path = date + "/ofertas-" + imageNumber + ".jpg";
  const { error } = await db.storage.from(BUCKET).upload(path, jpeg, {
    contentType: "image/jpeg",
    upsert: true,
    cacheControl: "3600",
  });
  if (error) throw error;
  return { ok: true, image: { number: pageNumber, path, size_bytes: jpeg.byteLength } };
}

async function generateToday() {
  const { data: snapshot, error: snapshotError } = await db.rpc("da_offer_rotation_admin_v1", {
    p_action: "get", p_payload: {},
  });
  if (snapshotError) throw snapshotError;
  const date = String(snapshot?.config?.today || todayInCuiaba());
  const rawOffers = Array.isArray(snapshot?.offers) ? snapshot.offers : [];
  const offers = rawOffers.filter((product: any) =>
    product && product.id && product.name && product.image_url
      && Number(product.price) > 0 && Number(product.offer_price) > 0
      && Number(product.offer_price) < Number(product.price)
  );
  const pageCount = Math.min(8, Math.floor(offers.length / 6));
  const unpictured = Math.max(0, rawOffers.length - pageCount * 6);

  const existing = await getRow(date);
  const oldImagePaths = Array.isArray(existing?.image_paths)
    ? existing.image_paths.map((entry: any) => typeof entry === "string" ? entry : safeText(entry?.path || "", 300))
    : [];
  const oldPaths = [...oldImagePaths, existing?.zip_path]
    .filter((path): path is string => typeof path === "string" && path.length > 0);
  if (oldPaths.length) await db.storage.from(BUCKET).remove(oldPaths);

  if (!offers.length) {
    const row = {
      offer_date: date, status: "empty", product_count: 0, image_count: 0,
      unpictured_count: 0, image_paths: [], zip_path: null, generated_at: null,
      error_message: snapshot?.config?.enabled === false ? "A rotação diária está pausada." : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from(TABLE).upsert(row, { onConflict: "offer_date" });
    if (error) throw error;
    return responseFor(date, row);
  }

  if (pageCount === 0) {
    const row = {
      offer_date: date, status: "failed", product_count: offers.length, image_count: 0,
      unpictured_count: offers.length, image_paths: [], zip_path: null, generated_at: null,
      error_message: "Ainda não há seis ofertas com foto para montar a primeira imagem.",
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from(TABLE).upsert(row, { onConflict: "offer_date" });
    if (error) throw error;
    return responseFor(date, row);
  }

  const startingRow = {
    offer_date: date, status: "generating", product_count: offers.length, image_count: 0,
    unpictured_count: unpictured, image_paths: [], zip_path: null, generated_at: null,
    error_message: null, updated_at: new Date().toISOString(),
  };
  const { error: startError } = await db.from(TABLE).upsert(startingRow, { onConflict: "offer_date" });
  if (startError) throw startError;

  const uploadedPaths: string[] = [];
  try {
    const groups = Array.from({ length: pageCount }, (_, page) => offers.slice(page * 6, page * 6 + 6));
    const imageEntries: Array<{ path: string; size_bytes: number }> = [];
    const workerErrors: string[] = [];
    const workerUrl = SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/daily-offer-status-images-v1";

    for (let offset = 0; offset < groups.length; offset += 4) {
      const batch = groups.slice(offset, offset + 4);
      const settled = await Promise.allSettled(batch.map(async (group, batchIndex) => {
        const pageNumber = offset + batchIndex + 1;
        const response = await fetch(workerUrl, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + SERVICE_ROLE_KEY,
            apikey: SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "generate_page",
            date,
            page_number: pageNumber,
            products: group,
          }),
          signal: AbortSignal.timeout(90000),
        });
        const bodyText = await response.text();
        let result: any = {};
        try {
          result = bodyText ? JSON.parse(bodyText) : {};
        } catch {
          result = {};
        }
        if (!response.ok || result?.ok !== true || !result?.image?.path) {
          throw new Error("Imagem " + pageNumber + ": " + safeText(result?.message || result?.error || ("HTTP " + response.status), 240));
        }
        const sizeBytes = Number(result.image.size_bytes || 0);
        if (sizeBytes < 1 || sizeBytes > MAX_IMAGE_BYTES) {
          throw new Error("Imagem " + pageNumber + " fora do limite de 100 KB.");
        }
        return { number: pageNumber, path: safeText(result.image.path, 300), size_bytes: sizeBytes };
      }));

      for (const result of settled) {
        if (result.status === "fulfilled") {
          uploadedPaths.push(result.value.path);
          imageEntries.push({ path: result.value.path, size_bytes: result.value.size_bytes });
        } else {
          const reason = result.reason instanceof Error ? result.reason.message : "Falha ao renderizar uma imagem.";
          workerErrors.push(safeText(reason, 300));
        }
      }
    }

    if (workerErrors.length) throw new Error(workerErrors.join("; "));
    imageEntries.sort((a, b) => a.path.localeCompare(b.path));
    const row = {
      offer_date: date, status: "ready", product_count: offers.length, image_count: imageEntries.length,
      unpictured_count: unpictured, image_paths: imageEntries,
      zip_path: null, generated_at: new Date().toISOString(), error_message: null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from(TABLE).upsert(row, { onConflict: "offer_date" });
    if (error) throw error;
    return responseFor(date, row);
  } catch (error) {
    if (uploadedPaths.length) await db.storage.from(BUCKET).remove(uploadedPaths).catch(() => undefined);
    const failedRow = {
      offer_date: date, status: "failed", product_count: offers.length, image_count: 0,
      unpictured_count: unpictured, image_paths: [], zip_path: null, generated_at: null,
      error_message: safeText(error instanceof Error ? error.message : "Falha ao gerar as imagens.", 500),
      updated_at: new Date().toISOString(),
    };
    await db.from(TABLE).upsert(failedRow, { onConflict: "offer_date" });
    return responseFor(date, failedRow);
  }
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, { ok: false, error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, { ok: false, error: "server_config" }, 500);
  const origin = req.headers.get("origin") || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(req, { ok: false, error: "origin_not_allowed" }, 403);

  const authorization = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const apiKey = req.headers.get("apikey") || "";
  const serviceAuthorized = secureEqual(authorization, SERVICE_ROLE_KEY) || secureEqual(apiKey, SERVICE_ROLE_KEY);
  const adminStatus = verifyAdminCode(req.headers.get("x-admin-code"));
  let cronAuthorized = false;
  if (!serviceAuthorized) {
    const token = req.headers.get("x-da-offer-cron-key") || "";
    if (token) {
      const { data, error } = await db.rpc("da_offer_status_images_cron_authorized_v1", { p_token: token });
      cronAuthorized = !error && data === true;
    }
  }
  if (!serviceAuthorized && !cronAuthorized && adminStatus !== "valid") {
    const status = adminStatus === "not_configured" ? 503 : 401;
    return json(req, { ok: false, error: adminStatus === "not_configured" ? "admin_auth_not_configured" : "unauthorized" }, status);
  }

  try {
    const input = await req.json();
    const action = safeText(input?.action || "status", 20).toLowerCase();
    if (action === "status") return json(req, await statusToday());
    if (action === "generate_page") {
      if (!serviceAuthorized) return json(req, { ok: false, error: "service_role_required" }, 403);
      return json(req, await generatePage(input));
    }
    if (action === "generate") return json(req, await generateToday());
    return json(req, { ok: false, error: "invalid_action" }, 400);
  } catch (error) {
    return json(req, {
      ok: false,
      error: "daily_offer_image_request_failed",
      message: safeText(error instanceof Error ? error.message : "Não foi possível processar as imagens.", 500),
    }, 500);
  }
});

