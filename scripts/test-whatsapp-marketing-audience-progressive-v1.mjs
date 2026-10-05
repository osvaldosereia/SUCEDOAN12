import assert from 'node:assert/strict';
import fs from 'node:fs';

const polish=fs.readFileSync('vitrine/admin/marketing/marketing-polish.js','utf8');
const audience=fs.readFileSync('vitrine/admin/marketing/audience-center.js','utf8');

for(const basic of ['search','city','neighborhood','label_ids'])assert.ok(audience.includes(`name="${basic}"`),`filtro básico ${basic} deve continuar disponível`);
for(const advanced of ['brand','category','product_ids','last_purchase_after','last_purchase_before','inactive_days','min_order_count','max_order_count','min_lifetime_value','max_lifetime_value'])assert.match(polish,new RegExp(`['"]${advanced}['"]`),`${advanced} deve estar no grupo avançado`);
assert.match(polish,/data-marketing-pro-advanced/,'grupo avançado deve usar details dedicado');
assert.ok(polish.includes('Mais filtros'),'grupo avançado deve se chamar Mais filtros');
assert.doesNotMatch(polish,/ADVANCED_FILTERS=\[[^\]]*['"]search['"]/,'Cliente deve ficar visível');
assert.doesNotMatch(polish,/ADVANCED_FILTERS=\[[^\]]*['"]city['"]/,'Cidade deve ficar visível');
assert.doesNotMatch(polish,/ADVANCED_FILTERS=\[[^\]]*['"]neighborhood['"]/,'Bairro deve ficar visível');
assert.doesNotMatch(polish,/ADVANCED_FILTERS=\[[^\]]*['"]label_ids['"]/,'Etiquetas devem ficar visíveis');
console.log('marketing audience progressive contract: ok');
