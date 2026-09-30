import fs from 'node:fs';
const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const checks=[
  ['função de bip existe',/function playBalanceScanBeep\(\)/.test(html)],
  ['usa Web Audio',/(AudioContext|webkitAudioContext)/.test(html)],
  ['ganho máximo configurado',/gain\.setValueAtTime\(1(?:\.0)?\s*,/.test(html)],
  ['bip toca no reconhecimento antes da consulta',/playBalanceScanBeep\(\);\s*await handleBalanceScan\(raw\)/.test(html)],
  ['áudio é preparado ao ligar câmera',/unlockBalanceScanAudio\(\);[\s\S]{0,400}getUserMedia/.test(html)],
  ['vibração continua ativa',/navigator\.vibrate/.test(html)]
];
let failed=false;
for(const [name,ok] of checks){if(!ok){console.error('FAIL:',name);failed=true}else console.log('OK:',name)}
if(failed)process.exit(1);
console.log('balance scan beep contract OK');
