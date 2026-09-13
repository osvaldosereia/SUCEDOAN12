import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import {
  ANALYSIS_MODEL,
  ESCALATION_MODEL,
  IMAGE_MODEL,
  IMAGE_OUTPUT,
  ANALYSIS_SCHEMA,
  SCENE_KINDS,
  buildAnalysisPrompt,
  normalizeAnalysis,
  shouldEscalate,
  buildImagePrompts,
  getSceneProfile,
  storagePaths,
  resolveOpenAiKey,
} from "./core.mjs";

const RESPONSES_URL = "https://api.openai.com/v1/responses";
const IMAGE_EDIT_URL = "https://api.openai.com/v1/images/edits";
const BUCKET = "ame-mais";
const LOGO_URL = "https://donaantonia.com.br/ame-mais/assets/logo-ame-store.jpg";
const MAX_UPLOAD = 10 * 1024 * 1024;
const RATE_LIMIT_PER_HOUR = 80;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_KINDS = new Set(SCENE_KINDS);
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
    "Access-Control-Allow-Headers": "apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};

const json = (body: unknown, status = 200, origin: string | null = null) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

const clean = (v: unknown, max = 1000) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const isUuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v, 80));
const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
};
const base64ToBytes = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

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
    max_output_tokens: 1400,
    reasoning: { effort: model === ESCALATION_MODEL ? "medium" : "low" },
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: buildAnalysisPrompt() + extra },
        { type: "input_image", image_url: `data:${mime};base64,${bytesToBase64(image)}`, detail: "high" },
      ],
    }],
    text: { format: { type: "json_schema", name: "ame_mais_product_analysis_v2", strict: true, schema: ANALYSIS_SCHEMA } },
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
  const prompt = kind === "hero"
    ? "Compare a primeira foto (referência verdadeira) com a segunda (foto comercial). A segunda deve mostrar o MESMO produto com fidelidade muito alta. Pessoa, mão, ambiente e enquadramento podem mudar, mas reprove se mudar santo, medalha, crucifixo, estampa, cor, forma, quantidade, texto principal, ornamentos ou identidade do produto."
    : "Compare a primeira foto (referência verdadeira) com a segunda foto comercial. Confirme que continua sendo o MESMO produto. Cenário, pessoa, enquadramento e aproximação podem mudar, mas identidade, cor principal, forma e detalhes religiosos/visuais existentes não podem ser inventados ou trocados.";
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
    text: { format: { type: "json_schema", name: "ame_mais_image_validation_v2", strict: true, schema: VALIDATION_SCHEMA } },
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
  const threshold = kind === "hero" ? 0.90 : kind === "lifestyle" ? 0.84 : 0.82;
  const accepted = v.same_product === true && v.color_match === true && v.shape_match === true && Number(v.fidelity_score || 0) >= threshold && (kind !== "hero" || v.identity_details_match === true);
  return { accepted, threshold, ...v };
}

