import fs from 'node:fs';
import assert from 'node:assert/strict';

const index=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const planner=fs.readFileSync('supabase/functions/_shared/papoai-ai-planner-v1.mjs','utf8');
const commerce=fs.readFileSync('supabase/functions/_shared/papoai-commerce-intent-v1.mjs','utf8');

assert.match(index,/\.\.\/_shared\/papoai-ai-planner-v1\.mjs/);
assert.match(index,/\.\.\/_shared\/papoai-commerce-intent-v1\.mjs/);
assert.match(planner,/export function normalizePapoAiCommercialPlan/);
assert.match(planner,/export async function planPapoAiTurn|export function planPapoAiTurn/);
assert.match(commerce,/export async function contextualCommerceIntent|export function contextualCommerceIntent/);
assert.match(commerce,/export function deterministicCommerceIntent/);
assert.match(commerce,/export async function classifyCommerceIntent|export function classifyCommerceIntent/);
assert.ok(planner.length>9000,'planner compartilhado parece incompleto');
assert.ok(commerce.length>20000,'commerce intent compartilhado parece incompleto');

console.log('OK · módulos compartilhados do Hub versionados');
