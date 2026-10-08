import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const manifest=JSON.parse(fs.readFileSync('vitrine/admin/manifest.webmanifest','utf8'));
const worker=fs.readFileSync('vitrine/admin/sw.js','utf8');
const icon=fs.readFileSync('vitrine/admin/delivery-icon.svg','utf8');

assert.match(html, /href="\.\/manifest\.webmanifest"/);
assert.match(html, /serviceWorker\.register\('\.\/sw\.js'/);
assert.equal(manifest.display,'standalone');
assert.equal(manifest.scope,'./');
assert.equal(manifest.start_url,'./');
assert.equal(manifest.icons[0].src,'./delivery-icon.svg');
assert.match(icon, /<svg/);
assert.match(worker, /skipWaiting/);
assert.match(worker, /clients\.claim/);
assert.doesNotMatch(worker, /caches\.open|cache\.put|respondWith|indexedDB|localStorage/i);
console.log('Smart Delivery PWA installation and no-private-cache checks: OK');
