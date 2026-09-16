const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));

export function parallaxAmplitude(role='support'){
  const key=String(role||'support').toLowerCase();
  if(key==='background')return 4;
  if(key==='foreground')return 16;
  if(key==='product')return 7;
  return 9;
}

export function buildCameraPlan(scenes=[],options={}){
  const duration=clamp(options.duration??scenes.at(-1)?.end??18,15,25);
  const hasPayoff=(scenes||[]).some(scene=>/payoff|reveal|close|fech|oferta|produto/i.test(String(scene?.beat||scene?.summary||'')));
  const endZoom=hasPayoff?1.065:1.05;
  return {mode:'cinematic_push',startZoom:1,endZoom,panX:6,panY:4,duration};
}

export function buildCameraFilter(plan={},options={}){
  const inputLabel=String(options.inputLabel||'story');
  const outputLabel=String(options.outputLabel||'camera');
  const width=Math.max(2,Math.round(Number(options.width)||1080));
  const height=Math.max(2,Math.round(Number(options.height)||1920));
  const fps=Math.max(1,Math.round(Number(options.fps)||30));
  const duration=clamp(plan.duration??18,15,25);
  const start=clamp(plan.startZoom??1,1,1.08);
  const end=clamp(plan.endZoom??1.05,start,1.08);
  const totalFrames=Math.max(1,Math.round(duration*fps));
  const step=(end-start)/totalFrames;
  const panX=clamp(plan.panX??6,0,24);
  const panY=clamp(plan.panY??4,0,24);
  const zoom=`min(${end.toFixed(5)}\,max(${start.toFixed(5)}\,pzoom+${step.toFixed(7)}))`;
  const x=`iw/2-(iw/zoom/2)+sin(on/18)*${panX.toFixed(2)}`;
  const y=`ih/2-(ih/zoom/2)+cos(on/22)*${panY.toFixed(2)}`;
  return `[${inputLabel}]zoompan=z='${zoom}':x='${x}':y='${y}':d=1:s=${width}x${height}:fps=${fps}[${outputLabel}]`;
}
