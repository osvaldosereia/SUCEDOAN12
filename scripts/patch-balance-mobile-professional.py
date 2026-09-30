from pathlib import Path
import re
p=Path('vitrine/admin/index.html')
s=p.read_text(encoding='utf-8')

# 1) Mobile-first compact layout overrides.
marker='    /* Admin Navigation V6.1 · desktop + mobile sem overflow horizontal */'
css='''    /* Balanço mobile operacional: compacto, uma mão, leitura contínua */
    .balance-manual-search{margin-top:6px;border-top:1px solid var(--line);padding-top:6px}
    .balance-manual-search summary{cursor:pointer;font-weight:850;color:var(--brand);list-style:none;padding:7px 2px}
    .balance-manual-search summary::-webkit-details-marker{display:none}
    .balance-camera-shell{padding:8px;margin-bottom:8px}
    .balance-camera-view{height:150px;min-height:0;border-radius:10px}
    .balance-camera-view video{width:100%;height:100%;max-height:none;object-fit:cover}
    .balance-camera-frame{inset:26% 6%;border-radius:8px}
    .balance-camera-status{margin:5px 0 0;font-size:11px;line-height:1.25;text-align:center}
    @media(max-width:640px){.balance-camera-shell{padding:6px;margin-bottom:7px}.balance-camera-view{height:136px;min-height:0}.balance-camera-status{margin:4px 0 0}.balance-tool-grid{gap:7px}.balance-tool-grid .tool-card{padding:9px}.scanner-hero{padding:9px}.scan-title{font-size:10px}.scan-value{font-size:17px}.scan-sub{font-size:10px}.qty-label{margin-top:8px}.balance-product-fields{grid-template-columns:1fr 1fr;gap:6px;margin:7px 0}.balance-product-fields input{min-height:40px;padding:7px 8px}.confirm-wide{min-height:48px}.page-head{margin-bottom:7px}.page-head h1{font-size:20px}.page-head p{display:none}.order-filters{margin-bottom:7px!important}.filter-chip{min-height:38px}}

'''
if marker not in s: raise SystemExit('CSS insertion marker missing')
if 'Balanço mobile operacional: compacto' not in s:
    s=s.replace(marker,css+marker,1)

# 2) Compact camera: no start/stop controls, manual search collapsed.
old='''    const cameraPanel=scanner?'<section class=\\"panel balance-camera-shell\\"><div class=\\"balance-camera-view\\"><video id=\\"balanceCameraVideo\\" playsinline muted autoplay></video><div class=\\"balance-camera-frame\\"></div></div><div class=\\"balance-camera-status\\" id=\\"balanceCameraStatus\\">Abrindo câmera traseira…</div><div class=\\"balance-camera-actions\\"><button class=\\"secondary\\" id=\\"balanceCameraStart\\" type=\\"button\\">Ligar câmera</button><button class=\\"secondary\\" id=\\"balanceCameraStop\\" type=\\"button\\">Desligar câmera</button></div><label style=\\"display:block;margin-top:10px\\"><span>Buscar por nome ou EAN</span><input id=\\"balanceManualSearch\\" type=\\"search\\" autocomplete=\\"off\\" placeholder=\\"Digite nome, EAN ou código\\"></label><div id=\\"balanceManualResults\\" class=\\"balance-search-results\\"></div></section>':'';'''
new='''    const cameraPanel=scanner?'<section class=\\"panel balance-camera-shell\\"><div class=\\"balance-camera-view\\"><video id=\\"balanceCameraVideo\\" playsinline muted autoplay></video><div class=\\"balance-camera-frame\\"></div></div><div class=\\"balance-camera-status\\" id=\\"balanceCameraStatus\\">Abrindo câmera…</div><details class=\\"balance-manual-search\\"><summary>Buscar manualmente por nome ou EAN</summary><label style=\\"display:block;margin-top:6px\\"><input id=\\"balanceManualSearch\\" type=\\"search\\" inputmode=\\"search\\" autocomplete=\\"off\\" placeholder=\\"Nome ou EAN\\"></label><div id=\\"balanceManualResults\\" class=\\"balance-search-results\\"></div></details></section>':'';'''
if old not in s: raise SystemExit('cameraPanel marker missing')
s=s.replace(old,new,1)

# 3) Shorter title.
s=s.replace('<h1>Balanço rápido</h1>','<h1>Balanço</h1>',1)

