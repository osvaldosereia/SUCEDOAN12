import fs from 'node:fs';
import assert from 'node:assert/strict';

const path='vitrine/admin/kit-builder.js';
const ui=fs.readFileSync(path,'utf8');

assert.match(ui,/data-kit-chip-manage/,'catalog must expose search-term management');
assert.match(ui,/function renderChipManager\(/,'search-term manager renderer required');
assert.match(ui,/data-kit-chip-label/,'manager must edit chip label');
assert.match(ui,/data-kit-chip-query/,'manager must edit chip query');
assert.match(ui,/data-kit-chip-save/,'manager must save a chip');
assert.match(ui,/data-kit-chip-archive/,'manager must archive a chip');
assert.match(ui,/data-kit-chip-up/,'manager must move chip up');
assert.match(ui,/data-kit-chip-down/,'manager must move chip down');
assert.match(ui,/['"]chip_save['"]/,'chip save must use isolated kit API');
assert.match(ui,/['"]chip_archive['"]/,'chip archive must use isolated kit API');
assert.match(ui,/['"]chip_reorder['"]/,'chip reorder must use isolated kit API');
assert.match(ui,/function saveSearchChip\(/,'chip save behavior required');
assert.match(ui,/function archiveSearchChip\(/,'chip archive behavior required');
assert.match(ui,/function reorderSearchChip\(/,'chip reorder behavior required');

console.log('kit builder search chips ui v1: PASS');
