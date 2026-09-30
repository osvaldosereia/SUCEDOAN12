from pathlib import Path

p=Path('vitrine/admin/index.html')
s=p.read_text(encoding='utf-8')

marker="  async function startBalanceCamera(){"
if s.count(marker)!=1:
    raise SystemExit(f'startBalanceCamera marker count={s.count(marker)}')

helper="""  let balanceScanAudioCtx=null;
  function balanceScanAudioContext(){
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return null;
    if(!balanceScanAudioCtx)balanceScanAudioCtx=new Ctx();
    return balanceScanAudioCtx;
  }
  async function unlockBalanceScanAudio(){
    try{const ctx=balanceScanAudioContext();if(ctx?.state==='suspended')await ctx.resume()}catch{}
  }
  function playBalanceScanBeep(){
    try{
      const ctx=balanceScanAudioContext();if(!ctx)return;
      const fire=()=>{
        const now=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain();
        osc.type='square';osc.frequency.setValueAtTime(1450,now);
        gain.gain.setValueAtTime(1,now);gain.gain.setValueAtTime(1,now+.12);gain.gain.exponentialRampToValueAtTime(.0001,now+.18);
        osc.connect(gain);gain.connect(ctx.destination);osc.start(now);osc.stop(now+.19);
      };
      if(ctx.state==='suspended')ctx.resume().then(fire).catch(()=>{});else fire();
    }catch{}
  }
"""
s=s.replace(marker,helper+marker,1)

old="  async function startBalanceCamera(){\n    const video=$('#balanceCameraVideo'),status=$('#balanceCameraStatus');"
new="  async function startBalanceCamera(){\n    unlockBalanceScanAudio();\n    const video=$('#balanceCameraVideo'),status=$('#balanceCameraStatus');"
if s.count(old)!=1:
    raise SystemExit(f'start body count={s.count(old)}')
s=s.replace(old,new,1)

old="if(raw.length>=4){const now=Date.now();if(raw!==state.balanceLastCameraEan||now-state.balanceLastCameraAt>2500){state.balanceLastCameraEan=raw;state.balanceLastCameraAt=now;if(navigator.vibrate)navigator.vibrate(45);await handleBalanceScan(raw)}}"
new="if(raw.length>=4){const now=Date.now();if(raw!==state.balanceLastCameraEan||now-state.balanceLastCameraAt>2500){state.balanceLastCameraEan=raw;state.balanceLastCameraAt=now;if(navigator.vibrate)navigator.vibrate(70);playBalanceScanBeep();await handleBalanceScan(raw)}}"
if s.count(old)!=1:
    raise SystemExit(f'scan line count={s.count(old)}')
s=s.replace(old,new,1)

p.write_text(s,encoding='utf-8')
print('scan beep patch applied')
