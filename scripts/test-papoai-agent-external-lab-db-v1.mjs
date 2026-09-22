import fs from 'node:fs';
import assert from 'node:assert/strict';
const path='supabase/migrations/20260921205947_papoai_agent_external_lab_core_v1.sql';
assert.ok(fs.existsSync(path),'migration must exist');
const sql=fs.readFileSync(path,'utf8');
for(const token of [
  'channel_provider_capability_evidence',
  'channel_provider_agent_labs',
  'channel_provider_agent_lab_sessions',
  'channel_provider_agent_lab_calls',
  'get_papoai_agent_external_lab_key_v1',
  'set_channel_provider_capability_state_v1',
  'get_papoai_agent_external_lab_config_v1',
  'set_papoai_agent_external_lab_enabled_v1',
  'dona_antonia_papoai_agent_external_lab_key_v1'
]) assert.match(sql,new RegExp(token),`missing ${token}`);
assert.match(sql,/enabled boolean not null default false/);
assert.match(sql,/agent_external\.request/);
assert.match(sql,/'observed_ui'/);
assert.match(sql,/campaign\.create/);
assert.match(sql,/vault\.create_secret/);
assert.match(sql,/vault\.decrypted_secrets/);
assert.match(sql,/capability_transition_not_allowed/);
assert.match(sql,/enable row level security/g);
assert.doesNotMatch(sql,/OPENAI_API_KEY|openai|gpt-|gemini/i);
console.log('PASS: PapoAI Agent External migration structure');
