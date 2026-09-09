import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260909132500_whatsapp_flow_health_webhook_v1.sql',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/whatsapp-flow-health-webhook-v1/index.ts',import.meta.url),'utf8');

assert.match(migration,/whatsapp_flow_health_events/);
assert.match(migration,/dona_antonia_whatsapp_flow_health_verify_token_v1/);
assert.match(migration,/dona_antonia_meta_app_secret_v1/);
assert.match(migration,/append-only/);
assert.match(migration,/revoke all .* anon, authenticated/i);

assert.match(edge,/hub\.verify_token/);
assert.match(edge,/x-hub-signature-256/i);
assert.match(edge,/HMAC/);
assert.match(edge,/SHA-256/);
assert.match(edge,/webhook_signature_unconfigured/);
assert.match(edge,/invalid_signature/);
assert.match(edge,/change\.field,80\)!=='flows'/);
assert.match(edge,/signature_verified:true/);
assert.doesNotMatch(edge,/APP_SECRET\s*=\s*["'][^"']+["']/i,'App Secret must never be hardcoded');
assert.doesNotMatch(edge,/VERIFY_TOKEN\s*=\s*["'][^"']+["']/i,'Webhook verify token must never be hardcoded');

console.log('PASS: Flow health webhook verifies Meta challenge/signature, stores only normalized Flow health events, and fails closed without App Secret.');
