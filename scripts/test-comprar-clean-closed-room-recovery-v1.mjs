import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const app=readFileSync('comprar/app.js','utf8');

assert.match(app,/async function renewRoom\(/,'app must provide one explicit fresh-room renewal path');
assert.match(app,/data\.closed===true/,'startup must detect a previously completed room');
assert.match(app,/await renewRoom\(params\.get\('resume'\)\|\|'start'\)/,'startup must renew a closed room instead of restoring its old cart');
assert.match(app,/history\.replaceState[\s\S]*roomUrl\(token\)/,'new room creation must replace the stale room token in the browser URL');
assert.match(app,/location\.replace\(roomUrl\(nextToken,resume\)\)/,'renewal must reload the page so no old cart/module state survives');
assert.match(app,/async function ensureActiveRoom\(/,'shopping entry points must ensure an active room before continuing');
assert.match(app,/state\.session\?\.status===['"]closed['"]/,'active-room guard must detect a locally completed order');
assert.match(app,/async function openAddProductsStage[\s\S]*ensureActiveRoom\('products'\)/,'adding products after checkout must renew and resume directly in products');
assert.match(app,/async function openCheckout[\s\S]*ensureActiveRoom\('start'\)/,'reopening checkout after completion must not reuse a closed room');
assert.match(app,/const data=await checkoutApi\('confirm_order',payload\);[\s\S]*markOrderCompleted\(data\)/,'successful real confirmation must mark the current room completed locally');
assert.match(app,/function markOrderCompleted[\s\S]*status:'closed'[\s\S]*current_view:'success'/,'completed order must make the local session visibly closed');
assert.match(app,/\.stage:not\(\.checkout-stage\)/,'completed order must remove stale shopping stages while keeping the success stage');
assert.match(app,/resume==='products'[\s\S]*openAddProductsStage/,'fresh room must honor the product-resume intent after reload');

console.log('comprar_clean_closed_room_recovery_v1_ok');
