import fs from "node:fs";
import assert from "node:assert/strict";

const page=fs.readFileSync("vitrine/admin/leitura-ean/index.html","utf8");
const migration=fs.readFileSync("supabase/migrations/20261019190000_ean_capture_resolution_v1.sql","utf8");

assert.match(page,/width:min\\(92vw,460px\\)/,"photo viewer stays compact and centered");
assert.match(page,/id="photoViewerAdd"/,"no-photo records offer capture from the modal");
assert.match(page,/data-photo="\\x27\\+esc\\(r\\.id\\)\\+\\x27">📷 Adicionar foto/,"missing photo action is explicit");
assert.match(page,/if\\(view\\)\\{showSavedPhoto\\(view\\.dataset\\.viewPhoto\\);return\\}/,"saved image opens the viewer");
assert.match(page,/if\\(row\\)openPhotoUploadViewer\\(row\\);return/,"adding a photo does not reveal the yellow page prompt");

const upload=page.slice(page.indexOf("async function uploadPhoto(file){"),page.indexOf('\\n$("takePhoto").onclick',page.indexOf("async function uploadPhoto(file){")));
assert.ok(upload.indexOf("compressProductPhoto(file)")>=0,"all photo sources pass through compression");
assert.ok(upload.indexOf("compressProductPhoto(file)")<upload.indexOf('form.append("file"'),"compression happens before upload");
assert.match(page,/for\\(const \\[maxEdge,quality\\] of \\[\\[1440,\\.80\\],\\[1280,\\.72\\],\\[1024,\\.64\\]\\]\\)/,"large mobile images get progressively resized and recompressed");
assert.match(page,/const limit=4\\*1024\\*1024/,"upload stays below the storage limit with headroom");

const resolve=page.slice(page.indexOf("async function resolveRow(action,id,payload){"),page.indexOf('\\n$("entries").addEventListener("click"',page.indexOf("async function resolveRow(action,id,payload){")));
assert.match(resolve,/action==="link_product"\\|\\|action==="create_inactive"/,"linking and inactive creation share the found transition");
assert.match(resolve,/filter="found";syncFilterButtons\\(\\)/,"resolved products switch to the found filter");
assert.match(resolve,/await load\\(\\)/,"found list reloads from the server");

assert.match(migration,/sync_status='found'/,"resolved EANs are stored as found");
const scripts=[...page.matchAll(/<script defer>([\\s\\S]*?)<\\/script>/g)];
assert.ok(scripts.length,"inline app script exists");
new Function(scripts.at(-1)[1]);
console.log("EAN photo modal, compression, and found-list transition: PASS");
