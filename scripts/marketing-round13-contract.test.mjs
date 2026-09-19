import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./marketing-round13-learning-planner-v2.mjs', import.meta.url), 'utf8');
const forbidden = [
  'fetch(', 'axios', 'supabase.', '.insert(', '.update(', '.delete(',
  'openai', 'anthropic', 'gemini', 'publish(', 'schedule(', 'setInterval(', 'setTimeout('
];
for (const token of forbidden) assert.equal(source.toLowerCase().includes(token.toLowerCase()), false, `forbidden side-effect token: ${token}`);
for (const required of ['dry_run', 'NO_ACTION', 'draftGate', 'wouldCreateDraft', 'wouldSchedule', 'wouldPublish', 'aiUsed', 'externalSideEffect']) {
  assert.equal(source.includes(required), true, `missing safety marker: ${required}`);
}
console.log('marketing round13 zero-side-effect contract: ok');
