import fs from 'node:fs';
import assert from 'node:assert/strict';

const ui=fs.readFileSync('vitrine/admin/kit-builder.js','utf8');
for(const marker of ['data-kit-column="kits"','data-kit-column="draft"','data-kit-column="products"']){
  assert.ok(ui.includes(marker),`missing master-detail column ${marker}`);
}
assert.match(ui,/Kits internos/,'left column must be dedicated to kit navigation');
assert.match(ui,/data-kit-nav-card/,'saved kits must be selectable as navigation cards');
assert.match(ui,/Editando:/,'editor must clearly identify the current kit');
assert.doesNotMatch(ui,/data-kit-column="saved"/,'legacy mixed shortcuts column must be removed');
assert.doesNotMatch(ui,/>Kits salvos</,'saved kits must not be buried below product shortcuts');
assert.match(ui,/max-height\s*:\s*calc\(100vh/i,'desktop workspace must be viewport bounded');
assert.match(ui,/overflow\s*:\s*auto/,'columns must support independent scrolling');
console.log('kit builder master-detail navigation v1: PASS');
