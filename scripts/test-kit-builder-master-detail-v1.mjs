import fs from 'node:fs';
import assert from 'node:assert/strict';

const ui=fs.readFileSync('vitrine/admin/kit-builder.js','utf8');

for(const marker of ['data-kit-column="kits"','data-kit-column="draft"','data-kit-column="products"']){
  assert.ok(ui.includes(marker),`missing master-detail column ${marker}`);
}

assert.match(ui,/Kits internos/,'left column must be dedicated to saved kit navigation');
assert.match(ui,/data-kit-nav-card/,'saved kits must be selectable as navigation cards');
assert.match(ui,/class="[^"]*active[^"]*"[^>]*data-kit-nav-card|data-kit-nav-card[^>]*class="[^"]*active/i,'selected kit must have an active visual state');
assert.match(ui,/loadKit\(/,'selecting a kit must load it into the editor');
assert.match(ui,/Editando:/,'editor must clearly identify the kit currently being edited');
assert.doesNotMatch(ui,/data-kit-column="saved"/,'legacy mixed saved/shortcuts column must be removed');
assert.doesNotMatch(ui,/>Kits salvos</,'saved kits must not be buried under the product shortcuts column');
assert.match(ui,/overflow\s*:\s*auto/,'workspace columns must support independent scrolling');
assert.match(ui,/max-height\s*:\s*calc\(100vh/i,'desktop workspace must be viewport-bounded to avoid global-page scrolling');
assert.match(ui,/data-kit-new/,'left navigation must keep a clear new-kit action');
assert.match(ui,/data-kit-search/,'product search must remain available in the right product column');

console.log('kit builder master-detail UX v1: PASS');
