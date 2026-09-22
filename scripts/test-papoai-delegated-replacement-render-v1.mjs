import fs from 'node:fs';
import assert from 'node:assert/strict';

const edge=fs.readFileSync('supabase/functions/papo-external-agent-v1/index.ts','utf8');

assert.match(edge,/function\s+replacementOptionText\s*\(option:any\)/,'replacement renderer helper must be defined');
assert.ok(edge.includes("return text||'uma opção equivalente';"),'renderer must have a safe fallback');
assert.ok(edge.includes('replacementOptionText(option)'), 'delegated replacement confirmation must use the renderer');

console.log('PASS: PapoAI delegated replacement renderer is defined');
