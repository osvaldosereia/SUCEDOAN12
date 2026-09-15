import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const app=readFileSync('comprar/app.js','utf8');
const checkout=readFileSync('comprar/checkout.js','utf8');
const products=readFileSync('comprar/products.js','utf8');
const baskets=readFileSync('comprar/baskets.js','utf8');

assert.match(app,/async function renewRoom\(/,'app must provide one explicit fresh-room renewal path');
assert.match(app,/data\.closed===true/,'startup must detect a previously completed room');
assert.match(app,/await renewRoom\(\)/,'startup must renew a closed room instead of restoring its old cart');
assert.match(app,/history\.replaceState[\s\S]*[?&]s=/,'renewal must replace the stale room token in the browser URL');
assert.match(app,/async function ensureActiveRoom\(/,'shopping entry points must ensure an active room before continuing');
assert.match(app,/state\.session\?\.status===['"]closed['"]/,'active-room guard must detect a locally completed order');
assert.match(app,/state\.modules\.products\?\.resetForNewRoom/,'renewal must clear product quantities cached from the old cart');
assert.match(app,/state\.modules\.baskets\?\.resetForNewRoom/,'renewal must clear basket preview state from the old cart');
assert.match(app,/async function openAddProductsStage[\s\S]*ensureActiveRoom/,'adding products after checkout must renew the room before product APIs run');
assert.match(app,/async function openCheckout[\s\S]*ensureActiveRoom/,'reopening checkout after completion must not reuse a closed room');
assert.match(checkout,/app\.markOrderCompleted\(data\)/,'successful real confirmation must mark the current room completed locally');
assert.match(products,/function resetForNewRoom\(/,'products module must expose lifecycle reset for a new cart');
assert.match(products,/syncState\.clear\(\)/,'product reset must remove old optimistic quantities');
assert.match(baskets,/function resetForNewRoom\(/,'baskets module must expose lifecycle reset for a new cart');

console.log('comprar_closed_room_recovery_v1_ok');
