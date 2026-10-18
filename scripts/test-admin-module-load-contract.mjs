import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const scripts=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m=>m[1]);
const modules=['core/formatters.js','core/identifiers.js','core/errors.js','components/printing.js','marketing/helpers.js'];
const mainIndex=html.indexOf('<script>\n(()=>{');
assert.ok(mainIndex>0,'main admin script not found');
for(const module of modules){
  const url='/vitrine/admin/'+module;
  const matches=scripts.filter(s=>s.split('?')[0]===url);
  assert.equal(matches.length,1,'exactly one script tag expected: '+module);
  assert.ok(html.indexOf('<script src="'+matches[0]+'"></script>')<mainIndex,'module must precede main script: '+module);
  assert.ok(fs.existsSync(path.join('vitrine/admin',module)),'missing referenced module '+module);
}
for(const src of scripts){
  if(!src.startsWith('/vitrine/admin/'))continue;
  const local=src.split('?')[0].slice(1);
  assert.ok(fs.existsSync(local),'missing local script '+local);
}
const names=['DonaAntoniaAdminFormatters','DonaAntoniaAdminIdentifiers','DonaAntoniaAdminErrors','DonaAntoniaAdminPrinting','DonaAntoniaAdminMarketingHelpers'];
for(const name of names)assert.ok(html.includes('window.'+name),'missing bridge '+name);
console.log('Admin module load contract: PASS');
