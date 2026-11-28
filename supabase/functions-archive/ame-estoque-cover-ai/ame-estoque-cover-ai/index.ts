import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { buildEventCoverPrompt } from "./cover-prompt.ts";

// Proxy de IA entre dois projetos da mesma organização.
// A chave OpenAI permanece exclusivamente no backend Dona Antônia.
const STOCK_URL = "https://awcclxehwzvvgajgpnmf.supabase.co";
const STOCK_PUBLISHABLE = "sb_publishable_S-TOf0Mb7O0KrgL3ncyVzQ_Yz6zDJH9";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function reply(errorOrData: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(errorOrData), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
async function getExistingOpenAiKey(): Promise<string> {
  const direct = Deno.env.get("OPENAI_API_KEY")?.trim();
  if (direct) return direct;
  const url = Deno.env.get("SUPABASE_URL");
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let modern = "";
  try { modern = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; }
  catch { /* legacy continua válido */ }
  const secret = modern || legacy;
  if (!url || !secret) return "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "apikey": secret,
  };
  if (!modern && legacy) headers.Authorization = "Bearer " + legacy;
  // RPC existente só é executável por service_role; nunca responde com a chave ao cliente.
  const result = await fetch(url + "/rest/v1/rpc/get_conversation_worker_provider_secret_v1", {
    method: "POST", headers, body: "{}", signal: AbortSignal.timeout(10000),
  });
  if (!result.ok) return "";
  const value = await result.json();
  return typeof value === "string" ? value.trim() : "";
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply({ error: "Método não permitido" }, 405);
  try {
    // A verificação nativa de JWT está desligada porque o JWT vem do OUTRO projeto.
    // O token é validado online pelo Auth daquele projeto, e as permissões via RLS.
    const tokenHeader = req.headers.get("Authorization") || "";
    const match = /^Bearer\s+(\S+)$/.exec(tokenHeader);
    if (!match) return reply({ error: "Sessão obrigatória" }, 401);
    const body = await req.json().catch(() => null);
    const eventId = typeof body?.event_id === "string" ? body.event_id : "";
    if (!UUID.test(eventId)) return reply({ error: "Loja temporária inválida" }, 400);
    const stock = createClient(STOCK_URL, STOCK_PUBLISHABLE, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: tokenHeader } },
    });
    const { data: { user }, error: userError } = await stock.auth.getUser(match[1]);
    if (userError || !user) return reply({ error: "Sessão inválida" }, 401);
    const { data: profile, error: profileError } = await stock.from("staff_profiles")
      .select("active,role").eq("id", user.id).maybeSingle();
    if (profileError || !profile?.active) return reply({ error: "Usuário sem acesso" }, 403);
    if (profile.role !== "admin") {
      const { data: rights, error: rightsError } = await stock.rpc("my_permissions");
      if (rightsError || !Array.isArray(rights) || !rights.some((p: { permission?: string }) => p.permission === "events.manage"))
        return reply({ error: "Sem permissão para gerenciar lojas temporárias" }, 403);
    }
    const { data: event, error: eventError } = await stock.from("events")
      .select("name,notes,cover_theme,deleted_at").eq("id", eventId).maybeSingle();
    if (eventError || !event || event.deleted_at) return reply({ error: "Loja temporária não encontrada" }, 404);
    const key = await getExistingOpenAiKey();
    if (!key) return reply({ error: "Serviço de IA não configurado no servidor de geração." }, 503);
    const prompt = buildEventCoverPrompt(event);
    const generated = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-1-mini", size: "1536x1024",
        quality: "low", output_format: "webp", n: 1, prompt,
      }),
      signal: AbortSignal.timeout(100000),
    });
    const data = await generated.json().catch(() => ({}));
    if (!generated.ok) {
      if (generated.status === 429) return reply({ error: "Limite de geração de imagens atingido. Aguarde e tente novamente." }, 429);
      if (generated.status === 401 || generated.status === 403)
        return reply({ error: "A integração OpenAI existente não autorizou o modelo de imagens. Verifique o acesso ao modelo na conta OpenAI." }, 502);
      if (generated.status === 402)
        return reply({ error: "A conta OpenAI precisa de saldo para gerar imagens." }, 502);
      console.error("OpenAI image generation failed", generated.status, data?.error?.code || "unknown");
      return reply({ error: "O serviço de IA não conseguiu gerar a imagem agora. Tente novamente." }, 502);
    }
    const b64 = data?.data?.[0]?.b64_json;
    if (typeof b64 !== "string" || !b64) return reply({ error: "O serviço de IA não retornou uma imagem válida." }, 502);
    return reply({ base64: b64, mime: "image/webp" }, 200);
  } catch (error) {
    console.error("Cover generation bridge failed", error instanceof Error ? error.name : "unknown");
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))
      return reply({ error: "A geração demorou mais que o esperado. Tente novamente." }, 504);
    return reply({ error: "Falha temporária na geração da imagem." }, 500);
  }
});
