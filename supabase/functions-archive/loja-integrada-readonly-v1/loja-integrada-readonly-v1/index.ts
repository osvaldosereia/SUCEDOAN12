import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Temporarily disabled: LI_PERSONAL_TOKEN presently resolves to a catalog
// containing Caneca Fácil items, not verified as Dona Antônia.
// Fail closed even for service-role requests until the store is identified.
Deno.serve(() => new Response(
  JSON.stringify({ ok: false, error: "store_identity_not_verified", expected_host: "dona-antonia-1.lojaintegrada.com.br" }),
  { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
));
