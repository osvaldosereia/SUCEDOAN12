import fs from 'node:fs';
const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const checks=[
  [!html.includes('id=\"balanceTabA4\"'),'Folhas A4 ainda aparece no Balanço'],
  [!html.includes("state.balanceSubtab=tab==='a4'?'a4':'scanner'"),'setBalanceSubtab ainda permite A4'],
  [html.includes("const content=$('#content'),incident=state.balanceMode==='incident',scanner=!incident;"),'Balanço normal ainda não força câmera'],
  [!html.includes("if(!incident&&!scanner){bindInventorySheetPhoto();loadInventorySheetPendingManual()}"),'renderBalance ainda inicializa o fluxo A4'],
  [html.includes("state.balanceSubtab='scanner';state.balanceProduct=null;state.balanceQty='';state.balanceNeedsPhoto=false;state.balanceReadiness=null;"),'setBalanceSubtab não força scanner'],
];
let failed=false;
for(const [ok,msg] of checks){if(!ok){console.error('FAIL:',msg);failed=true}}
if(failed)process.exit(1);
console.log('balance mobile-only contract OK');
