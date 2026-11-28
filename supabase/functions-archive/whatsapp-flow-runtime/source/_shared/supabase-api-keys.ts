function readNamedKey(name: string, prefix: "sb_publishable_" | "sb_secret_"): string | undefined {
  const raw = Deno.env.get(name);
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    const keys = parsed as Record<string, unknown>;
    const preferred = keys.default;
    if (typeof preferred === "string" && preferred.startsWith(prefix)) return preferred;

    const matching = Object.values(keys).filter(
      (value): value is string => typeof value === "string" && value.startsWith(prefix),
    );
    return matching.length === 1 ? matching[0] : undefined;
  } catch {
    return undefined;
  }
}

export function supabasePublishableKey(): string | undefined {
  return Deno.env.get("SUPABASE_PUBLISHABLE_KEY")?.trim()
    || readNamedKey("SUPABASE_PUBLISHABLE_KEYS", "sb_publishable_")
    || Deno.env.get("SUPABASE_ANON_KEY")?.trim()
    || undefined;
}

export function supabaseSecretKey(): string | undefined {
  const direct = Deno.env.get("SUPABASE_SECRET_KEY")?.trim();
  if (direct?.startsWith("sb_secret_")) return direct;

  return readNamedKey("SUPABASE_SECRET_KEYS", "sb_secret_")
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim()
    || undefined;
}
