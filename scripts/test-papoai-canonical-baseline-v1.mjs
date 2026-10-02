import assert from 'node:assert/strict';
import fs from 'node:fs';

const edgePath='supabase/functions/papo-external-agent-v1/index.ts';
const corePath='supabase/functions/_shared/whatsapp-core-v1.mjs';
assert.ok(fs.existsSync(edgePath),`${edgePath} deve existir`);
assert.ok(fs.existsSync(corePath),`${corePath} deve existir`);

const edge=fs.readFileSync(edgePath,'utf8');
assert.match(edge,/canonicalMessageFromPapoAi/,'bridge versionado deve importar normalizador canônico');
assert.match(edge,/mirrorCanonicalPapoAi/,'bridge versionado deve espelhar captura para histórico canônico');
assert.match(edge,/whatsapp_ingest_event_v1/,'bridge deve usar ingestão canônica idempotente');

console.log('OK · baseline canônico do bridge PapoAI está versionado.');
