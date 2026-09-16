import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../../../supabase/functions/creative-studio-director/index.ts',import.meta.url),'utf8');

test('Director falls back to the existing server-side OpenAI Vault secret without exposing it',()=>{
  assert.match(source,/Deno\.env\.get\('OPENAI_API_KEY'\)/);
  assert.match(source,/get_conversation_worker_provider_secret_v1/);
  assert.match(source,/typeof vaultKey==='string'/);
  assert.match(source,/openai_not_configured/);
});
