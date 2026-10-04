import assert from 'node:assert/strict';
import fs from 'node:fs';

const apiPath='supabase/functions/admin-whatsapp-ana-preview-v1/index.ts';
assert.equal(fs.existsSync(apiPath),true,'ANA preview API deve existir');
const api=fs.readFileSync(apiPath,'utf8');

assert.doesNotMatch(api,/\.rpc\([^;\n]+\)\.catch\s*\(/s,'Supabase RPC builder não deve usar .catch() diretamente');
assert.match(api,/let\s+requestDb\s*:\s*any\s*=\s*null|let\s+dbForCleanup\s*:\s*any\s*=\s*null/i,'request deve manter referência ao client autenticado para cleanup');
assert.match(api,/let\s+claimedJobId\s*:\s*string\s*\|\s*null\s*=\s*null/i,'request deve rastrear job reservado até finalização');
assert.match(api,/claimedJobId\s*=\s*jobId/,'job deve ser marcado como reservado imediatamente após validar o job_id');
assert.match(api,/catch\s*\(error\)[\s\S]*claimedJobId[\s\S]*finalizeFailedPreview\([\s\S]*ana_preview_internal_error/s,'exceção inesperada após start deve finalizar o job como failed imediatamente');
assert.match(api,/claimedJobId\s*=\s*null[\s\S]*return\s+json\(req,\{ok:true,dry_run:true,dry_run_not_sendable:true,job:/s,'claim deve ser liberado após finalização bem-sucedida');
assert.doesNotMatch(api,/sendText|sendMedia|attendance.*enqueue|outbox.*insert/i,'cleanup da prévia não pode introduzir outbound');
assert.match(api,/dry_run_not_sendable:true/,'contrato fail-closed da prévia deve permanecer explícito');

console.log('PASS test-whatsapp-ana-preview-claim-cleanup-v1');
