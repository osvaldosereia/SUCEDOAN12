const FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const SUPPORTED=new Set(['circle','line','star','confetti','gradient','wave','grid','ray','shadow','label','box','pattern','particle','particles','scribble']);
const num=(v,fallback)=>Number.isFinite(Number(v))?Number(v):fallback;
const windowOf=(spec,duration)=>({start:Math.max(0,num(spec.start,0)),end:Math.min(duration,num(spec.end,duration))});
const enabled=(start,end)=>`enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`;

export function proceduralVisualSpecs(items=[],{duration=18}={}){
  const safeDuration=Math.max(15,Math.min(25,num(duration,18)));
  const procedural=(items||[]).filter(x=>x?.status==='procedural'&&x?.procedural?.kind);
  const nonBackground=procedural.filter(x=>String(x?.request?.role||'').toLowerCase()!=='background');
  const span=Math.max(2,Math.min(5,(safeDuration-3)/Math.max(1,nonBackground.length)));
  let foregroundIndex=0;
  return procedural.map(item=>{
    const kind=String(item.procedural.kind).toLowerCase();
    const role=String(item?.request?.role||'support').toLowerCase();
    if(role==='background')return {kind,role,start:0,end:safeDuration,action:item?.request?.actions?.[0]||'reveal'};
    const start=Math.min(safeDuration-2,1+foregroundIndex*Math.max(1.5,span*.72));foregroundIndex++;
    const end=Math.min(safeDuration-2.8,start+span);
    return {kind,role,start:Number(start.toFixed(3)),end:Number(end.toFixed(3)),action:item?.request?.actions?.[0]||'reveal'};
  });
}

function expression(kind,{start,end,width,height,index}){
  const e=enabled(start,end),x=Math.round(width*(.08+(index%4)*.21)),y=Math.round(height*(.18+(index%5)*.12));
  switch(kind){
    case 'gradient':return `drawbox=x=0:y=0:w=iw:h=ih:color=0xDFF3FF@0.28:t=fill:${e},drawbox=x=0:y=${Math.round(height*.55)}:w=iw:h=${Math.round(height*.45)}:color=0xFFE6B8@0.18:t=fill:${e}`;
    case 'confetti':return `drawbox=x=${x}:y='mod(${y}+(t-${start.toFixed(3)})*210\,h)':w=16:h=34:color=0xF6B73C@0.88:t=fill:${e},drawbox=x=${Math.min(width-40,x+150)}:y='mod(${Math.max(20,y-180)}+(t-${start.toFixed(3)})*260\,h)':w=22:h=22:color=0xD85A71@0.86:t=fill:${e},drawbox=x=${Math.min(width-40,x+310)}:y='mod(${y+90}+(t-${start.toFixed(3)})*190\,h)':w=14:h=28:color=0x58A6C7@0.86:t=fill:${e}`;
    case 'star':return `drawtext=fontfile=${FONT}:text='★':fontsize=${Math.round(width*.12)}:fontcolor=0xF6B73C@0.92:x=${x}:y=${y}+18*sin((t-${start.toFixed(3)})*3):${e}`;
    case 'ray':return `drawgrid=w=${Math.max(80,Math.round(width*.16))}:h=${Math.max(80,Math.round(height*.09))}:t=3:c=0xFFFFFF@0.16:${e}`;
    case 'grid':return `drawgrid=w=${Math.max(48,Math.round(width*.1))}:h=${Math.max(48,Math.round(height*.06))}:t=2:c=0x2A2927@0.12:${e}`;
    case 'circle':return `drawtext=fontfile=${FONT}:text='●':fontsize=${Math.round(width*.13)}:fontcolor=0x58A6C7@0.35:x=${x}:y=${y}:${e}`;
    case 'line':return `drawbox=x=${x}:y=${y}:w=${Math.round(width*.34)}:h=8:color=0x2A2927@0.28:t=fill:${e}`;
    case 'wave':return `drawtext=fontfile=${FONT}:text='~~~~':fontsize=${Math.round(width*.08)}:fontcolor=0x58A6C7@0.42:x=${x}:y=${y}+12*sin((t-${start.toFixed(3)})*2):${e}`;
    case 'shadow':return `drawbox=x=${Math.round(width*.28)}:y=${Math.round(height*.68)}:w=${Math.round(width*.44)}:h=${Math.round(height*.035)}:color=black@0.12:t=fill:${e}`;
    case 'label':return `drawbox=x=${x}:y=${y}:w=${Math.round(width*.24)}:h=${Math.round(height*.055)}:color=white@0.72:t=fill:${e}`;
    case 'box':return `drawbox=x=${x}:y=${y}:w=${Math.round(width*.22)}:h=${Math.round(height*.12)}:color=0xF6B73C@0.18:t=fill:${e}`;
    case 'pattern':return `drawgrid=w=${Math.max(36,Math.round(width*.07))}:h=${Math.max(36,Math.round(height*.04))}:t=1:c=0xD85A71@0.10:${e}`;
    case 'particle':case 'particles':return `drawtext=fontfile=${FONT}:text='· · ·':fontsize=${Math.round(width*.09)}:fontcolor=white@0.65:x=${x}+25*sin((t-${start.toFixed(3)})*2):y=${y}-20*cos((t-${start.toFixed(3)})*2):${e}`;
    case 'scribble':return `drawtext=fontfile=${FONT}:text='≈≈≈':fontsize=${Math.round(width*.08)}:fontcolor=0x2A2927@0.34:x=${x}:y=${y}:${e}`;
    default:throw new Error(`procedural_kind_unsupported:${kind}`);
  }
}

export function buildProceduralVisualFilters(specs=[],{inputLabel='base',width=1080,height=1920,duration=25}={}){
  let current=inputLabel;const filters=[];
  (specs||[]).forEach((spec,index)=>{
    const kind=String(spec?.kind||'').toLowerCase();if(!SUPPORTED.has(kind))throw new Error(`procedural_kind_unsupported:${kind||'missing'}`);
    const {start,end}=windowOf(spec,Math.max(1,num(duration,25)));if(end<=start)throw new Error('procedural_time_window_invalid');
    const out=`proc${index}`;filters.push(`[${current}]${expression(kind,{start,end,width:num(width,1080),height:num(height,1920),index})}[${out}]`);current=out;
  });
  return {filters,outputLabel:current};
}
