import fs from 'node:fs';
import assert from 'node:assert/strict';

const edge=fs.readFileSync('supabase/functions/inventory-product-research-v1/index.ts','utf8');

for(const token of [
  'KNOWLEDGE_VERSION',
  'knowledge_drain',
  'product_knowledge_config',
  'claim_product_knowledge_enrichment_jobs_v1',
  'researchKnowledge',
  'identity_confirmed',
  'enrichment_status:trusted?"researched":"review_required"',
  'description_filled',
  'body?.event!=="drain"'
]) assert.ok(edge.includes(token),'missing '+token);

assert.ok(edge.includes('!cfg?.enabled||!cfg?.web_research_enabled||!cfg?.ai_enrichment_enabled'));
assert.ok(edge.includes('event:"knowledge_drain",disabled:true'));
assert.ok(edge.includes('event:"drain"') || edge.includes('body?.event!=="drain"'));

console.log('PASS: inventory product research knowledge drain remains gated and legacy drain preserved');