async function editImage(apiKey: string, source: Uint8Array, mime: string, prompt: { prompt: string }) {
  const form = new FormData();
  form.append("model", IMAGE_MODEL);
  form.append("prompt", prompt.prompt);
  form.append("size", IMAGE_OUTPUT.size);
  form.append("quality", IMAGE_OUTPUT.quality);
  form.append("output_format", IMAGE_OUTPUT.format);
  form.append("output_compression", String(IMAGE_OUTPUT.compression));
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

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function rateLimit(req: Request, sb: any) {
  const ip = clean(req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown", 120);
  const ua = clean(req.headers.get("user-agent") || "unknown", 220);
  const fingerprint = await sha256Hex(`${ip}|${ua}`);
  const now = new Date();
  const { data, error } = await sb.from("ame_mais_rate_limits").select("window_started_at,request_count").eq("fingerprint", fingerprint).maybeSingle();
  if (error) throw new Error(`rate_lookup_${clean(error.message, 160)}`);
  const started = data?.window_started_at ? new Date(data.window_started_at) : null;
  const expired = !started || now.getTime() - started.getTime() >= 60 * 60 * 1000;
  const count = expired ? 0 : Number(data?.request_count || 0);
  if (count >= RATE_LIMIT_PER_HOUR) return { ok: false, retryAfter: Math.max(60, Math.ceil((60 * 60 * 1000 - (now.getTime() - (started?.getTime() || now.getTime()))) / 1000)) };
  const next = { fingerprint, window_started_at: expired ? now.toISOString() : started!.toISOString(), request_count: count + 1, updated_at: now.toISOString() };
  const up = await sb.from("ame_mais_rate_limits").upsert(next, { onConflict: "fingerprint" });
  if (up.error) throw new Error(`rate_update_${clean(up.error.message, 160)}`);
  return { ok: true };
}

async function ensureBucket(sb: any) {
  const existing = await sb.storage.getBucket(BUCKET);
  if (!existing.error) return;
  const created = await sb.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/json"],
    fileSizeLimit: "10MB",
  });
  if (created.error && !/already exists/i.test(String(created.error.message || ""))) throw new Error(`bucket_${clean(created.error.message, 180)}`);
}

async function updateRun(sb: any, sessionId: string, patch: Record<string, unknown>) {
  const q = await sb.from("ame_mais_runs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", sessionId);
  if (q.error) throw new Error(`run_update_${clean(q.error.message, 180)}`);
}

async function getRun(sb: any, sessionId: string) {
  const q = await sb.from("ame_mais_runs")
    .select("id,status,step,source_url,analysis,images,scene_profile,conflicts,observations,prompts,card_json,model_analysis,model_image,error_message,created_at,updated_at,completed_at")
    .eq("id", sessionId).maybeSingle();
  if (q.error) throw new Error(`run_lookup_${clean(q.error.message, 180)}`);
  return q.data;
}

async function getRunImages(sb: any, sessionId: string) {
  const q = await sb.from("ame_mais_images")
    .select("id,run_id,kind,title,prompt,image_url,storage_path,status,validation,model,quality,size,attempt_count,created_at,updated_at")
    .eq("run_id", sessionId).order("created_at", { ascending: true });
  if (q.error) throw new Error(`images_lookup_${clean(q.error.message, 180)}`);
  const order = new Map([["hero",0],["lifestyle",1],["detail",2]]);
  return (q.data || []).sort((a:any,b:any)=>(order.get(a.kind)??9)-(order.get(b.kind)??9));
}

function imagesObject(rows: any[]) {
  const out: Record<string, unknown> = {};
  for (const row of rows || []) {
    out[row.kind] = {
      kind: row.kind,
      title: row.title,
      url: row.image_url,
      status: row.status,
      validation: row.validation || {},
      model: row.model,
      quality: row.quality,
      size: row.size,
    };
  }
  return out;
}

function buildCardJson(run: any, rows: any[]) {
  const a = run?.analysis || {};
  const gallery = ["hero","lifestyle","detail"].map(kind => {
    const row = (rows || []).find((x:any)=>x.kind===kind) || {};
    return {
      kind,
      title: row.title || ({hero:"Foto principal",lifestyle:"Em uso",detail:"Detalhe"} as any)[kind],
      url: row.image_url || "",
      download_url: row.image_url || "",
      status: row.status || "pending",
      validation: row.validation || {},
    };
  });
  return {
    run_id: run.id,
    logo_url: LOGO_URL,
    name: a.nome_cadastro || "",
    storefront_description: a.descricao_vitrine || "",
    catalog_description: a.descricao_cadastro || "",
    attributes: {
      tipo_produto: a.tipo_produto || "",
      devocao_tema: a.devocao_tema || "",
      material_modelo: a.material_modelo || "",
      cor_acabamento: a.cor_acabamento || "",
      diferencial_tamanho: a.diferencial_tamanho || "",
    },
    search_terms: a.termos_busca || [],
    conflicts: a.conflitos || run.conflicts || [],
    observations: a.observacoes || run.observations || [],
    confidence: Number(a.confianca_geral || 0),
    needs_review: Boolean(a.precisa_revisao),
    review_reason: a.motivo_revisao || "",
    scene_profile: run.scene_profile || "generico",
    gallery,
    active_kind: gallery.find(x=>x.kind==="hero" && x.url)?.kind || gallery.find(x=>x.url)?.kind || "hero",
  };
}

