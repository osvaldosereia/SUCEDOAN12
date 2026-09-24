import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260924182000_mt_st_classifier_r0_3.sql','utf8');

assert.match(sql,/ncm_prefix text/);
assert.match(sql,/match_mode in \('exact','prefix'\)/);
assert.match(sql,/fiscal_rule_description_matches_v1/);
assert.match(sql,/product_fiscal_rule_candidates_v1/);
assert.match(sql,/refresh_product_fiscal_candidates_r0_3/);
assert.match(sql,/st_status='candidate'/);
assert.match(sql,/classification_source='supplier_xml\+mt_legal_rule'/);
assert.match(sql,/validated_profiles',0/);
assert.match(sql,/status in \('draft','active'\)/);
assert.match(sql,/cest=c\.cest_consensus/);
assert.match(sql,/left\(c\.ncm_consensus,length\(r\.ncm_prefix\)\)=r\.ncm_prefix/);
assert.match(sql,/description_matches/);
assert.doesNotMatch(sql,/update public\.products/i);
assert.doesNotMatch(sql,/pedidos\/vendas/i);
assert.doesNotMatch(sql,/bling/i);

console.log('OK MT ST classifier R0.3');
