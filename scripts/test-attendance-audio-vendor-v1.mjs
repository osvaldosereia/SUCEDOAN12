import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const base='vitrine/admin/atendimento/vendor/opus-media-recorder/0.8.0';
const manifestPath=path.join(base,'MANIFEST.json');
const required=['OpusMediaRecorder.umd.js','encoderWorker.umd.js','OggOpusEncoder.wasm','LICENSE.md'];

assert.equal(fs.existsSync(manifestPath),true,'manifesto do vendor opus-media-recorder 0.8.0 deve existir');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
assert.equal(manifest.package,'opus-media-recorder');
assert.equal(manifest.version,'0.8.0','vendor deve ficar fixado exatamente em 0.8.0');

for(const name of required){
  const filePath=path.join(base,name);
  assert.equal(fs.existsSync(filePath),true,`${name} deve existir no vendor`);
  const bytes=fs.readFileSync(filePath);
  assert.ok(bytes.length>0,`${name} não pode estar vazio`);
  const entry=manifest.files?.[name];
  assert.ok(entry,`${name} deve estar listado no MANIFEST.json`);
  assert.equal(entry.bytes,bytes.length,`${name} deve ter tamanho igual ao manifesto`);
  assert.equal(entry.sha256,crypto.createHash('sha256').update(bytes).digest('hex'),`${name} deve ter SHA-256 igual ao manifesto`);
}

const wasm=fs.readFileSync(path.join(base,'OggOpusEncoder.wasm'));
assert.deepEqual([...wasm.subarray(0,4)],[0x00,0x61,0x73,0x6d],'WASM deve começar com magic bytes 00 61 73 6d');

for(const name of ['OpusMediaRecorder.umd.js','encoderWorker.umd.js','LICENSE.md']){
  const text=fs.readFileSync(path.join(base,name),'utf8');
  assert.doesNotMatch(text,/https?:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com)/i,`${name} não deve depender de CDN em runtime`);
}

const runtimeFiles=[
  'vitrine/admin/atendimento/attendance-audio-recorder.js',
  'vitrine/admin/atendimento/index.html',
];
for(const file of runtimeFiles){
  const text=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(text,/https?:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com).*opus-media-recorder/i,`${file} não deve carregar opus-media-recorder de CDN`);
}

console.log('PASS test-attendance-audio-vendor-v1');
