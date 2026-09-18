import fs from 'node:fs';
import assert from 'node:assert/strict';

const v1=fs.readFileSync('supabase/migrations/20260918210000_cm_1_7_product_brand_graph_v1.sql','utf8');
const v2=fs.readFileSync('supabase/migrations/20260918213000_cm_1_7_relation_precision_v2.sql','utf8');

assert.match(v1,/create table if not exists public\.product_relation_edges/);
for(const relation of ['SAME_LINE','COMPLEMENTARY','SUBSTITUTE','UPSELL','DOWNSELL','COMPATIBLE_BRAND','BOUGHT_TOGETHER']){
  assert.match(v1,new RegExp(relation),'missing relation '+relation);
}
assert.match(v1,/confidence numeric/);
assert.match(v1,/source_kind text/);
assert.match(v1,/relation_version/);
assert.match(v1,/evidence jsonb/);
assert.match(v1,/get_product_relations_v1/);
assert.match(v1,/review_product_relation_v1/);
assert.match(v1,/brand_relation_graph_v1/);
assert.match(v1,/product_relation_graph_summary_v1/);
assert.match(v1,/revoke all on table public\.product_relation_edges from public,anon,authenticated/);
assert.match(v1,/source_kind in \('rule','purchase','ai','human'\)/);
assert.match(v1,/when v_row\.relation_type='BOUGHT_TOGETHER'[\s\S]*pair_orders/s);
assert.match(v2,/operational_leaf/,'v2 must use operational leaf taxonomy for catalog relations');
assert.match(v2,/catalog_rule_v2/);
assert.match(v2,/order_cooccurrence_v2/);
assert.match(v2,/evidence_strength/,'purchase confidence must shrink on sparse evidence');
assert.match(v2,/reviewed_at is null[\s\S]*catalog_rule_v1/s,'precision cleanup must preserve reviewed relations');
assert.doesNotMatch(v1+v2,/openai|gpt-|gemini/i,'Product graph deterministic core must not require AI');
assert.doesNotMatch(v2,/lower\(s\.brand\)=lower\(t\.brand\)[\s\S]{0,180}SAME_LINE[\s\S]{0,180}s\.category=t\.category/i,
  'same-line must not rely only on broad category');
assert.match(v2,/s\.operational_leaf=t\.operational_leaf/,'substitute/line rules must require same operational leaf');

console.log('cm-1.7 product brand graph contract ok');
