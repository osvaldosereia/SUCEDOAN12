import fs from 'node:fs';
import assert from 'node:assert/strict';
// Mirrored modules have distinct Edge Function deployment roots. Keep exact parity
// rather than deleting a copy and risking a Deno import/deployment regression.
const pairs=[
  ['_shared/papoai-ai-planner-v1.mjs','admin-service-intelligence-v1/_shared/papoai-ai-planner-v1.mjs'],
  ['_shared/papoai-commerce-intent-v1.mjs','admin-service-intelligence-v1/_shared/papoai-commerce-intent-v1.mjs'],
  ...[
    'index.ts','xml-catalog-comparison.mjs','xml-catalog-extractor.mjs',
    'xml-catalog-field-apply-gateway.mjs','xml-catalog-field-review-gateway.mjs',
    'xml-catalog-fiscal-dossier.mjs','xml-catalog-full-comparison.mjs','xml-catalog-ingest-guard.mjs'
  ].map(name=>['purchase-xml-v1/'+name,'admin-service-intelligence-v1/purchase-xml-v1/'+name])
];
for(const [left,right] of pairs){
  const first='supabase/functions/'+left,second='supabase/functions/'+right;
  assert.ok(fs.existsSync(first)&&fs.existsSync(second),'mirrored Edge module missing: '+left);
  assert.equal(fs.readFileSync(first,'utf8'),fs.readFileSync(second,'utf8'),'Edge deployment mirror drift: '+left);
}
console.log('Admin Edge deployment mirrors: PASS ('+pairs.length+' exact pairs)');
