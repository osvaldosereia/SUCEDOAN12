import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import {
  ANALYSIS_MODEL,
  ESCALATION_MODEL,
  IMAGE_MODEL,
  ANALYSIS_SCHEMA,
  buildAnalysisPrompt,
  normalizeAnalysis,
  shouldEscalate,
  buildImagePrompts,
} from "./core.mjs";

const RESPONSES_URL = "https://api.openai.com/v1/responses";
const IMAGE_EDIT_URL = "https://api.openai.com/v1/images/edits";
const BUCKET = "product-images";
const MAX_UPLOAD = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_KINDS = new Set(["principal", "ambientada", "detalhe"]);
const ALLOWED_ORIGINS = new Set([
  "https://donaantonia.com.br",
  "https://www.donaantonia.com.br",
  "https://osvaldosereia.github.io",
]);

const cors = (origin: string | null) => {
  const local = Boolean(origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  const allowed = Boolean(origin && (ALLOWED_ORIGINS.has(origin) || local));
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": origin! } : {}),
    "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};

const json = (body: unknown, status = 200, origin: string | null = null) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

const clean = (v: unknown, max = 1000) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
};
const base64ToBytes = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const randomId = () => crypto.randomUUID();

function finalText(data: any) {
  return (Array.isArray(data?.output) ? data.output : [])
    .filter((x: any) => x?.type === "message")
    .flatMap((x: any) => Array.isArray(x?.content) ? x.content : [])
    .filter((x: any) => x?.type === "output_text")
    .map((x: any) => String(x?.text || ""))
    .join("")
    .trim();
}

async function analyzeWithModel(apiKey: string, model: string, image: Uint8Array, mime: string, prior?: any) {
  const extra = prior ? `\nUma análise anterior ficou incerta. Reavalie com cuidado, sem inventar informações. Análise anterior: ${JSON.stringify(prior).slice(0, 5000)}` : "";
  const body = {
    model,
    store: false,
    max_output_tokens: 1200,
    reasoning: { effort: model === ESCALATION_MODEL ? "medium" : "low" },
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: buildAnalysisPrompt() + extra },
        { type: "input_image", image_url: `data:${mime};base64,${bytesToBase64(image)}`, detail: "high" },
      ],
    }],
    text: { format: { type: "json_schema", name: "ame_mais_product_analysis_v1", strict: true, schema: ANALYSIS_SCHEMA } },
  };
  const r = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`analysis_http_${r.status}_${clean(data?.error?.code || data?.error?.message || "error", 200)}`);
  const text = finalText(data);
  if (!text) throw new Error("analysis_empty_output");
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error("analysis_invalid_json"); }
  return { analysis: normalizeAnalysis(parsed), model, usage: data?.usage || {} };
}

const VALIDATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    same_product: { type: "boolean" },
    color_match: { type: "boolean" },
    shape_match: { type: "boolean" },
    identity_details_match: { type: "boolean" },
    fidelity_score: { type: "number", minimum: 0, maximum: 1 },
    critical_issue: { type: "string", maxLength: 300 },
  },
  required: ["same_product", "color_match", "shape_match", "identity_details_match", "fidelity_score", "critical_issue"],
};

async function validateImage(apiKey: string, source: Uint8Array, mime: string, candidate: Uint8Array, kind: string) {
  const prompt = kind === "principal"
    ? "Compare a primeira foto (referência verdadeira) com a segunda (imagem de e-commerce). A segunda deve ser o MESMO produto com fidelidade muito alta. Ignore apenas fundo, iluminação e pequenos ajustes de posição. Reprove se mudar santo, medalha, crucifixo, estampa, cor, forma, quantidade, texto principal, ornamentos ou identidade do produto."
    : "Compare a primeira foto (referência verdadeira) com a segunda imagem comercial. Confirme que continua sendo o MESMO produto. Cenário, enquadramento e aproximação podem mudar, mas identidade, cor principal, forma e detalhes religiosos/visuais existentes não podem ser inventados ou trocados.";
  const body = {
    model: ANALYSIS_MODEL,
    store: false,
    max_output_tokens: 350,
    reasoning: { effort: "low" },
    input: [{ role: "user", content: [
      { type: "input_text", text: prompt },
      { type: "input_image", image_url: `data:${mime};base64,${bytesToBase64(source)}`, detail: "high" },
      { type: "input_image", image_url: `data:image/webp;base64,${bytesToBase64(candidate)}`, detail: "high" },
    ] }],
    text: { format: { type: "json_schema", name: "ame_mais_image_validation_v1", strict: true, schema: VALIDATION_SCHEMA } },
  };
  const r = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`validation_http_${r.status}_${clean(data?.error?.code || data?.error?.message || "error", 180)}`);
  const text = finalText(data);
  if (!text) throw new Error("validation_empty_output");
  let v;
  try { v = JSON.parse(text); } catch { throw new Error("validation_invalid_json"); }
  const threshold = kind === "principal" ? 0.92 : kind === "ambientada" ? 0.85 : 0.82;
  const accepted = v.same_product === true && v.color_match === true && v.shape_match === true && Number(v.fidelity_score || 0) >= threshold && (kind !== "principal" || v.identity_details_match === true);
  return { accepted, threshold, ...v };
}

