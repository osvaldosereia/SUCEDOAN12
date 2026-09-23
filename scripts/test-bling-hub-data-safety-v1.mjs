import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');

assert.match(hub,/function blingHubProviderDetails\(data:any\)/);
assert.match(hub,/x\?\.element/);
assert.match(hub,/x\?\.msg/);
assert.match(hub,/function blingHubSuspiciousPersonName\(local:any\)/);
assert.match(hub,/doc\.length!==11/);
assert.match(hub,/locationPrefixes=new Set\(\["jd","jardim","bairro","setor","residencial","condominio"/);
assert.match(hub,/currentName&&blingHubSuspiciousPersonName\(local\)/);
assert.match(hub,/provider_error:write\.provider_error\|\|null/);
assert.match(hub,/provider_error:clean\(JSON\.stringify\(data\?\.error\|\|data\|\|\{\}\),1600\)/);

console.log('OK · Bling Hub protege nome de pessoa e preserva validações');
