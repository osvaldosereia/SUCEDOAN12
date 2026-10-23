import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

/**
 * LI authorized one-shot read probe. Each invocation must carry a 256-bit
 * per-job capability generated within SQL, whose SHA256 hash is stored in a
 * service-role-only RLS-protected table. Jobs are one-use and expire after 10min.
 *
 * This is NOT a public LI API proxy; no writes to Loja Integrada are supported.
 */
type Job = {
  id: string;
  proof_hash: string;
  state: "pending" | "running" | "done" | "failed";
  action: "status" | "products" | "categories";
  args: Record<string, unknown>;
  created_at: string;
};
const responseHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const send = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: responseHeaders });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROOF_RE = /^[0-9a-f]{64}$/i;

const serviceRole = (() => {
  // Modern Supabase projects use SUPABASE_SECRET_KEYS; older ones expose the
  // legacy service_role JWT. Never expose either value via response or logs.
  try {
    const values = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    return values.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  } catch {
    return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  }
})();
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const db = supabaseUrl && serviceRole
  ? createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

async function sha256(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(bytes), (v) => v.toString(16).padStart(2, "0")).join("");
}
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function pagination(args: Record<string, unknown>) {
  const cap = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
  return { limit: cap(args?.limit, 10, 1, 20), offset: cap(args?.offset, 0, 0, 1000000) };
}
function stripProduct(data: Record<string, unknown>) {
  // No customers, checkout data, URLs, tokens or raw upstream errors.
  return { id: data.id ?? null, nome: data.nome ?? null, sku: data.sku ?? null, codigo: data.codigo ?? null };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return send(405, { ok: false, error: "method_not_allowed" });
  if (!db) return send(503, { ok: false, error: "internal_backend_unavailable" });

  let incoming: { id?: unknown; proof?: unknown };
  try {
    const text = await req.text();
    if (text.length > 1024) return send(413, { ok: false, error: "request_too_large" });
    incoming = JSON.parse(text);
  } catch {
    return send(400, { ok: false, error: "invalid_body" });
  }

  const id = incoming && typeof incoming.id === "string" ? incoming.id : "";
  const proof = incoming && typeof incoming.proof === "string" ? incoming.proof : "";
  if (!UUID_RE.test(id) || !PROOF_RE.test(proof)) return send(403, { ok: false, error: "forbidden" });

  const { data: jobData, error: jobError } = await db.from("li_bridge_probe_jobs")
    .select("id,proof_hash,state,action,args,created_at").eq("id", id).maybeSingle();
  if (jobError || !jobData) return send(403, { ok: false, error: "forbidden" });
  const job = jobData as Job;
  const createdMs = Date.parse(job.created_at);
  if (!Number.isFinite(createdMs) || Math.abs(Date.now() - createdMs) > 10 * 60 * 1000 ||
      !constantTimeEqual(await sha256(proof), job.proof_hash) || job.state !== "pending") {
    return send(403, { ok: false, error: "forbidden" });
  }

  // Atomic state transition: concurrent/replayed requests cannot run twice.
  const { data: locked, error: lockError } = await db.from("li_bridge_probe_jobs")
    .update({ state: "running", started_at: new Date().toISOString() })
    .eq("id", id).eq("state", "pending").select("id").maybeSingle();
  if (lockError || !locked) return send(409, { ok: false, error: "already_processed" });

  let outcome: Record<string, unknown>;
  const token = Deno.env.get("LI_PERSONAL_TOKEN")?.trim().replace(/^Basic\s+/i, "") || "";
  if (!token) {
    outcome = { ok: false, error: "li_token_not_configured" };
  } else {
    const path = job.action === "categories" ? "/v1/categoria" : "/v1/produto";
    const upstream = new URL(path, "https://api.awsli.com.br");
    const { limit, offset } = pagination(job.args ?? {});
    upstream.searchParams.set("limit", String(job.action === "status" ? 1 : limit));
    upstream.searchParams.set("offset", String(job.action === "status" ? 0 : offset));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(upstream, {
        method: "GET",
        headers: { Authorization: `Basic ${token}`, Accept: "application/json" },
        redirect: "error",
        signal: controller.signal,
      });
      if (!res.ok) {
        outcome = { ok: false, error: "li_http_error", upstream_status: res.status };
      } else {
        const json = await res.json() as { meta?: { total_count?: number }; objects?: Record<string, unknown>[] };
        outcome = {
          ok: true,
          service: "loja_integrada",
          action: job.action,
          total_count: typeof json.meta?.total_count === "number" ? json.meta.total_count : null,
          ...(job.action === "status" ? {} :
            { objects: Array.isArray(json.objects) ? json.objects.slice(0, 20).map(stripProduct) : [] }),
        };
      }
    } catch (error) {
      outcome = { ok: false, error: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "li_upstream_unavailable" };
    } finally {
      clearTimeout(timeout);
    }
  }

  const { error: saveError } = await db.from("li_bridge_probe_jobs").update({
    state: outcome.ok ? "done" : "failed",
    result: outcome,
    completed_at: new Date().toISOString(),
  }).eq("id", id).eq("state", "running");
  if (saveError) return send(500, { ok: false, error: "result_storage_failed" });
  // Does not return results to the untrusted HTTP caller.
  return send(202, { ok: true, accepted: true });
});
