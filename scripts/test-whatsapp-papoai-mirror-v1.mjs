import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'..');
const fnPath=path.join(root,'supabase/functions/papo-external-agent-v1/index.ts');
const backfillPath=path.join(root,'supabase/sql/20261001_whatsapp_papoai_backfill_v1.sql');
assert.ok(fs.existsSync(fnPath),'PapoAI bridge must exist');
const src=fs.readFileSync(fnPath,'utf8');

assert.match(src,/from\s+"\.\.\/_shared\/whatsapp-core-v1\.mjs"/,'bridge must consume provider-neutral normalizer');
assert.match(src,/async\s+function\s+mirrorCanonicalPapoAi\s*\(/,'mirror helper required');
assert.match(src,/db\.rpc\("whatsapp_ingest_event_v1"/,'mirror must ingest through canonical RPC');
assert.match(src,/canonicalMessageFromPapoAi\s*\(/,'mirror must use canonical PapoAI normalizer');
assert.match(src,/console\.error\("papoai_canonical_mirror"/,'mirror errors must be logged');
assert.doesNotMatch(src,/return\s+json\(\{ok:false,error:"canonical_mirror/i,'mirror failure must never fail current PapoAI webhook');
assert.match(src,/version:108/,'existing public health version must remain unchanged during shadow mirror');
const legacyPos=src.indexOf('papoai_ensure_conversation_v2');
const mirrorCallPos=src.lastIndexOf('await mirrorCanonicalPapoAi');
assert.ok(legacyPos>=0&&mirrorCallPos>legacyPos,'canonical mirror must run after legacy conversation processing');

assert.ok(fs.existsSync(backfillPath),'safe PapoAI backfill SQL required');
const backfill=fs.readFileSync(backfillPath,'utf8');
assert.match(backfill,/metadata->>'whatsapp_account_id'/,'backfill must use legacy authoritative account binding');
assert.match(backfill,/metadata->>'conversation_id'/,'backfill must require legacy conversation binding');
assert.match(backfill,/event_name\s*=\s*'message\.received'/,'message backfill must be restricted to received messages');
assert.match(backfill,/whatsapp_ingest_event_v1/i,'backfill must use canonical idempotent RPC');
assert.doesNotMatch(backfill,/phone_to.*like|phone_to.*substring|right\s*\(.*phone/i,'backfill must not guess business account from phone suffix');

console.log('PASS PapoAI canonical mirror contract');
