import assert from 'node:assert/strict';
import fs from 'node:fs';

const edgePath='supabase/functions/admin-whatsapp-ana-customer-profile-v1/index.ts';
const configPath='supabase/config.toml';
assert.equal(fs.existsSync(edgePath),true,'Edge de extração cadastral da ANA deve existir');

const edge=fs.readFileSync(edgePath,'utf8');
const config=fs.readFileSync(configPath,'utf8');

for(const token of [
  'ana-customer-profile-policy-v1.mjs',
  'ops2_admin_ana_customer_profile_context_v1',
  'customer_profile_extraction_runs_v1',
  'customer_profile_suggestions_v1',
  'snapshot_key',
  'evidence_message_ids',
  'ambiguous_phone',
  'admin_session_invalid',
  'extract',
  'list'
]) assert.match(edge,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),`Edge deve conter ${token}`);

assert.match(edge,/auth\.getUser\(/,'Edge deve validar bearer Admin server-side');
assert.match(edge,/allowedEvidence|allowed_evidence|evidenceSet|evidence_set/i,'Edge deve validar evidence IDs contra contexto');
assert.match(edge,/snapshotKey|snapshot_key/i,'Edge deve deduplicar a mesma fotografia da conversa');
assert.match(edge,/if\s*\([^)]*ambiguous_phone|error\s*===\s*["']ambiguous_phone["']/i,'telefone ambíguo deve abortar antes do modelo');

for(const forbidden of [
  '.from("customers").update',
  ".from('customers').update",
  '.from("customer_addresses").insert',
  ".from('customer_addresses').insert",
  '.from("customer_emails").insert',
  ".from('customer_emails').insert"
]) assert.equal(edge.includes(forbidden),false,`Fase 1 não pode gravar cadastro canônico: ${forbidden}`);

assert.match(config,/\[functions\.admin-whatsapp-ana-customer-profile-v1\][\s\S]*verify_jwt\s*=\s*true/i,'nova Edge deve exigir JWT no gateway');

console.log('ANA customer profile API contract OK');