# 4) Remove heavy secondary panels from normal balance screen.
pat=r"\+\(!incident\?'<section class=\\\"panel\\\" style=\\\"margin-top:14px\\\"><div class=\\\"history-title dispatch-head\\\"><div><strong>Recontagem para Bling</strong>.*?</section>':'<div class=\\\"rule-notice\\\" style=\\\"margin-top:14px\\\"><strong>Ocorrências</strong><div>Avaria, vencido e perda seguem para reconciliação operacional/fiscal\.</div></div>'\);"
m=re.search(pat,s,flags=re.S)
if not m: raise SystemExit('heavy panels marker missing')
s=s[:m.start()] + "+(incident?'<div class=\\\"rule-notice\\\" style=\\\"margin-top:10px\\\"><strong>Ocorrências</strong><div>Avaria, vencido e perda seguem para reconciliação operacional/fiscal.</div></div>':'');" + s[m.end():]

# 5) Camera binds: auto only, no visible start/stop controls.
old="    if(scanner){bindBalanceManualSearch();$('#balanceCameraStart').onclick=startBalanceCamera;$('#balanceCameraStop').onclick=stopBalanceCamera;startBalanceCamera()}"
new="    if(scanner){bindBalanceManualSearch();startBalanceCamera()}"
if old not in s: raise SystemExit('camera bind marker missing')
s=s.replace(old,new,1)

# 6) Remove automatic heavy queue requests from count mode.
pat=r"    if\(!incident\)\{\$\('#refreshStockRecount'\).*?loadOrderStockShortages\(\)\}else loadInventoryIncidents\(\);"
if re.search(pat,s):
    s=re.sub(pat,"    if(incident)loadInventoryIncidents();",s,count=1)
else:
    # Fallback for minified variants.
    s=s.replace("    if(!incident){$('#refreshStockRecount').onclick=loadStockRecountQueue;$('#refreshStockShortages').onclick=loadOrderStockShortages;loadStockRecountQueue();loadOrderStockShortages()}else loadInventoryIncidents();","    if(incident)loadInventoryIncidents();",1)

# 7) Lighter camera stream.
old="video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}"
new="video:{facingMode:{ideal:'environment'},width:{ideal:960},height:{ideal:540}}"
if old not in s: raise SystemExit('camera constraint marker missing')
s=s.replace(old,new,1)

# 8) Add immediate loud WebAudio beep, unlocked when camera starts.
start='  async function startBalanceCamera(){'
if 'function playBalanceScanBeep()' not in s:
    if s.count(start)!=1: raise SystemExit('startBalanceCamera marker missing')
    helper='''  let balanceScanAudioCtx=null;\n  function balanceScanAudioContext(){\n    const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return null;\n    if(!balanceScanAudioCtx)balanceScanAudioCtx=new Ctx();return balanceScanAudioCtx;\n  }\n  async function unlockBalanceScanAudio(){try{const ctx=balanceScanAudioContext();if(ctx?.state==='suspended')await ctx.resume()}catch{}}\n  function playBalanceScanBeep(){\n    try{const ctx=balanceScanAudioContext();if(!ctx)return;const fire=()=>{const now=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='square';osc.frequency.setValueAtTime(1500,now);gain.gain.setValueAtTime(1,now);gain.gain.setValueAtTime(1,now+.10);gain.gain.exponentialRampToValueAtTime(.0001,now+.18);osc.connect(gain);gain.connect(ctx.destination);osc.start(now);osc.stop(now+.19)};if(ctx.state==='suspended')ctx.resume().then(fire).catch(()=>{});else fire()}catch{}\n  }\n'''
    s=s.replace(start,helper+start,1)

old="  async function startBalanceCamera(){\n    if(state.tab!=='balance'||state.balanceMode==='incident'||state.balanceSubtab!=='scanner')return;"
new="  async function startBalanceCamera(){\n    unlockBalanceScanAudio();\n    if(state.tab!=='balance'||state.balanceMode==='incident'||state.balanceSubtab!=='scanner')return;"
if old in s:s=s.replace(old,new,1)

old="if(raw.length>=4){const now=Date.now();if(raw!==state.balanceLastCameraEan||now-state.balanceLastCameraAt>2500){state.balanceLastCameraEan=raw;state.balanceLastCameraAt=now;if(navigator.vibrate)navigator.vibrate(45);await handleBalanceScan(raw)}}"
new="if(raw.length>=4){const now=Date.now();if(raw!==state.balanceLastCameraEan||now-state.balanceLastCameraAt>2500){state.balanceLastCameraEan=raw;state.balanceLastCameraAt=now;if(navigator.vibrate)navigator.vibrate(70);playBalanceScanBeep();await handleBalanceScan(raw)}}"
if old not in s: raise SystemExit('scan feedback marker missing')
s=s.replace(old,new,1)

# 9) Faster scan cadence without overlapping detections (tick schedules only after detect resolves).
if 'setTimeout(balanceCameraTick,180)' not in s: raise SystemExit('camera tick marker missing')
s=s.replace('setTimeout(balanceCameraTick,180)','setTimeout(balanceCameraTick,120)',1)

p.write_text(s,encoding='utf-8')
print('professional mobile balance patch applied')
