import fs from 'node:fs';
const s=fs.readFileSync('vitrine/admin/index.html','utf8');
const checks=[
 ['camera compacta mobile', /@media\(max-width:640px\)[\s\S]*?\.balance-camera-view\{height:136px;min-height:0/],
 ['sem botao ligar camera', !s.includes('id=\\"balanceCameraStart\\"')],
 ['sem botao desligar camera', !s.includes('id=\\"balanceCameraStop\\"')],
 ['busca manual recolhida', s.includes('class=\\"balance-manual-search\\"')],
 ['bip de leitura', s.includes('function playBalanceScanBeep()') && s.includes('playBalanceScanBeep();await handleBalanceScan(raw)')],
 ['vibracao reforcada', s.includes('navigator.vibrate(70)')],
 ['camera mais leve', s.includes("width:{ideal:960},height:{ideal:540}")],
 ['loop mais rapido', s.includes('setTimeout(balanceCameraTick,120)')],
 ['sem paines pesados no fluxo principal', !s.includes("id=\\"refreshStockRecount\\"") && !s.includes("id=\\"refreshStockShortages\\"")],
 ['titulo mobile enxuto', s.includes('<h1>Balanço</h1>')]
];
let fail=0;
for(const [name,ok] of checks){if(ok) console.log('OK',name); else {console.error('FAIL',name);fail++;}}
if(fail) process.exit(1);
