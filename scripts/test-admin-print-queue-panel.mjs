import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const src=fs.readFileSync('vitrine/admin/components/print-queue-panel.js','utf8');
assert.ok(html.includes('/vitrine/admin/components/print-queue-panel.js?v=refactor-20261018'));
assert.match(html,/DonaAntoniaAdminPrintQueuePanel\.createPrintQueuePanel\(state,esc,orderDisplayCode\)/);
assert.match(html,/state\.opsPrintQueue=printData\?\.queue\|\|null/);
assert.match(html,/body\.innerHTML=renderOpsPrintQueue\(\)/);
assert.match(html,/\[data-print-order\]/);
const ctx={window:{},String,Array,Object};
vm.runInNewContext(src,ctx);
const state={orders:[{id:'o1',order_number:'321'}],opsPrintQueue:{jobs:[]}};
const render=ctx.window.DonaAntoniaAdminPrintQueuePanel.createPrintQueuePanel(state,v=>String(v),o=>o?.order_number||'—').renderOpsPrintQueue;
assert.equal(render(),'');
state.opsPrintQueue.jobs=[{status:'completed',entity_id:'o1'}];
assert.equal(render(),'');
state.opsPrintQueue.jobs=[{status:'pending',entity_id:'o1',printer_profile:'85 mm'},{status:'failed',entity_id:'o1',last_error:'Sem papel'},{status:'claimed',entity_id:'o1'}];
const out=render();
assert.match(out,/Fila de impressão/);
assert.match(out,/homologação/);
assert.match(out,/Separação · #321/);
assert.match(out,/Falhou/);
assert.match(out,/Sem papel/);
assert.match(out,/data-print-order="o1"/);

state.orders=null;
state.opsPrintQueue.jobs=[null,{status:'pending',entity_id:'missing'}];
assert.match(render(),/Abrir pedido/);
state.opsPrintQueue.jobs=Array.from({length:12},()=>({status:'pending',entity_id:'missing'}));
assert.equal(render().split('data-print-order=').length-1,8);
state.opsPrintQueue.jobs=[null,{status:'unknown'}];
assert.equal(render(),'');
// Verify HTML escaping at every data-driven rendering boundary.
const escapeHtml=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const secureState={orders:[{id:'x',order_number:'<script>bad</script>'}],opsPrintQueue:{jobs:[{status:'failed',entity_id:'x',printer_profile:'<img src=x>',last_error:'<b>erro</b>'}]}};
const secureRender=ctx.window.DonaAntoniaAdminPrintQueuePanel.createPrintQueuePanel(secureState,escapeHtml,o=>o?.order_number||'—').renderOpsPrintQueue;
const safeHtml=secureRender();
assert.ok(safeHtml.includes('&lt;script&gt;bad&lt;/script&gt;'));
assert.ok(safeHtml.includes('&lt;img src=x&gt;'));
assert.ok(safeHtml.includes('&lt;b&gt;erro&lt;/b&gt;'));
assert.ok(!safeHtml.includes('<script>'));
assert.ok(!safeHtml.includes('<img src=x>'));
// The panel is read-only: rendering must not change queue data or order records.
const immutableJobs=[{status:'pending',entity_id:'o1',printer_profile:'85 mm'}];
const immutableOrders=[{id:'o1',order_number:'321'}];
const readOnlyState={orders:immutableOrders,opsPrintQueue:{jobs:immutableJobs}};
const readOnlyRender=ctx.window.DonaAntoniaAdminPrintQueuePanel.createPrintQueuePanel(readOnlyState,escapeHtml,o=>o?.order_number||'—').renderOpsPrintQueue;
readOnlyRender();
assert.equal(immutableJobs[0].status,'pending');
assert.equal(immutableJobs.length,1);
assert.equal(immutableOrders[0].order_number,'321');
assert.equal(readOnlyState.opsPrintQueue.jobs,immutableJobs);
assert.equal(readOnlyState.orders,immutableOrders);
// Loading and malformed queue payloads should show no jobs.
readOnlyState.opsPrintQueue=null;
assert.equal(readOnlyRender(),'');
readOnlyState.opsPrintQueue={jobs:null};
assert.equal(readOnlyRender(),'');
readOnlyState.opsPrintQueue={jobs:'invalid'};
assert.equal(readOnlyRender(),'');
// Attribute values must also be escaped, not only visible text.
const attributeState={orders:[],opsPrintQueue:{jobs:[{status:'pending',entity_id:'x" onclick="alert(1)'}]}};
const attributeRender=ctx.window.DonaAntoniaAdminPrintQueuePanel.createPrintQueuePanel(attributeState,escapeHtml,()=> '—').renderOpsPrintQueue;
const attributeHtml=attributeRender();
assert.ok(attributeHtml.includes('data-print-order="x&quot; onclick=&quot;alert(1)"'));
assert.ok(!attributeHtml.includes('data-print-order="x" onclick='));
// Status transitions must hide terminal jobs while retaining active jobs in source order.
state.orders=[{id:'o1',order_number:'321'}];
state.opsPrintQueue.jobs=[{status:'completed',entity_id:'done'},{status:'pending',entity_id:'o1'},{status:'cancelled',entity_id:'cancel'},{status:'failed',entity_id:'o1'}];
const activeHtml=render();
assert.equal(activeHtml.split('data-print-order=').length-1,2);
assert.ok(activeHtml.indexOf('Aguardando')<activeHtml.indexOf('Falhou'));
assert.ok(!activeHtml.includes('data-print-order="done"'));
assert.ok(!activeHtml.includes('data-print-order="cancel"'));
// A malformed order entry must not prevent resolving a subsequent matching order.
state.orders=[null,{id:'o1',order_number:'321'}];
state.opsPrintQueue.jobs=[{status:'claimed',entity_id:'o1'}];
assert.match(render(),/Separação · #321/);
assert.match(render(),/Em impressão/);
// Queue with no active jobs must not render an empty section.
state.opsPrintQueue.jobs=[{status:'completed',entity_id:'o1'},{status:'cancelled',entity_id:'o1'}];
assert.equal(render(),'');
// The renderer may be constructed before the Admin state is initialized.
const uninitialized=ctx.window.DonaAntoniaAdminPrintQueuePanel.createPrintQueuePanel(null,escapeHtml,()=> '—').renderOpsPrintQueue;
assert.equal(uninitialized(),'');
console.log('Admin print queue panel: PASS');
