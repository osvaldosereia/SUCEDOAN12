import fs from 'node:fs';
const html=fs.readFileSync('vitrine/admin/index.html','utf8');
function must(cond,msg){if(!cond)throw new Error(msg)}
must(html.includes('INVENTORY_SCRIPT_TIMEOUT_MS'),'missing external-script timeout');
must(html.includes('INVENTORY_SHEET_READ_TIMEOUT_MS'),'missing per-photo read timeout');
must(/function inventorySheetLoadScript\([\s\S]*?setTimeout\([\s\S]*?INVENTORY_SCRIPT_TIMEOUT_MS/.test(html),'script loader has no timeout');
must(html.includes('Tempo limite ao carregar'),'script timeout must be explicit');
must(/inventorySheetWithTimeout\(inventorySheetReadLocal\(entry\.file,status\)/.test(html),'A4 local read is not bounded');
must(html.includes('A leitura desta foto demorou demais'),'A4 timeout must surface a clear retryable error');
console.log('balance A4 timeout contract OK');
