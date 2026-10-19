// Validate the real HTML load order of the extracted classic-script modules.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const html=fs.readFileSync(path.join(root,'vitrine/admin/index.html'),'utf8');
const tags=[...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/g)];
const scripts=tags.map(m=>({tag:m[0],url:m[1],path:m[1].split('?')[0].replace(/^\//,'')}));
const admin=scripts.filter(s=>s.path.startsWith('vitrine/admin/'));
if(admin.length!==20)throw new Error('Expected 20 ordered Admin classic scripts; got '+admin.length);
const paths=admin.map(s=>s.path);
if(new Set(paths).size!==paths.length)throw new Error('Duplicate Admin script include');
for(const item of admin){
 if(/\b(?:async|defer|type\s*=\s*["']module["'])\b/i.test(item.tag))throw new Error('Unexpected async/module loading: '+item.path);
 if(!fs.existsSync(path.join(root,item.path)))throw new Error('Missing Admin module: '+item.path);
}
const runtime='vitrine/admin/admin-runtime.js';
const runtimeIndex=paths.indexOf(runtime);
if(runtimeIndex<0||runtimeIndex!==17)throw new Error('Admin runtime load position changed');
const expectedPreloads=[
 'core/formatters.js','core/identifiers.js','core/errors.js',
 'components/printing.js','marketing/helpers.js','orders/sorting.js',
 'orders/read-model.js','components/today-cards.js','orders/time.js',
 'orders/search.js','orders/whatsapp-links.js','orders/action-buttons.js',
 'orders/contact-actions.js','components/expiry-alert.js',
 'components/ops-attention.js','components/print-queue-panel.js',
 'basket-lot-image.js'
].map(s=>'vitrine/admin/'+s);
if(JSON.stringify(paths.slice(0,runtimeIndex))!==JSON.stringify(expectedPreloads))
 throw new Error('Admin provider order drift before runtime initialization');
const names=new Map();
for(const [index,item] of admin.entries()){
 const source=fs.readFileSync(path.join(root,item.path),'utf8');
 const exported=[...source.matchAll(/\b(?:global|root)\.(DonaAntoniaAdmin[A-Za-z0-9_$]+)\s*=/g)].map(m=>m[1]);
 for(const name of exported){
  if(names.has(name))throw new Error('Duplicate global module provider '+name);
  names.set(name,{path:item.path,index});
 }
}
const runtimeSource=fs.readFileSync(path.join(root,runtime),'utf8');
const referenced=[...new Set([...runtimeSource.matchAll(/\b(DonaAntoniaAdmin[A-Za-z0-9_$]+)\b/g)].map(m=>m[1]))].sort();
const resolved=referenced.filter(n=>names.has(n));
for(const name of resolved){
 if(names.get(name).index>=runtimeIndex)throw new Error('Late module provider: '+name);
}
if(resolved.length<10)throw new Error('Admin runtime dependencies unexpectedly missing');
const report={script_count:admin.length,runtime_index:runtimeIndex,provider_count:names.size,
 resolved_runtime_dependencies:resolved.map(name=>({name,...names.get(name)})),
 external_or_dynamic_names:referenced.filter(n=>!names.has(n)),load_order:paths};
const output=process.argv[2];
if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
console.log('Admin classic-script load graph: PASS ('+admin.length+' scripts, '+resolved.length+' resolved runtime dependencies)');
