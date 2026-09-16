const PHASES={
  enter_left:[['anticipation',0,{dx:-.08,scale:.98}],['travel',.2,{dx:-1}],['travel',.72,{dx:.04}],['settle',1,{dx:0,scale:1}]],
  enter_right:[['anticipation',0,{dx:.08,scale:.98}],['travel',.2,{dx:1}],['travel',.72,{dx:-.04}],['settle',1,{dx:0,scale:1}]],
  enter_top:[['anticipation',0,{dy:-.08}],['travel',.2,{dy:-1}],['overshoot',.78,{dy:.05}],['settle',1,{dy:0}]],
  rise:[['anticipation',0,{dy:.12,scale:.96}],['travel',.7,{dy:-.18,scale:1.04}],['settle',1,{dy:0,scale:1}]],
  drop:[['anticipation',0,{dy:-.08}],['travel',.55,{dy:-1}],['overshoot',.82,{dy:.08,scale:.97}],['settle',1,{dy:0,scale:1}]],
  hop:[['anticipation',0,{scale:.96}],['travel',.42,{dy:-.28}],['overshoot',.78,{dy:.05}],['settle',1,{dy:0,scale:1}]],
  bounce:[['anticipation',0,{scale:.96}],['travel',.35,{dy:-.35,scale:1.03}],['overshoot',.7,{dy:.06,scale:.98}],['settle',1,{dy:0,scale:1}]],
  shake:[['anticipation',0,{dx:0}],['travel',.25,{dx:-.06}],['travel',.5,{dx:.06}],['travel',.75,{dx:-.03}],['settle',1,{dx:0}]],
  wobble:[['anticipation',0,{rotation:-5}],['travel',.35,{rotation:6}],['overshoot',.72,{rotation:-3}],['settle',1,{rotation:0}]],
  spin:[['anticipation',0,{rotation:0}],['travel',.7,{rotation:320}],['overshoot',.9,{rotation:370}],['settle',1,{rotation:360}]],
  tilt:[['anticipation',0,{rotation:0}],['travel',.7,{rotation:-8}],['settle',1,{rotation:0}]],
  slide:[['anticipation',0,{dx:-.04}],['travel',.75,{dx:1}],['settle',1,{dx:0}]],
  walk:[['anticipation',0,{dx:-.08}],['travel',.28,{dx:.28,dy:-.03}],['travel',.58,{dx:.62,dy:.02}],['travel',.82,{dx:.9,dy:-.02}],['settle',1,{dx:1,dy:0}]],
  crawl:[['anticipation',0,{scale:.98}],['travel',.35,{dx:.28,dy:.02}],['travel',.7,{dx:.65,dy:-.01}],['settle',1,{dx:1,dy:0}]],
  peek:[['anticipation',0,{dx:-.22,opacity:.5}],['travel',.65,{dx:.04,opacity:1}],['settle',1,{dx:0,opacity:1}]],
  fall:[['anticipation',0,{rotation:-2}],['travel',.7,{dy:.8,rotation:18}],['overshoot',.9,{dy:1,rotation:24}],['settle',1,{dy:1,rotation:20}]],
  push:[['anticipation',0,{dx:-.04,scale:.98}],['travel',.75,{dx:.45,scale:1.02}],['settle',1,{dx:.4,scale:1}]],
  pull:[['anticipation',0,{dx:.05}],['travel',.75,{dx:-.45}],['settle',1,{dx:-.4}]],
  chase:[['anticipation',0,{dx:-.15}],['travel',.25,{dx:.2}],['travel',.65,{dx:.72}],['overshoot',.88,{dx:1.05}],['settle',1,{dx:1}]],
  follow:[['anticipation',0,{dx:-.08}],['travel',.35,{dx:.2}],['travel',.8,{dx:.78}],['settle',1,{dx:.72}]],
  orbit:[['anticipation',0,{rotation:0}],['travel',.3,{dx:.15,dy:-.12,rotation:90}],['travel',.65,{dx:-.12,dy:.08,rotation:220}],['settle',1,{dx:0,dy:0,rotation:360}]],
  scatter:[['anticipation',0,{scale:.96}],['burst',.28,{dx:.35,dy:-.25,scale:1.08}],['travel',.72,{dx:.9,dy:.35}],['settle',1,{dx:1,dy:.45,scale:1}]],
  stack:[['anticipation',0,{dy:-.18}],['travel',.7,{dy:.12}],['overshoot',.88,{dy:-.03}],['settle',1,{dy:0}]],
  explode:[['anticipation',0,{scale:.7,opacity:.7}],['burst',.22,{scale:1.3,opacity:1}],['overshoot',.58,{scale:1.08}],['settle',1,{scale:1}]],
  celebrate:[['anticipation',0,{scale:.96}],['burst',.28,{dy:-.25,rotation:-5,scale:1.08}],['overshoot',.62,{dy:.05,rotation:5}],['settle',1,{dy:0,rotation:0,scale:1}]],
  squash:[['anticipation',0,{scale:.98}],['travel',.55,{scale:.78}],['overshoot',.8,{scale:1.08}],['settle',1,{scale:1}]],
  stretch:[['anticipation',0,{scale:.98}],['travel',.55,{scale:1.18}],['overshoot',.8,{scale:.96}],['settle',1,{scale:1}]],
  zoom:[['anticipation',0,{scale:.86}],['travel',.72,{scale:1.08}],['settle',1,{scale:1}]],
  reveal:[['anticipation',0,{opacity:0,scale:.92}],['travel',.72,{opacity:1,scale:1.04}],['settle',1,{opacity:1,scale:1}]],
  exit:[['anticipation',0,{dx:0}],['travel',.75,{dx:1.08,opacity:.9}],['settle',1,{dx:1.2,opacity:0}]]
};

const BEHAVIOR={
  curious:{tempo:.92,rotation:2}, surprised:{tempo:.82,rotation:5}, happy:{tempo:.9,rotation:3}, nervous:{tempo:1.08,rotation:2}, heroic:{tempo:.86,rotation:0}, confident:{tempo:.84,rotation:0}, sneaky:{tempo:1.15,rotation:1}, shy:{tempo:1.12,rotation:1}, excited:{tempo:.78,rotation:4}, sleepy:{tempo:1.22,rotation:1}, chaotic:{tempo:.72,rotation:7}
};

const quantize=(time,fps)=>Math.round(time*fps)/fps;

export function buildMotionTrack({motion,behavior='curious',start=0,duration=1,modifier=null,stepFps=10}={}){
  const phases=PHASES[motion]||[['anticipation',0,{}],['travel',.7,{}],['settle',1,{}]];
  const profile=BEHAVIOR[behavior]||BEHAVIOR.curious;
  const actualDuration=Math.max(.1,Number(duration)||1)*profile.tempo;
  const keyframes=phases.map(([phase,p,transform])=>({phase,time:Number(start)+actualDuration*p,transform:{...transform,rotation:(transform.rotation||0)+profile.rotation}}));
  if(modifier==='stop_motion') for(const k of keyframes) k.time=quantize(k.time,Math.max(1,Number(stepFps)||10));
  return {motion,behavior,modifier,keyframes};
}
