const PHASES={
  enter_left:[['anticipation',0,{dx:-.08,scale:.98}],['travel',.2,{dx:-1}],['travel',.72,{dx:.04}],['settle',1,{dx:0,scale:1}]],
  drop:[['anticipation',0,{dy:-.08}],['travel',.55,{dy:-1}],['overshoot',.82,{dy:.08,scale:.97}],['settle',1,{dy:0,scale:1}]],
  bounce:[['anticipation',0,{scale:.96}],['travel',.35,{dy:-.35,scale:1.03}],['overshoot',.7,{dy:.06,scale:.98}],['settle',1,{dy:0,scale:1}]],
  slide:[['anticipation',0,{dx:-.04}],['travel',.75,{dx:1}],['settle',1,{dx:0}]],
  reveal:[['anticipation',0,{opacity:0,scale:.92}],['travel',.72,{opacity:1,scale:1.04}],['settle',1,{opacity:1,scale:1}]]
};

const BEHAVIOR={
  curious:{tempo:.92,rotation:2}, surprised:{tempo:.82,rotation:5}, happy:{tempo:.9,rotation:3}, nervous:{tempo:1.08,rotation:2}, heroic:{tempo:.86,rotation:0}, sneaky:{tempo:1.15,rotation:1}, shy:{tempo:1.12,rotation:1}, excited:{tempo:.78,rotation:4}, sleepy:{tempo:1.22,rotation:1}, chaotic:{tempo:.72,rotation:7}
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
