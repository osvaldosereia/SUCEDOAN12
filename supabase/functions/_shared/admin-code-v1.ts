export type AdminCodeStatus = "valid" | "invalid" | "not_configured";

export function verifyAdminCode(supplied: string | null): AdminCodeStatus {
  const expected = (Deno.env.get("DONA_ADMIN_CODE") || "").trim();
  if (expected.length < 32 || expected.length > 128) return "not_configured";
  if (typeof supplied !== "string" || supplied.length !== expected.length) return "invalid";

  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  }
  return mismatch === 0 ? "valid" : "invalid";
}
