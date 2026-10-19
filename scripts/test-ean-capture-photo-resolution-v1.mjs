import fs from "node:fs";
import assert from "node:assert/strict";

const page=fs.readFileSync("vitrine/admin/leitura-ean/index.html","utf8");
const migration=fs.readFileSync("supabase/migrations/20261019190000_ean_capture_resolution_v1.sql","utf8");

assert.ok(page.includes("width:min(92vw,460px)"),"photo viewer stays compact and centered");
assert.ok(page.includes('id="photoViewerAdd"'),"no-photo records offer capture from the modal");
assert.ok(page.includes("data-photo=\""),"missing photo action is rendered");
assert.ok(page.includes(">📷 Adicionar foto</button>"),"missing photo action is explicit");
assert.ok(page.includes("if(view){showSavedPhoto(view.dataset.viewPhoto);return}"),"saved image opens the viewer");
assert.ok(page.includes("if(row)openPhotoUploadViewer(row);return"),"adding a photo does not reveal the yellow page prompt");

const uploadStart=page.indexOf("async function uploadPhoto(file){");
const uploadEnd=page.indexOf('\n$("takePhoto").onclick',uploadStart);
assert.ok(uploadStart>=0&&uploadEnd>uploadStart,"upload handler exists");
const upload=page.slice(uploadStart,uploadEnd);
assert.ok(upload.indexOf("compressProductPhoto(file)")>=0,"all photo sources pass through compression");
assert.ok(upload.indexOf("compressProductPhoto(file)")<upload.indexOf('form.append("file"'),"compression happens before upload");
assert.ok(page.includes("for(const [maxEdge,quality] of [[1440,.80],[1280,.72],[1024,.64]])"),"large mobile images get progressively resized and recompressed");
assert.ok(page.includes("const limit=4*1024*1024"),"upload stays below the storage limit with headroom");

const resolveStart=page.indexOf("async function resolveRow(action,id,payload){");
const resolveEnd=page.indexOf('\n$("entries").addEventListener("click"',resolveStart);
assert.ok(resolveStart>=0&&resolveEnd>resolveStart,"resolution handler exists");
const resolve=page.slice(resolveStart,resolveEnd);
assert.ok(resolve.includes('action==="link_product"||action==="create_inactive"'),"linking and inactive creation share the found transition");
assert.ok(resolve.includes('filter="found";syncFilterButtons()'),"resolved products switch to the found filter");
assert.ok(resolve.includes("await load()"),"found list reloads from the server");
assert.ok(migration.includes("sync_status='found'"),"resolved EANs are stored as found");

const inlineStart=page.indexOf("<script defer>\n");
const inlineEnd=page.indexOf("</script>",inlineStart);
assert.ok(inlineStart>=0&&inlineEnd>inlineStart,"inline app script exists");
new Function(page.slice(inlineStart+"<script defer>\n".length,inlineEnd));
console.log("EAN photo modal, compression, and found-list transition: PASS");