async function editImage(apiKey: string, source: Uint8Array, mime: string, prompt: { quality: string, prompt: string }) {
  const form = new FormData();
  form.append("model", IMAGE_MODEL);
  form.append("prompt", prompt.prompt);
  form.append("size", "1024x1024");
  form.append("quality", prompt.quality);
  form.append("output_format", "webp");
  form.append("output_compression", "78");
  form.append("background", "opaque");
  form.append("image[]", new Blob([source], { type: mime }), "referencia-produto");
  const r = await fetch(IMAGE_EDIT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(115000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`image_http_${r.status}_${clean(data?.error?.code || data?.error?.message || "error", 200)}`);
  const b64 = clean(data?.data?.[0]?.b64_json, 60_000_000);
  if (!b64) throw new Error("image_empty_output");
  return { bytes: base64ToBytes(b64), usage: data?.usage || {}, request_id: r.headers.get("x-request-id") || null };
}

async function requireAdmin(req: Request, sb: any) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, error: "admin_session_required" };
  const { data: userData, error: userError } = await sb.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return { ok: false, status: 401, error: "admin_session_invalid" };
  const { data: admin, error: adminError } = await sb.from("admin_users").select("role,is_active").eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (adminError || !admin || !["owner", "admin"].includes(String(admin.role || ""))) return { ok: false, status: 403, error: "admin_forbidden" };
  return { ok: true, user };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const local = Boolean(origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  if (origin && !ALLOWED_ORIGINS.has(origin) && !local) return json({ ok: false, error: "origin_not_allowed" }, 403, null);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!supabaseUrl || !serviceKey || !openaiKey) return json({ ok: false, error: "server_config" }, 500, origin);
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = await requireAdmin(req, sb);
  if (!admin.ok) return json({ ok: false, error: admin.error }, admin.status, origin);

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ ok: false, error: "invalid_form" }, 400, origin); }
  const action = clean(form.get("action") || "analyze", 40).toLowerCase();
  const file = form.get("image");
  if (!(file instanceof File)) return json({ ok: false, error: "image_required" }, 400, origin);
  if (!ALLOWED_TYPES.has(file.type)) return json({ ok: false, error: "image_type_not_allowed" }, 400, origin);
  if (file.size < 5_000 || file.size > MAX_UPLOAD) return json({ ok: false, error: "image_size_invalid" }, 400, origin);
  const source = new Uint8Array(await file.arrayBuffer());

  try {
    if (action === "analyze") {
      let result = await analyzeWithModel(openaiKey, ANALYSIS_MODEL, source, file.type);
      if (shouldEscalate(result.analysis)) {
        const escalated = await analyzeWithModel(openaiKey, ESCALATION_MODEL, source, file.type, result.analysis);
        result = escalated.analysis.confianca_geral >= result.analysis.confianca_geral ? escalated : result;
      }
      return json({ ok: true, analysis: result.analysis, model: result.model, image_plan: buildImagePrompts(result.analysis).map(({kind,title}) => ({kind,title})) }, 200, origin);
    }

    if (action === "generate_image") {
      const kind = clean(form.get("kind"), 30);
      if (!ALLOWED_KINDS.has(kind)) return json({ ok: false, error: "invalid_kind" }, 400, origin);
      let analysis: any = {};
      try { analysis = normalizeAnalysis(JSON.parse(String(form.get("analysis_json") || "{}"))); } catch { return json({ ok: false, error: "invalid_analysis" }, 400, origin); }
      const prompt = buildImagePrompts(analysis).find(x => x.kind === kind)!;
      let generated: any = null;
      let validation: any = null;
      const maxAttempts = 2;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        generated = await editImage(openaiKey, source, file.type, prompt);
        validation = await validateImage(openaiKey, source, file.type, generated.bytes, kind);
        if (validation.accepted) break;
      }
      if (!validation?.accepted) return json({ ok: false, error: "image_fidelity_rejected", kind, validation }, 422, origin);

      const session = clean(form.get("session_id"), 80) || randomId();
      const safeSession = /^[0-9a-f-]{20,80}$/i.test(session) ? session : randomId();
      const path = `ame-mais/${admin.user.id}/${safeSession}/${kind}-${Date.now()}.webp`;
      const upload = await sb.storage.from(BUCKET).upload(path, generated.bytes, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
      if (upload.error) throw new Error(`storage_upload_${clean(upload.error.message, 180)}`);
      const publicUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      return json({ ok: true, kind, title: prompt.title, url: publicUrl, validation, model: IMAGE_MODEL }, 200, origin);
    }

    return json({ ok: false, error: "unknown_action" }, 400, origin);
  } catch (e) {
    const message = clean((e as Error)?.message || e, 300);
    console.error("ame-mais", action, message);
    return json({ ok: false, error: "processing_failed", detail: message }, 500, origin);
  }
});