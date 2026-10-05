import fs from 'node:fs';
import assert from 'node:assert/strict';

const ui=fs.readFileSync('vitrine/admin/kit-builder.js','utf8');
assert.match(ui,/data-kit-most-used/,'third column must expose most-used products');
assert.match(ui,/Produtos mais usados/,'third column must label the operational shortcut clearly');
assert.match(ui,/usage_count|uso em kits|kits usando/i,'most-used area must expose usage context');
assert.match(ui,/data-kit-most-used-add/,'most-used products must be addable directly to the draft');
assert.match(ui,/Kits salvos/,'saved kits must remain available to edit or use as a base');
console.log('kit builder most-used column v1: PASS');
