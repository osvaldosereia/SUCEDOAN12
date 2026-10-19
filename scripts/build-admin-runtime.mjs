// Source-of-truth: contiguous fragments of the original Admin IIFE.
// Fragments intentionally share lexical scope and must never be loaded individually.
// Usage: node scripts/build-admin-runtime.mjs --check (default) | --write
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const parts=[
  "00-bootstrap-navigation.part.js",
  "01-central.part.js",
  "02-expedition.part.js",
  "04-closure.part.js",
  "05-finance.part.js",
  "06-baskets-products.part.js",
  "07-expiration-balance.part.js",
  "08-inventory-sheet.part.js",
  "09-balance-gondolas.part.js",
  "10-purchase-finance.part.js",
  "11-purchase-catalog.part.js",
  "12-xml-import.part.js",
  "13-bling-integration.part.js",
  "14-customer-profile.part.js",
  "15-manual-orders.part.js",
  "16-orders-operations.part.js",
  "17-fiscal-danfe.part.js",
  "18-order-editing.part.js",
  "19-printing-startup.part.js"
];
const dir=path.join(root,'vitrine/admin/runtime-parts');
const output=path.join(root,'vitrine/admin/admin-runtime.js');
const sourceParts=parts.map(name=>fs.readFileSync(path.join(dir,name),'utf8'));
if(new Set(parts).size!==parts.length)throw new Error('Duplicate Admin runtime fragment');
const present=fs.readdirSync(dir).filter(name=>name.endsWith('.part.js')).sort();
if(JSON.stringify(present)!==JSON.stringify([...parts].sort()))throw new Error('Runtime source fragment list differs from directory');
const assembled=sourceParts.join('');
if(!assembled.startsWith('(()=>{')||!assembled.trimEnd().endsWith('})();'))throw new Error('Invalid Admin IIFE boundary');
if(process.argv.includes('--write')){
  fs.writeFileSync(output,assembled);
  console.log('Admin runtime regenerated from '+parts.length+' ordered source fragments.');
}else{
  const deployed=fs.readFileSync(output,'utf8');
  if(deployed!==assembled){
    console.error('admin-runtime.js differs from ordered source fragments. Run node scripts/build-admin-runtime.mjs --write');
    process.exitCode=1;
  }else console.log('Admin runtime source parity: PASS ('+parts.length+' fragments, '+assembled.length+' chars)');
}
