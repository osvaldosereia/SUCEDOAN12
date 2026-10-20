import fs from "node:fs";
import assert from "node:assert/strict";

const page=fs.readFileSync("vitrine/admin/leitura-ean/index.html","utf8");
const edgeFunction=fs.readFileSync("supabase/functions/admin-ean-capture-v1/index.ts","utf8");
const migration=fs.readFileSync("supabase/migrations/20261019190000_ean_capture_resolution_v1.sql","utf8");

assert.ok(page.includes("width:min(92vw,460px)"),"photo viewer stays compact and centered");
assert.ok(page.includes('id="photoViewerAdd"'),"no-photo records offer capture from the modal");
assert.ok(page.includes("data-photo=\""),"missing photo action is rendered");
assert.ok(page.includes(">📷 Adicionar foto</button>"),"missing photo action is explicit");
assert.ok(page.includes("if(view){showSavedPhoto(view.dataset.viewPhoto);return}"),"saved image opens the viewer");
assert.ok(page.includes("if(row)openPhotoUploadViewer(row);return"),"adding a photo does not reveal the yellow page prompt");
assert.ok(page.includes('id="eanValue"'),"saved readings expose an editable EAN field");
assert.ok(page.includes("ean,quantity:n,expires_on"),"editing a reading sends the new EAN to the server");
assert.ok(page.includes('data-delete="'),"each saved reading exposes a delete action");
assert.ok(page.includes('call("delete",{id:row.id})'),"delete action reaches the protected API");
assert.ok(edgeFunction.includes('if(action==="delete")'),"API implements authenticated deletion");
assert.ok(edgeFunction.includes('if(eanChanged)Object.assign(patch,{ean:input.ean,matched_product_id:null,sync_status:"pending",synced_at:null'),"changing an EAN clears the old match and queues a fresh sync");
assert.ok(page.includes("async function startHtml5Camera(deviceId="),"camera works without BarcodeDetector using the bundled reader");
assert.ok(page.includes("await scanner.start(camera")&&page.includes('facingMode:"environment"'),"fallback starts the rear camera");
assert.ok(page.includes("function showProductPhoto(url,name){"),"found product photos can open in the centered viewer");
assert.ok(page.includes("data-product-photo="),"found products with an image expose an enlarge action");

const uploadStart=page.indexOf("async function uploadPhoto(file){");
const uploadEnd=page.indexOf('\n$("takePhoto").onclick',uploadStart);
assert.ok(uploadStart>=0&&uploadEnd>uploadStart,"upload handler exists");
const upload=page.slice(uploadStart,uploadEnd);
assert.ok(upload.indexOf("compressProductPhoto(file)")>=0,"all photo sources pass through compression");
assert.ok(upload.indexOf("compressProductPhoto(file)")<upload.indexOf('form.append("file"'),"compression happens before upload");
assert.ok(page.includes("const attempts=[[1600,.82],[1440,.80],[1280,.78],[1120,.76],[1024,.74],[960,.72],[896,.70],[832,.68],[768,.66],[704,.64],[640,.62],[576,.60],[512,.58],[448,.56],[384,.54],[320,.52]]"),"large mobile images get progressively resized and recompressed");
assert.ok(page.includes("const limit=100*1024"),"compressed image is capped at 100 KB");
assert.ok(page.includes('canvas.toBlob(resolve,"image/webp",quality)'),"WebP is tried first for compact output");
assert.ok(page.includes('blob.size<=limit'),"upload only returns files within the byte limit");
assert.ok(page.includes('msg("Compactando a foto para até 100 KB…")'),"user sees the compression target");

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
console.log("EAN photo modal, edit, delete, compression, and found-list transition: PASS");
