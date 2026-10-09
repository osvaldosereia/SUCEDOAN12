#!/usr/bin/env node
/* DA6 — impressão digital reprodutível do CÓDIGO (não das evidências de QA).
 * Congela a implementação testada e invalida homologações após alterações.
 * Não acessa rede, banco, GitHub nem variáveis de produção.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export function da6SourceFiles(root){
 const all=new Set([
  'vitrine/admin/index.html',
  'vitrine/admin/product-shelf-admin-ui.js',
  'vitrine/admin/product-shelf-labels.js',
  'vitrine/admin/product-shelf-labels.css',
  'vitrine/admin/product-label-print.css',
  'supabase/functions/admin-products-live-v1/index.ts',
  'scripts/da6-release-fingerprint.mjs',
  'scripts/da6-release-gate.mjs',
  'scripts/da6-release-attestation.mjs',
  'scripts/da6-staging-preflight.mjs',
  '.github/workflows/da6-inventory-labels-ci.yml'
 ]);
 const scopes=[
  ['vitrine/admin',/^inventory-label-[a-z0-9-]+\.(?:js|css)$/],
  ['vitrine/admin/vendor',/^(?:JsBarcode.*|qrcode-generator.*|LICENSE-JsBarcode.*|LICENSE-qrcode-generator.*)$/],
  ['supabase/functions/admin-products-live-v1',/^inventory-label-[a-z0-9-]+\.ts$/],
  ['supabase/migrations',/^\d+_da6_[a-z0-9_]+\.sql$/]
 ];
 for(const [dir,pattern] of scopes){
  const base=path.join(root,dir);
  if(!fs.existsSync(base))throw Error('missing_source_directory:'+dir);
  for(const file of fs.readdirSync(base))if(pattern.test(file))all.add(dir+'/'+file);
 }
 const files=[...all].sort();
 for(const file of files){
  const absolute=path.join(root,file);
  if(!fs.existsSync(absolute)||!fs.statSync(absolute).isFile())
   throw Error('missing_release_source:'+file);
  if(!fs.realpathSync(absolute).startsWith(fs.realpathSync(root)+path.sep))
   throw Error('release_source_outside_repository:'+file);
 }
 return files;
}
export function da6SourceFingerprint(root){
 const files=da6SourceFiles(root);
 const sha=crypto.createHash('sha256');
 for(const name of files){
  const bytes=fs.readFileSync(path.join(root,name));
  sha.update(Buffer.from(name,'utf8'));
  sha.update(Buffer.from([0]));
  sha.update(crypto.createHash('sha256').update(bytes).digest());
  sha.update(Buffer.from([0]));
 }
 return {sha256:sha.digest('hex'),count:files.length,files};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 console.log(JSON.stringify(da6SourceFingerprint(root),null,2));
}
