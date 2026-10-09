#!/usr/bin/env node
/* DA6 — verificador de prontidão somente leitura.
 * Não faz merge, deploy, migração SQL, alterações de estoque ou chamadas ao Bling.
 *
 * node scripts/da6-release-gate.mjs --report    -> relatório JSON, exit 0
 * node scripts/da6-release-gate.mjs --enforce   -> bloqueia publicação sem provas, exit 3
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {da6SourceFingerprint} from './da6-release-fingerprint.mjs';
import {verifyDa6EvidenceHeader} from './da6-release-attestation.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifestPath='docs/projects/DA6_RELEASE_GATES_2026-10-09.json';
const manifest=JSON.parse(fs.readFileSync(path.join(repo,manifestPath),'utf8'));
const failures=[];
const fingerprint=da6SourceFingerprint(repo);
const bound=manifest.release_candidate_fingerprint;
if(!bound||!/^[a-f0-9]{64}$/.test(String(bound))){
 failures.push({gate:'source_fingerprint',reason:'release_source_not_pinned'});
}else if(bound!==fingerprint.sha256){
 failures.push({gate:'source_fingerprint',reason:'code_changed_since_qa_attestation'});
}

const localAssets=[
 'vitrine/admin/vendor/JsBarcode.all-3.11.6.min.js',
 'vitrine/admin/vendor/qrcode-generator-2.0.4.js',
 'vitrine/admin/vendor/LICENSE-JsBarcode.txt',
 'vitrine/admin/vendor/LICENSE-qrcode-generator.txt'
];
for(const item of localAssets)if(!fs.existsSync(path.join(repo,item)))
 failures.push({gate:'print_assets',reason:'missing '+item});
const print=fs.readFileSync(path.join(repo,'vitrine/admin/product-shelf-labels.js'),'utf8');
if(/<script src="https?:\/\//i.test(print))
 failures.push({gate:'print_assets',reason:'external CDN still required'});
for(const item of localAssets.slice(0,2)){
 if(!print.includes('/'+item))failures.push({gate:'print_assets',reason:'unreferenced '+item});
}
const html=fs.readFileSync(path.join(repo,'vitrine/admin/index.html'),'utf8');
for(const item of ['product-shelf-labels.js','product-shelf-admin-ui.js',
 'inventory-label-photo-upload.js','inventory-label-photo-review.js','inventory-label-photo-tab.js']){
 if(!html.includes('/vitrine/admin/'+item))failures.push({gate:'admin_assets',reason:'missing script '+item});
}
if(!html.includes('printInventorySheet')||!html.includes("renderBalance"))
 failures.push({gate:'a4_regression',reason:'A4 controls absent'});
const requiredGates=[
 'physical_thermal_203dpi_print',
 'real_cell_phone_photos_omr',
 'hosted_edge_staging',
 'hosted_cron_pgnet_staging',
 'latest_main_conflict_review',
 'confirmed_predeploy_backup',
 'rollback_rehearsal'
];
const changes=manifest.required_production_gates;
if(!changes||typeof changes!=='object'||Array.isArray(changes))
 failures.push({gate:'manifest',reason:'invalid_required_production_gates'});
for(const gate of Object.keys(changes&&typeof changes==='object'&&!Array.isArray(changes)?changes:{}))
 if(!requiredGates.includes(gate))failures.push({gate,reason:'unknown_production_gate'});
for(const gate of requiredGates){
 const value=changes?.[gate];
 if(value?.passed!==true){
  failures.push({gate,reason:'pending_physical_or_hosted_evidence'});
  continue;
 }
 const file=String(value.evidence_file||'');
 const checksum=String(value.evidence_sha256||'');
 if(!/^docs\/projects\/DA6_QA_[A-Za-z0-9_-]+[.]md$/.test(file)||
    !/^[a-f0-9]{64}$/.test(checksum)){
  failures.push({gate,reason:'invalid_attestation_path_or_hash'});
  continue;
 }
 const full=path.resolve(repo,file);
 const evidenceRoot=fs.realpathSync(path.join(repo,'docs','projects'));
 if(!full.startsWith(path.join(repo,'docs','projects')+path.sep)||!fs.existsSync(full)||
    !fs.realpathSync(full).startsWith(evidenceRoot+path.sep)){
  failures.push({gate,reason:'missing_attestation'});
  continue;
 }
 const evidence=fs.readFileSync(full);
 const real=crypto.createHash('sha256').update(evidence).digest('hex');
 if(real!==checksum){
  failures.push({gate,reason:'attestation_changed'});
  continue;
 }
 const linked=verifyDa6EvidenceHeader(evidence.toString('utf8'),gate,fingerprint.sha256);
 if(!linked.ok)failures.push({gate,reason:linked.reason});
}
if(manifest.release_status!=='ready_for_approval')
 failures.push({gate:'release_status',reason:'manual_release_gate_closed'});
const result={
 project:'DA6',branch:manifest.source_branch,
 source_fingerprint:fingerprint.sha256,source_files:fingerprint.count,release_fingerprint:bound||null,
 ready:failures.length===0,
 ci_verified:manifest.verified_software?.ci_run_url||null,
 missing:failures,
 next_action:failures.length?'Keep PR draft; do not deploy, merge or unschedule automation':
  'Request final protected release review; do not execute deployment from this script'
};
console.log(JSON.stringify(result,null,2));
if(process.argv.includes('--enforce')&&failures.length)process.exitCode=3;
