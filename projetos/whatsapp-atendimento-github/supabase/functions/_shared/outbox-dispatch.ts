import { outboxDispatchSecret } from "./outbox-crypto.ts";

const WORKER_PATH = "/functions/v1/whatsapp-outbox-worker";

/** Wake the private outbox worker only after the explicit server-side send gate is enabled. */
export function wakeOutboxWorker(dispatchDepth = 0): void {
  if (Deno.env.get("META_OUTBOX_SENDER_ENABLED") !== "true") return;
  if (!Number.isSafeInteger(dispatchDepth) || dispatchDepth < 0 || dispatchDepth > 19) return;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  if (!supabaseUrl) {
    console.error("WhatsApp outbox wake-up is not configured.");
    return;
  }

  const task = (async () => {
    try {
      const dispatchSecret = await outboxDispatchSecret();
      if (!dispatchSecret) {
        console.error("WhatsApp outbox wake-up is not configured.");
        return;
      }
      const response = await fetch(`${supabaseUrl}${WORKER_PATH}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${dispatchSecret}`,
          "X-WhatsApp-Outbox-Dispatch-Depth": String(dispatchDepth),
        },
        signal: AbortSignal.timeout(90_000),
      });
      await response.body?.cancel();
      if (!response.ok) console.error(`WhatsApp outbox worker returned HTTP ${response.status}.`);
    } catch {
      console.error("WhatsApp outbox worker wake-up failed.");
    }
  })();

  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(task);
  else void task;
}
