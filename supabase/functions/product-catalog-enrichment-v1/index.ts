import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { canonicalStoreCategory, createSafeEnrichmentPatch, STORE_CATEGORIES, isXmlCreatedProduct } from "./catalog-enrichment-policy.mjs";

const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; }
  catch { return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; }
})();
const db = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const clean = (value: unknown, max = 1000) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const meta = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function buildTaxonomy(rows: any[]) {
  const counts = new Map<string, Map<string, number>>();
  for (const row of rows || []) {
    const category = canonicalStoreCategory(row.sales_category || row.storefront_category || row.category);
    const subcategory = clean(row.subcategory, 80);
    if (!category || !subcategory || subcategory === "-") continue;
    const bySubcategory = counts.get(category) || new Map<string, number>();
    bySubcategory.set(subcategory, (bySubcategory.get(subcategory) || 0) + 1);
    counts.set(category, bySubcategory);
  }
  const taxonomy: Record<string, string[]> = {};
  for (const category of STORE_CATEGORIES) {
    taxonomy[category] = [...(counts.get(category) || new Map()).entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
      .slice(0, 60)
      .map(([name]) => name);
  }
  return taxonomy;
}

async function readOpenAiKey() {
  const result = await db.rpc("get_product_catalog_enrichment_openai_key_v1");
  if (result.error || !result.data) throw new Error("openai_key_unavailable");
  return String(result.data);
}

async function createProposal(apiKey: string, product: any, taxonomy: Record<string, string[]>) {
  const context = {
    xml_name: clean(product.name, 220),
    brand: clean(product.brand, 160) || null,
    ean: clean(product.gtin, 20) || null,
    packaging_from_invoice: clean(product.packaging, 120) || null,
    unit: clean(product.unit, 20) || "UN",
    ncm_reference_for_category_only: clean(product.ncm, 16) || null,
    allowed_categories: STORE_CATEGORIES,
    existing_subcategories_by_category: taxonomy,
  };
  const system = `Você organiza o catálogo de uma mercearia brasileira. Transforme os dados de uma nota em cadastro claro para comércio eletrônico. Use somente os fatos fornecidos; não invente peso, volume, sabor, composição, benefícios, certificações ou origem. O título deve identificar o produto vendido como unidade, preservar marca e variantes que constem nos dados, corrigir grafia e evitar caixa alta integral. Escreva unidades com espaço (ex.: 1 kg, 500 g, 1 L, 200 ml). Se a nota mostrar caixa/embalagem com divisor, não anuncie a caixa como unidade; use somente características unitárias comprovadas. A descrição curta deve ser uma frase objetiva e factual. A descrição longa deve ter uma ou duas frases úteis, sem repetir o título, sem usar "variante" e sem dizer que marca ou informação estão ausentes. Descreva apenas características comprovadas. Escolha uma categoria exatamente da lista permitida e uma subcategoria exatamente da lista correspondente; não crie rótulos. Se os dados não permitirem uma escolha segura, retorne subcategory vazia e confidence baixo. Responda apenas JSON válido com name, description_short, description_long, category, subcategory e confidence (0 a 1).`;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(context) }],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`openai_http_${response.status}`);
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("openai_empty_response");
  return JSON.parse(content);
}

async function finishJob(productId: string, status: string, detail: Record<string, unknown> = {}) {
  const result = await db.from("product_catalog_enrichment_jobs_v1").update({
    status,
    last_error: status === "error" ? clean(detail.error, 240) : null,
    review_reason: status === "review" || status === "skipped" ? clean(detail.reason, 120) || null : null,
    locked_at: null,
    updated_at: new Date().toISOString(),
    ...(status === "completed" || status === "review" || status === "skipped" ? { finished_at: new Date().toISOString() } : {}),
    ...(detail.available_at ? { available_at: detail.available_at } : {}),
  }).eq("product_id", productId);
  if (result.error) throw result.error;
}

