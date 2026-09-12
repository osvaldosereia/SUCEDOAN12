import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const PROJECT_HOST = "ssbesxgaijknwsjbsbcz.supabase.co";
const FIREBASE_HOST = "cedar-chemist-310801-default-rtdb.firebaseio.com";
const GH_OWNER = "osvaldosereia";
const GH_REPO = "SUCEDOAN12";
const BUCKET = "product-images";
const MODEL = "gpt-image-2.5-sunburst";
const VALIDATOR_MODEL = "gpt-5.6-luna";
const OPENAI_IMAGE_URL = "https://api.openai.com/v1/images/edits";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MIN_FIDELITY = 0.95;
const MIN_COMPOSITION = 0.95;
const MIN_BACKGROUND = 0.95;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const clean = (v: unknown, max = 1000) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const obj = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
const arr = (v: unknown) => Array.isArray(v) ? v : [];
const score = (v: unknown) => Math.max(0, Math.min(1, Number(v || 0)));

class TerminalError extends Error {}

function base64ToBytes(b64: string) {
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  return btoa(binary);
}
function safeName(value: string) {
  return clean(value, 120).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "produto";
}
async function sha256Hex(bytes: Uint8Array) {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Text(value: string) { return sha256Hex(new TextEncoder().encode(value)); }
function allowedSource(raw: string) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && ["raw.githubusercontent.com", PROJECT_HOST, "donaantonia.com.br", "www.donaantonia.com.br"].includes(u.hostname);
  } catch { return false; }
}
function contentTypeFor(url: string, header: string | null) {
  const h = (header || "").split(";", 1)[0].trim().toLowerCase();
  if (["image/png", "image/jpeg", "image/webp"].includes(h)) return h;
  const p = url.toLowerCase();
  if (p.includes(".png")) return "image/png";
  if (p.includes(".jpg") || p.includes(".jpeg")) return "image/jpeg";
  return "image/webp";
}
function imageDimensions(bytes: Uint8Array, type: string) {
  if (type === "image/png" && bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: dv.getUint32(16, false), height: dv.getUint32(20, false) };
  }
  if (type === "image/webp" && bytes.length >= 30 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") {
    const kind = String.fromCharCode(...bytes.subarray(12, 16));
    if (kind === "VP8X") return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
    if (kind === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
    if (kind === "VP8L" && bytes[20] === 0x2f) {
      const b1 = bytes[21], b2 = bytes[22], b3 = bytes[23], b4 = bytes[24];
      return { width: 1 + (((b2 & 0x3f) << 8) | b1), height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)) };
    }
  }
  if (type === "image/jpeg" && bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 8 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1];
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (len < 2) break;
      i += 2 + len;
    }
  }
  return { width: 0, height: 0 };
}
async function fetchImage(url: string) {
  if (!allowedSource(url)) throw new TerminalError("source_host_not_allowed");
  const r = await fetch(url, { headers: { "User-Agent": "DonaAntonia-ProductImageWorker/3.1" }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`source_http_${r.status}`);
  const declared = Number(r.headers.get("content-length") || 0);
  if (declared > 8_000_000) throw new TerminalError("source_too_large");
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length === 0 || bytes.length > 8_000_000) throw new TerminalError("source_size_invalid");
  const type = contentTypeFor(url, r.headers.get("content-type"));
  const dim = imageDimensions(bytes, type);
  return { bytes, type, width: dim.width, height: dim.height, sha256: await sha256Hex(bytes) };
}
function parseRawGithub(raw: string) {
  try {
    const u = new URL(raw);
    if (u.hostname !== "raw.githubusercontent.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 4 || parts[0] !== GH_OWNER || parts[1] !== GH_REPO) return null;
    return { ref: parts[2], path: parts.slice(3).join("/") };
  } catch { return null; }
}
async function immutableGithubImage(rawUrl: string) {
  const parsed = parseRawGithub(rawUrl);
  if (!parsed) return null;
  if (/^[0-9a-f]{40}$/i.test(parsed.ref)) {
    try { return { ...(await fetchImage(rawUrl)), url: rawUrl, recovered: false }; } catch { return null; }
  }
  try {
    const api = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/commits?path=${encodeURIComponent(parsed.path)}&per_page=8`;
    const r = await fetch(api, { headers: { Accept: "application/vnd.github+json", "User-Agent": "DonaAntonia-ProductImageWorker/3.1" }, signal: AbortSignal.timeout(15000) });
    if (r.ok) {
      const commits = arr(await r.json());
      for (const c of commits) {
        const refs = [clean(c?.sha, 80), clean(c?.parents?.[0]?.sha, 80)].filter(Boolean);
        for (const ref of refs) {
          const candidate = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${ref}/${parsed.path}`;
          try { return { ...(await fetchImage(candidate)), url: candidate, recovered: candidate !== rawUrl }; } catch (e) {
            if (!(e instanceof Error) || !String(e.message).startsWith("source_http_404")) throw e;
          }
        }
      }
    }
  } catch (e) {
    if (e instanceof TerminalError) throw e;
  }
  try { return { ...(await fetchImage(rawUrl)), url: rawUrl, recovered: false }; } catch { return null; }
}
async function fetchTrustedCandidate(url: string) {
  const parsed = parseRawGithub(url);
  if (parsed) return immutableGithubImage(url);
  try { return { ...(await fetchImage(url)), url, recovered: false }; } catch (e) {
    if (e instanceof Error && String(e.message).startsWith("source_http_404")) return null;
    throw e;
  }
}
async function fetchFirebaseProduct(firebaseKey: string) {
  if (!firebaseKey) return null;
  const r = await fetch(`https://${FIREBASE_HOST}/produtos/${encodeURIComponent(firebaseKey)}.json`, { headers: { Accept: "application/json", "User-Agent": "DonaAntonia-ProductImageWorker/3.1" }, signal: AbortSignal.timeout(15000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`firebase_http_${r.status}`);
  const data = await r.json().catch(() => null);
  return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, any> : null;
}
function identityMatches(product: any, fb: any) {
  const pGtin = clean(product?.gtin, 40), fGtin = clean(fb?.gtin || fb?.ean, 40);
  if (pGtin && fGtin) return pGtin === fGtin;
  const pSku = clean(product?.sku, 80), fSku = clean(fb?.codigo || fb?.sku, 80);
  if (pSku && fSku) return pSku === fSku;
  return clean(product?.name, 240).toLowerCase() === clean(fb?.nome || fb?.name, 240).toLowerCase();
}
async function resolveTrustedSource(supabaseUrl: string, product: any) {
  const saved = clean(product?.image_source_url, 1800);
  if (saved) {
    const f = await fetchTrustedCandidate(saved);
    if (f) return { ...f, field: "products.image_source_url", origin: f.recovered ? "verified_saved_source_git_history" : (clean(product?.image_source_origin, 120) || "verified_saved_source") };
  }
  const firebaseKey = clean(product?.firebase_key, 180);
  if (firebaseKey) {
    const fb = await fetchFirebaseProduct(firebaseKey);
    if (fb) {
      if (!identityMatches(product, fb)) throw new TerminalError("firebase_identity_mismatch");
      const previous = clean(fb?.imagem_anterior, 1800);
      const current = clean(fb?.imagem || fb?.imagem_url || fb?.url_imagem, 1800);
      if (previous && previous !== current && !/foto-atual-otimizada/i.test(previous)) {
        const f = await fetchTrustedCandidate(previous);
        if (f) return { ...f, field: "firebase.imagem_anterior", origin: f.recovered ? "legacy_firebase_imagem_anterior_git_history" : "legacy_firebase_imagem_anterior" };
      }
    }
  }
  const catalogUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/catalog-products/${product.id}.webp`;
  const catalog = await fetchTrustedCandidate(catalogUrl);
  if (catalog) return { ...catalog, field: "storage.catalog-products", origin: "supabase_catalog_products_original" };
  throw new TerminalError("trusted_source_missing");
}

function promptFor(p: any) {
  const context = [clean(p?.name, 240), clean(p?.brand, 120), clean(p?.packaging, 120), clean(p?.gtin, 40)].filter(Boolean).join(" | ");
  return `Edite a FOTO DE REFERÊNCIA para criar uma foto quadrada profissional de catálogo do MESMO produto. A referência visual é a verdade absoluta; o texto é apenas apoio. Contexto: ${context}. A referência pode conter duas vistas lado a lado: use-as somente para identificar a embalagem e gere UMA única vista limpa, preferencialmente frontal. Preserve exatamente cor predominante da embalagem, cor da tampa, formato, proporções, marca, logotipo, desenho do rótulo, variante, peso/volume, transparências, alças e detalhes. Não troque versão, não redesenhe embalagem e não invente texto, selo, marca, sabor ou cor. Se o texto conflitar com a foto, siga a foto. Fundo uniforme #ECECEC. Produto inteiro e centralizado, sem cortes, ocupando no máximo 78% a 80% da largura ou altura, com margens confortáveis. Sem cenário, mesa, pessoas, preço, decoração ou objetos extras. Iluminação neutra de estúdio e no máximo sombra de contato discreta.`;
}
async function generate(openaiKey: string, source: any, product: any) {
  const form = new FormData();
  form.append("model", MODEL); form.append("prompt", promptFor(product)); form.append("size", "816x816"); form.append("quality", "low"); form.append("output_format", "webp"); form.append("output_compression", "65"); form.append("background", "opaque");
  const ext = source.type === "image/png" ? "png" : source.type === "image/jpeg" ? "jpg" : "webp";
  form.append("image[]", new Blob([source.bytes], { type: source.type }), `referencia.${ext}`);
  const r = await fetch(OPENAI_IMAGE_URL, { method: "POST", headers: { Authorization: `Bearer ${openaiKey}` }, body: form, signal: AbortSignal.timeout(115000) });
  const requestId = r.headers.get("x-request-id") || null;
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`openai_http_${r.status}_${clean(data?.error?.code || data?.error?.message || "error", 160)}`);
  const b64 = clean(data?.data?.[0]?.b64_json, 20_000_000);
  if (!b64) throw new Error("openai_empty_image");
  const bytes = base64ToBytes(b64);
  if (bytes.length === 0 || bytes.length > 800000) throw new Error(`openai_output_size_${bytes.length}`);
  return { bytes, usage: obj(data?.usage), requestId };
}

const validationSchema = { type: "object", additionalProperties: false, properties: {
  pass: { type: "boolean" }, same_product: { type: "boolean" }, packaging_color_match: { type: "boolean" }, shape_match: { type: "boolean" }, label_match: { type: "boolean" },
  source_packaging_primary_color: { type: "string", maxLength: 80 }, candidate_packaging_primary_color: { type: "string", maxLength: 80 }, fidelity_score: { type: "number", minimum: 0, maximum: 1 }, composition_score: { type: "number", minimum: 0, maximum: 1 }, background_score: { type: "number", minimum: 0, maximum: 1 }, critical_issue: { type: "string", maxLength: 240 }
}, required: ["pass","same_product","packaging_color_match","shape_match","label_match","source_packaging_primary_color","candidate_packaging_primary_color","fidelity_score","composition_score","background_score","critical_issue"] };
const sourceAuditSchema = { type: "object", additionalProperties: false, properties: { product_present: { type: "boolean" }, multiple_views: { type: "boolean" }, brand_visible: { type: "string", maxLength: 100 }, packaging_primary_color: { type: "string", maxLength: 80 }, package_shape: { type: "string", maxLength: 120 }, notes: { type: "string", maxLength: 220 } }, required: ["product_present","multiple_views","brand_visible","packaging_primary_color","package_shape","notes"] };
function finalText(data: any) { return arr(data?.output).filter((x: any) => x?.type === "message").flatMap((x: any) => arr(x?.content)).filter((x: any) => x?.type === "output_text").map((x: any) => String(x?.text || "")).join("").trim(); }
async function structuredVision(openaiKey: string, images: Array<{bytes: Uint8Array, type: string}>, instruction: string, schemaName: string, schema: any, maxOutputTokens = 260) {
  const content: any[] = [{ type: "input_text", text: instruction }];
  for (const image of images) content.push({ type: "input_image", image_url: `data:${image.type};base64,${bytesToBase64(image.bytes)}`, detail: "high" });
  const body = { model: VALIDATOR_MODEL, store: false, max_output_tokens: maxOutputTokens, reasoning: { effort: "low" }, input: [{ role: "user", content }], text: { format: { type: "json_schema", name: schemaName, strict: true, schema } } };
  const r = await fetch(OPENAI_RESPONSES_URL, { method: "POST", headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`vision_http_${r.status}_${clean(data?.error?.code || data?.error?.message || "error", 160)}`);
  const text = finalText(data); if (!text) throw new Error("vision_empty_output");
  let parsed: any; try { parsed = JSON.parse(text); } catch { throw new Error("vision_invalid_json"); }
  return { parsed, usage: obj(data?.usage), responseId: clean(data?.id, 180) };
}
async function auditSource(openaiKey: string, source: any) { return structuredVision(openaiKey, [source], "Analise somente esta referência de produto. Ela pode conter duas vistas lado a lado. Identifique a cor predominante real da embalagem, marca, formato e se há múltiplas vistas. Não use conhecimento externo e não adivinhe outra versão.", "product_source_audit", sourceAuditSchema, 220); }
async function validateGenerated(openaiKey: string, source: any, generated: Uint8Array) {
  const r = await structuredVision(openaiKey, [source, { bytes: generated, type: "image/webp" }], "Compare as duas imagens do MESMO produto. A primeira é a referência original, que pode conter duas vistas; a segunda é a imagem gerada e deve mostrar uma única vista. Reprove obrigatoriamente se mudar cor predominante da embalagem, cor da tampa, formato, marca, logotipo, desenho do rótulo ou variante. Reprove troca de versão, embalagem redesenhada, parte removida ou marca alterada. Não penalize a segunda apenas por usar uma única vista. Verifique também produto inteiro, centralizado, margens confortáveis e fundo uniforme #ECECEC.", "product_image_validation_v3", validationSchema, 320);
  const p = r.parsed;
  const validation = { pass: p?.pass === true, same_product: p?.same_product === true, packaging_color_match: p?.packaging_color_match === true, shape_match: p?.shape_match === true, label_match: p?.label_match === true, source_packaging_primary_color: clean(p?.source_packaging_primary_color, 80), candidate_packaging_primary_color: clean(p?.candidate_packaging_primary_color, 80), fidelity_score: score(p?.fidelity_score), composition_score: score(p?.composition_score), background_score: score(p?.background_score), critical_issue: clean(p?.critical_issue, 240) };
  const accepted = validation.pass && validation.same_product && validation.packaging_color_match && validation.shape_match && validation.label_match && validation.fidelity_score >= MIN_FIDELITY && validation.composition_score >= MIN_COMPOSITION && validation.background_score >= MIN_BACKGROUND && !validation.critical_issue;
  return { accepted, validation, usage: r.usage, responseId: r.responseId };
}
async function persistSource(sb: any, product: any, source: any, jobId: string | null) {
  const now = new Date().toISOString();
  const p = await sb.from("products").update({ image_source_url: source.url, image_source_origin: source.origin, image_source_width: source.width || null, image_source_height: source.height || null, image_source_sha256: source.sha256, image_source_verified_at: now }).eq("id", product.id);
  if (p.error) throw new Error(`source_product_update_${clean(p.error.message, 160)}`);
  if (jobId) {
    const aspect = source.width && source.height ? Number((source.width / source.height).toFixed(4)) : null;
    const j = await sb.from("product_image_jobs").update({ source_original_url: source.url, source_origin: source.origin, source_used_url: source.url, source_field: source.field, source_width: source.width || null, source_height: source.height || null, source_aspect_ratio: aspect, source_sha256: source.sha256, updated_at: now }).eq("id", jobId);
    if (j.error) throw new Error(`source_job_update_${clean(j.error.message, 160)}`);
  }
}
async function uploadResult(sb: any, folder: string, product: any, bytes: Uint8Array) {
  const path = `${folder}/${product.id}/${Date.now()}-${safeName(product.name)}.webp`;
  const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (up.error) throw new Error(`storage_${clean(up.error.message, 160)}`);
  return { path, publicUrl: sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}
async function processProduct(sb: any, supabaseUrl: string, openaiKey: string, product: any, dryRun: boolean, jobId: string | null) {
  const source = await resolveTrustedSource(supabaseUrl, product);
  await persistSource(sb, product, source, jobId);
  const generated = await generate(openaiKey, source, product);
  const checked = await validateGenerated(openaiKey, source, generated.bytes);
  if (jobId) {
    const u = await sb.from("product_image_jobs").update({ model: MODEL, openai_usage: generated.usage, validation: checked.validation, validation_usage: checked.usage, updated_at: new Date().toISOString() }).eq("id", jobId);
    if (u.error) throw new Error(`job_usage_update_${clean(u.error.message, 160)}`);
  }
  if (!checked.accepted) {
    const rejected = await uploadResult(sb, "openai/v3/rejected", product, generated.bytes);
    const now = new Date().toISOString();
    if (jobId) await sb.from("product_image_jobs").update({ status: "rejected", output_storage_path: rejected.path, output_url: rejected.publicUrl, error_message: `visual_validation_rejected:${checked.validation.critical_issue || "identity_mismatch"}`, processed_at: now, updated_at: now }).eq("id", jobId);
    await sb.from("products").update({ image_ai_status: "rejected", image_ai_error: checked.validation.critical_issue || "visual_validation_rejected", image_ai_model: MODEL, image_ai_validation: checked.validation, image_ai_attempts: Number(product.image_ai_attempts || 0) + 1, updated_at: now }).eq("id", product.id);
    return { accepted: false, product_id: product.id, name: product.name, source_url: source.url, source_field: source.field, source_origin: source.origin, source_width: source.width, source_height: source.height, source_sha256: source.sha256, rejected_url: rejected.publicUrl, validation: checked.validation, usage: generated.usage, validation_usage: checked.usage, dry_run: dryRun };
  }
  const stored = await uploadResult(sb, dryRun ? "openai/v3/previews" : "openai/v3/final", product, generated.bytes);
  if (!dryRun) {
    const now = new Date().toISOString();
    const p = await sb.from("products").update({ image_original_url: source.url, image_ai_url: stored.publicUrl, image_url: stored.publicUrl, image_ai_status: "completed", image_ai_model: MODEL, image_ai_processed_at: now, image_ai_attempts: Number(product.image_ai_attempts || 0) + 1, image_ai_error: null, image_ai_validation: checked.validation, updated_at: now }).eq("id", product.id);
    if (p.error) throw new Error(`product_update_${clean(p.error.message, 160)}`);
    if (jobId) {
      const j = await sb.from("product_image_jobs").update({ status: "completed", output_storage_path: stored.path, output_url: stored.publicUrl, error_message: null, processed_at: now, updated_at: now }).eq("id", jobId);
      if (j.error) throw new Error(`job_update_${clean(j.error.message, 160)}`);
    }
  }
  return { accepted: true, product_id: product.id, name: product.name, source_url: source.url, source_field: source.field, source_origin: source.origin, source_width: source.width, source_height: source.height, source_sha256: source.sha256, output_url: stored.publicUrl, output_bytes: generated.bytes.length, model: MODEL, quality: "low", size: "816x816", request_id: generated.requestId, usage: generated.usage, validator_model: VALIDATOR_MODEL, validation: checked.validation, validation_usage: checked.usage, validation_response_id: checked.responseId, dry_run: dryRun };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "", serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "server_config" }, 500);
  const parsed = new URL(supabaseUrl); if (parsed.protocol !== "https:" || parsed.hostname !== PROJECT_HOST) return json({ ok: false, error: "unexpected_project" }, 500);
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const supplied = req.headers.get("x-da-product-image-key") || ""; if (!supplied) return json({ ok: false, error: "unauthorized" }, 401);
  const secretRow = await sb.from("system_secrets").select("key_hash,is_active").eq("key_name", "product_image_worker_webhook_v1").maybeSingle();
  if (secretRow.error || !secretRow.data?.is_active || (await sha256Text(supplied)) !== secretRow.data.key_hash) return json({ ok: false, error: "unauthorized" }, 401);
  let openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!openaiKey) { try { const k = await sb.rpc("get_conversation_worker_provider_secret_v1"); if (typeof k.data === "string") openaiKey = k.data; } catch {} }
  let body: any = {}; try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  if (body?.event === "healthcheck") return json({ ok: true, event: "healthcheck", provider_configured: Boolean(openaiKey), model: MODEL, validator_model: VALIDATOR_MODEL, source_policy: "saved verified > firebase.imagem_anterior (immutable Git history) > storage.catalog-products; never current optimized image", historical_recovery: true, bucket: BUCKET });
  if (!openaiKey) return json({ ok: false, error: "openai_key_missing" }, 500);
  const selectProduct = async (productId: string) => sb.from("products").select("id,name,brand,packaging,gtin,sku,firebase_key,image_url,image_original_url,image_source_url,image_source_origin,image_ai_attempts").eq("id", productId).maybeSingle();
  if (body?.event === "inspect_source" || body?.event === "test_product") {
    const productId = clean(body?.product_id, 80); if (!productId) return json({ ok: false, error: "product_id_required" }, 400);
    const q = await selectProduct(productId); if (q.error || !q.data) return json({ ok: false, error: "product_not_found" }, 404);
    try {
      if (body.event === "inspect_source") {
        const source = await resolveTrustedSource(supabaseUrl, q.data); await persistSource(sb, q.data, source, null); const audit = await auditSource(openaiKey, source);
        return json({ ok: true, event: "inspect_source", product_id: productId, name: q.data.name, source_url: source.url, source_field: source.field, source_origin: source.origin, width: source.width, height: source.height, sha256: source.sha256, audit: audit.parsed, audit_usage: audit.usage });
      }
      return json({ ok: true, event: "test_product", result: await processProduct(sb, supabaseUrl, openaiKey, q.data, true, null) });
    } catch (e) { return json({ ok: false, event: body.event, error: clean(e instanceof Error ? e.message : e, 300) }, e instanceof TerminalError ? 422 : 500); }
  }
  if (body?.event !== "drain") return json({ ok: false, error: "unknown_event" }, 400);
  const limit = Math.max(1, Math.min(3, Number(body?.limit || 1)));
  await sb.rpc("enqueue_product_image_jobs_v2", { p_limit: Math.max(12, limit * 4) });
  const claimed = await sb.rpc("claim_product_image_jobs_v2", { p_limit: limit });
  if (claimed.error) return json({ ok: false, error: "claim_failed", detail: clean(claimed.error.message, 180) }, 500);
  const results: any[] = [];
  for (const job of arr(claimed.data)) {
    const jobId = clean(job?.id, 80), productId = clean(job?.product_id, 80);
    try {
      const q = await selectProduct(productId); if (q.error || !q.data) throw new TerminalError("product_not_found");
      await sb.from("products").update({ image_ai_status: "processing", image_ai_error: null }).eq("id", productId);
      results.push({ ok: true, ...(await processProduct(sb, supabaseUrl, openaiKey, q.data, false, jobId)) });
    } catch (e) {
      const message = clean(e instanceof Error ? e.message : e, 300), now = new Date().toISOString(), terminal = e instanceof TerminalError;
      if (jobId) await sb.from("product_image_jobs").update({ status: terminal ? "rejected" : "error", error_message: message, processed_at: terminal ? now : null, updated_at: now }).eq("id", jobId);
      if (productId) await sb.from("products").update({ image_ai_status: terminal ? "source_rejected" : "error", image_ai_error: message, updated_at: now }).eq("id", productId);
      results.push({ ok: false, terminal, product_id: productId, error: message });
    }
  }
  return json({ ok: true, event: "drain", processed: results.length, succeeded: results.filter(x => x.ok && x.accepted !== false).length, rejected: results.filter(x => x.accepted === false || x.terminal).length, failed: results.filter(x => !x.ok && !x.terminal).length, model: MODEL, validator_model: VALIDATOR_MODEL, results });
});