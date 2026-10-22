import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { constantTimeEquals } from "../supabase/functions/admin-products-live-v1/internal-auth.mjs";

const root = new URL("../", import.meta.url);
const config = readFileSync(new URL("supabase/config.toml", root), "utf8");
const edge = readFileSync(new URL("supabase/functions/admin-products-live-v1/index.ts", root), "utf8");
const cron = readFileSync(new URL("supabase/sql/20260928_ops2_ean_verified_recovery_v1.sql", root), "utf8");

assert.equal(constantTimeEquals("secret-key-01", "secret-key-01"), true);
assert.equal(constantTimeEquals("secret-key-01", "secret-key-02"), false);
assert.equal(constantTimeEquals("a", "aa"), false);
assert.equal(constantTimeEquals("", ""), false);
assert.equal(constantTimeEquals("chave-á", "chave-á"), true);
assert.equal(constantTimeEquals("chave-á", "chave-a"), false);

assert.match(config, /\[functions\.admin-products-live-v1\]\s*verify_jwt\s*=\s*false/);
assert.match(edge, /import \{ constantTimeEquals \} from "\.\/internal-auth\.mjs"/);
const recoveryRoute = edge.indexOf('if(a==="ops2_recover_ean_verified"){');
const adminRoute = edge.indexOf("const auth:any=await adminAuth(r)");
assert.ok(recoveryRoute >= 0 && adminRoute > recoveryRoute, "the internal action must branch before user-JWT admin auth");
const recoveryAuth = edge.slice(recoveryRoute, adminRoute);
assert.match(recoveryAuth, /db\.rpc\("get_bling_hub_key_v2"\)/);
assert.match(recoveryAuth, /x-dona-antonia-bling-hub-key/);
assert.match(recoveryAuth, /constantTimeEquals\(provided,expected\.data\)/);
assert.doesNotMatch(recoveryAuth, /provided!==String\(expected\.data\)/);

const cronCall = cron.slice(cron.indexOf("admin-products-live-v1?action=ops2_recover_ean_verified"));
assert.match(cronCall, /x-dona-antonia-bling-hub-key/);
assert.match(edge, /ops2_ean_verified_sync_enabled!==true/);
assert.match(edge, /\.eq\("status","verified"\)\.not\("verified_at","is",null\)/);
assert.match(edge, /target_key:"verified",canary:false/);

console.log("Admin products OPS2 internal auth contract: PASS");