async function processOne(apiKey: string, product: any, taxonomy: Record<string, string[]>) {
  const productId = String(product.id);
  if (!isXmlCreatedProduct(product)) {
    await finishJob(productId, "skipped", { reason: "origem_xml_nao_confirmada" });
    return "skipped";
  }
  if (product.is_active !== false) {
    await finishJob(productId, "skipped", { reason: "produto_ativado_manualmente" });
    return "skipped";
  }
  if (product.last_admin_edit_at) {
    await finishJob(productId, "skipped", { reason: "produto_editado_manualmente" });
    return "skipped";
  }

  const proposal = await createProposal(apiKey, product, taxonomy);
  const result = createSafeEnrichmentPatch(product, proposal, taxonomy);
  // Intentionally limited to descriptive and category fields; inventory, expiry,
  // EAN, tax evidence, price, cost, supplier, image and publication flags stay untouched.
  const saved = await db.from("products").update(result.patch).eq("id", productId).eq("is_active", false).select("id").maybeSingle();
  if (saved.error) throw saved.error;
  if (!saved.data) {
    await finishJob(productId, "skipped", { reason: "produto_ativado_durante_processamento" });
    return "skipped";
  }
  await finishJob(productId, result.queueStatus, { reason: result.reviewReason || undefined });
  return result.queueStatus;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const suppliedSecret = request.headers.get("x-product-catalog-worker-secret") || "";
    const auth = await db.rpc("product_catalog_enrichment_worker_authorized_v1", { p_secret: suppliedSecret });
    if (auth.error || auth.data !== true) return json({ ok: false, error: "unauthorized" }, 401);

    const body = await request.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(5, Number(body?.limit) || 5));
    const claim = await db.rpc("claim_product_catalog_enrichment_jobs_v1", { p_limit: limit });
    if (claim.error) throw claim.error;
    const jobs = Array.isArray(claim.data) ? claim.data : [];
    if (!jobs.length) return json({ ok: true, claimed: 0, completed: 0, review: 0, skipped: 0, errors: 0 });

    const ids = jobs.map((job: any) => String(job.product_id)).filter(Boolean);
    const [productsResult, taxonomyResult, apiKey] = await Promise.all([
      db.from("products").select("id,name,gtin,brand,packaging,unit,ncm,category,sales_category,storefront_category,subcategory,is_active,last_admin_edit_at,metadata,description_short,description_long,image_url,image_original_url,image_ai_url,stock,validity_date,supplier,cost,price")
        .in("id", ids),
      db.from("products").select("category,sales_category,storefront_category,subcategory").eq("is_active", true).not("subcategory", "is", null).limit(10000),
      readOpenAiKey(),
    ]);
    if (productsResult.error) throw productsResult.error;
    if (taxonomyResult.error) throw taxonomyResult.error;
    const productMap = new Map((productsResult.data || []).map((product: any) => [String(product.id), product]));
    const taxonomy = buildTaxonomy(taxonomyResult.data || []);
    const result = { ok: true, claimed: jobs.length, completed: 0, review: 0, skipped: 0, errors: 0, product_ids: [] as string[] };

    for (const job of jobs) {
      const productId = String(job.product_id);
      const product = productMap.get(productId);
      try {
        if (!product) {
          await finishJob(productId, "skipped", { reason: "produto_excluido" });
          result.skipped++;
        } else {
          const status = await processOne(apiKey, product, taxonomy);
          if (status === "completed") result.completed++;
          else if (status === "review") result.review++;
          else result.skipped++;
        }
      } catch (error) {
        const attempts = Number(job.attempts || 1);
        const reason = clean(error instanceof Error ? error.message : error, 240);
        if (attempts < 3) {
          await finishJob(productId, "pending", { error: reason, available_at: new Date(Date.now() + attempts * 15 * 60 * 1000).toISOString() });
        } else {
          await finishJob(productId, "error", { error: reason });
          result.errors++;
        }
      }
      result.product_ids.push(productId);
    }
    return json(result);
  } catch (error) {
    const detail = error && typeof error === "object" ? error as Record<string, unknown> : {};
    console.error("product_catalog_enrichment_worker_error", JSON.stringify({
      name: clean(detail.name, 80),
      code: clean(detail.code, 80),
      message: clean(detail.message || error, 240).replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]"),
    }));
    return json({ ok: false, error: "worker_failed" }, 500);
  }
});