async function saveResultJson(sb: any, sessionId: string) {
  const run = await getRun(sb, sessionId);
  if (!run) return;
  const imageRows = await getRunImages(sb, sessionId);
  const bytes = new TextEncoder().encode(JSON.stringify({ ...run, image_rows: imageRows }, null, 2));
  const path = storagePaths(sessionId).result;
  const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: "application/json", cacheControl: "0", upsert: true });
  if (up.error) throw new Error(`result_json_${clean(up.error.message, 180)}`);
}

async function upsertImagePlan(sb:any, sessionId:string, prompts:any[]) {
  const rows = prompts.map(p=>({
    run_id: sessionId,
    kind: p.kind,
    title: p.title,
    prompt: p.prompt,
    status: "pending",
    validation: {},
    model: IMAGE_MODEL,
    quality: IMAGE_OUTPUT.quality,
    size: IMAGE_OUTPUT.size,
    updated_at: new Date().toISOString(),
  }));
  const q = await sb.from("ame_mais_images").upsert(rows, { onConflict: "run_id,kind" });
  if (q.error) throw new Error(`image_plan_${clean(q.error.message,180)}`);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const local = Boolean(origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  if (origin && !ALLOWED_ORIGINS.has(origin) && !local) return json({ ok: false, error: "origin_not_allowed" }, 403, null);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  let openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "server_config" }, 500, origin);
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  openaiKey = await resolveOpenAiKey(openaiKey, sb);
  if (!openaiKey) return json({ ok: false, error: "server_config" }, 500, origin);

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ ok: false, error: "invalid_form" }, 400, origin); }
  const action = clean(form.get("action") || "analyze", 40).toLowerCase();
  const sessionId = clean(form.get("session_id"), 80);
  if (!isUuid(sessionId)) return json({ ok: false, error: "invalid_session_id" }, 400, origin);

  try {
    await ensureBucket(sb);

    if (action === "status" || action === "get_run") {
      const run = await getRun(sb, sessionId);
      if (!run) return json({ ok: false, error: "run_not_found" }, 404, origin);
      const imageRows = await getRunImages(sb, sessionId);
      return json({ ok: true, run, image_rows: imageRows, card: run.card_json || {} }, 200, origin);
    }

    const limited = await rateLimit(req, sb);
    if (!limited.ok) return json({ ok: false, error: "rate_limited", retry_after_seconds: limited.retryAfter }, 429, origin);

    if (action === "analyze") {
      const file = form.get("image");
      if (!(file instanceof File)) return json({ ok: false, error: "image_required" }, 400, origin);
      if (!ALLOWED_TYPES.has(file.type)) return json({ ok: false, error: "image_type_not_allowed" }, 400, origin);
      if (file.size < 5_000 || file.size > MAX_UPLOAD) return json({ ok: false, error: "image_size_invalid" }, 400, origin);
      const source = new Uint8Array(await file.arrayBuffer());
      const paths = storagePaths(sessionId);

      const start = await sb.from("ame_mais_runs").upsert({
        id: sessionId,
        status: "processing",
        step: "preparing_photo",
        analysis: {},
        images: {},
        conflicts: [],
        observations: [],
        prompts: {},
        card_json: {},
        scene_profile: null,
        error_message: null,
        model_analysis: null,
        model_image: IMAGE_MODEL,
        completed_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (start.error) throw new Error(`run_create_${clean(start.error.message, 180)}`);

      await updateRun(sb, sessionId, { step: "saving_original" });
      const originalUpload = await sb.storage.from(BUCKET).upload(paths.original, source, { contentType: file.type, cacheControl: "31536000", upsert: true });
      if (originalUpload.error) throw new Error(`source_upload_${clean(originalUpload.error.message, 180)}`);
      const sourceUrl = sb.storage.from(BUCKET).getPublicUrl(paths.original).data.publicUrl;
      await updateRun(sb, sessionId, { source_url: sourceUrl, step: "analyzing_product" });

      let result = await analyzeWithModel(openaiKey, ANALYSIS_MODEL, source, file.type);
      if (shouldEscalate(result.analysis)) {
        const escalated = await analyzeWithModel(openaiKey, ESCALATION_MODEL, source, file.type, result.analysis);
        result = escalated.analysis.confianca_geral >= result.analysis.confianca_geral ? escalated : result;
      }
      await updateRun(sb, sessionId, { step: "creating_name" });
      await updateRun(sb, sessionId, { step: "creating_catalog_description" });
      await updateRun(sb, sessionId, { step: "creating_storefront_description" });
      await updateRun(sb, sessionId, { step: "choosing_scene_profile" });

      const profile = getSceneProfile(result.analysis);
      const prompts = profile.scenes;
      const promptObject = Object.fromEntries(prompts.map(p=>[p.kind,{title:p.title,prompt:p.prompt,quality:p.quality}]));
      await upsertImagePlan(sb, sessionId, prompts);
      await updateRun(sb, sessionId, {
        analysis: result.analysis,
        conflicts: result.analysis.conflitos || [],
        observations: result.analysis.observacoes || [],
        scene_profile: profile.profile_key,
        prompts: promptObject,
        model_analysis: result.model,
        step: "generating_hero",
      });
      await saveResultJson(sb, sessionId);
      return json({
        ok: true,
        session_id: sessionId,
        analysis: result.analysis,
        model: result.model,
        source_url: sourceUrl,
        scene_profile: profile.profile_key,
        image_plan: prompts.map(({ kind, title }) => ({ kind, title })),
      }, 200, origin);
    }

    if (action === "generate_image") {
      const kind = clean(form.get("kind"), 30);
      if (!ALLOWED_KINDS.has(kind)) return json({ ok: false, error: "invalid_kind" }, 400, origin);
      const run = await getRun(sb, sessionId);
      if (!run?.source_url) return json({ ok: false, error: "run_not_ready" }, 409, origin);
      let analysis: any = run.analysis || {};
      const supplied = String(form.get("analysis_json") || "").trim();
      if (supplied) {
        try { analysis = normalizeAnalysis(JSON.parse(supplied)); } catch { return json({ ok: false, error: "invalid_analysis" }, 400, origin); }
      }
      const paths = storagePaths(sessionId);
      const sourceDownload = await sb.storage.from(BUCKET).download(paths.original);
      if (sourceDownload.error || !sourceDownload.data) throw new Error(`source_download_${clean(sourceDownload.error?.message || "missing", 180)}`);
      const source = new Uint8Array(await sourceDownload.data.arrayBuffer());
      const sourceMime = sourceDownload.data.type || "image/jpeg";
      const prompt = buildImagePrompts(analysis).find(x => x.kind === kind);
      if (!prompt) return json({ ok:false, error:"invalid_kind" },400,origin);

      const currentRows = await getRunImages(sb, sessionId);
      const currentRow = currentRows.find((x:any)=>x.kind===kind);
      const baseAttempts = Number(currentRow?.attempt_count || 0);
      await sb.from("ame_mais_images").upsert({
        run_id:sessionId, kind, title:prompt.title, prompt:prompt.prompt, status:"generating",
        model:IMAGE_MODEL, quality:IMAGE_OUTPUT.quality, size:IMAGE_OUTPUT.size,
        attempt_count:baseAttempts, updated_at:new Date().toISOString()
      },{onConflict:"run_id,kind"});
      await updateRun(sb, sessionId, { step: `generating_${kind}`, analysis });

      let generated: any = null;
      let validation: any = null;
      let attemptsUsed = 0;
      for (let attempt = 1; attempt <= 2; attempt++) {
        attemptsUsed = attempt;
        generated = await editImage(openaiKey, source, sourceMime, prompt);
        await updateRun(sb, sessionId, { step: `validating_${kind}` });
        await sb.from("ame_mais_images").update({ status:"validating", attempt_count:baseAttempts+attempt, updated_at:new Date().toISOString() }).eq("run_id",sessionId).eq("kind",kind);
        validation = await validateImage(openaiKey, source, sourceMime, generated.bytes, kind);
        if (validation.accepted) break;
        if (attempt < 2) {
          await updateRun(sb, sessionId, { step: `generating_${kind}` });
          await sb.from("ame_mais_images").update({ status:"generating", validation, updated_at:new Date().toISOString() }).eq("run_id",sessionId).eq("kind",kind);
        }
      }
      if (!validation?.accepted) {
        await sb.from("ame_mais_images").update({ status:"rejected", validation, attempt_count:baseAttempts+attemptsUsed, updated_at:new Date().toISOString() }).eq("run_id",sessionId).eq("kind",kind);
        await updateRun(sb, sessionId, { error_message: `image_fidelity_rejected:${kind}`, step: `validating_${kind}` });
        await saveResultJson(sb, sessionId);
        return json({ ok: false, error: "image_fidelity_rejected", kind, validation }, 422, origin);
      }

      await updateRun(sb, sessionId, { step: `saving_${kind}` });
      const outputPath = (paths as any)[kind];
      const upload = await sb.storage.from(BUCKET).upload(outputPath, generated.bytes, { contentType: "image/webp", cacheControl: "31536000", upsert: true });
      if (upload.error) throw new Error(`storage_upload_${clean(upload.error.message, 180)}`);
      const publicUrl = sb.storage.from(BUCKET).getPublicUrl(outputPath).data.publicUrl;
      await sb.from("ame_mais_images").update({
        image_url:publicUrl,
        storage_path:outputPath,
        status:"completed",
        validation,
        model:IMAGE_MODEL,
        quality:IMAGE_OUTPUT.quality,
        size:IMAGE_OUTPUT.size,
        attempt_count:baseAttempts+attemptsUsed,
        updated_at:new Date().toISOString(),
      }).eq("run_id",sessionId).eq("kind",kind);

      const imageRows = await getRunImages(sb, sessionId);
      const images = imagesObject(imageRows);
      const allComplete = ["hero","lifestyle","detail"].every(k=>imageRows.some((r:any)=>r.kind===k && r.status==="completed" && r.image_url));
      let cardJson:any = run.card_json || {};
      let status = "processing";
      let step = `saving_${kind}`;
      let completedAt:any = null;
      if (allComplete) {
        step = "building_card";
        await updateRun(sb,sessionId,{step,images,error_message:null});
        const latest = await getRun(sb,sessionId);
        cardJson = buildCardJson({...latest,images},imageRows);
        status = "completed";
        step = "completed";
        completedAt = new Date().toISOString();
      }
      await updateRun(sb, sessionId, {
        images,
        card_json:cardJson,
        model_image:IMAGE_MODEL,
        error_message:null,
        status,
        step,
        completed_at:completedAt,
      });
      await saveResultJson(sb, sessionId);
      return json({ ok:true, kind, title:prompt.title, url:publicUrl, validation, model:IMAGE_MODEL, quality:IMAGE_OUTPUT.quality, size:IMAGE_OUTPUT.size, completed:allComplete, card:cardJson },200,origin);
    }

    return json({ ok: false, error: "unknown_action" }, 400, origin);
  } catch (e) {
    const message = clean((e as Error)?.message || e, 300);
    console.error("ame-mais", action, message);
    if (isUuid(sessionId)) {
      try { await updateRun(sb, sessionId, { status: "error", error_message: message }); await saveResultJson(sb, sessionId); } catch { /* noop */ }
    }
    return json({ ok: false, error: "processing_failed", detail: message }, 500, origin);
  }
});
