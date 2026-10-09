// @ts-nocheck
// Browser-origin pure geometry is tested by Node DA6 CI; TS wrapper below exports readDA6.
/* DA6 — motor compartilhado do worker; espelho dos algoritmos OMR versionados do Admin. */
// === inventory-label-photo-homography.js ===
/* DA6 — homografia para etiqueta fotografada, sem IA. */
(function(root){
'use strict';
function solve(a,b){
  const m=a.map((r,i)=>[...r,b[i]]);
  for(let c=0;c<8;c++){
    let p=c;for(let i=c+1;i<8;i++)if(Math.abs(m[i][c])>Math.abs(m[p][c]))p=i;
    if(Math.abs(m[p][c])<1e-9)throw Error('perspective_invalid');
    [m[p],m[c]]=[m[c],m[p]];
    const d=m[c][c];for(let j=c;j<9;j++)m[c][j]/=d;
    for(let i=0;i<8;i++)if(i!==c){const k=m[i][c];for(let j=c;j<9;j++)m[i][j]-=k*m[c][j]}
  }
  return m.map(r=>r[8]);
}
function homography(points){
  if(points.length!==4)throw Error('four_markers_required');
  const target=[[31,31],[969,31],[969,1469],[31,1469]],a=[],b=[];
  for(let i=0;i<4;i++){
    const [x,y]=target[i],p=points[i];
    a.push([x,y,1,0,0,0,-x*p.x,-y*p.x]);b.push(p.x);
    a.push([0,0,0,x,y,1,-x*p.y,-y*p.y]);b.push(p.y);
  }
  return solve(a,b);
}
function warp(img,points,width=1000,height=1500){
  const h=homography(points),out=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const X=(x+.5)*1000/width,Y=(y+.5)*1500/height;
    const den=h[6]*X+h[7]*Y+1;
    const sx=(h[0]*X+h[1]*Y+h[2])/den,sy=(h[3]*X+h[4]*Y+h[5])/den;
    const o=(y*width+x)*4,ix=Math.floor(sx),iy=Math.floor(sy);
    if(!Number.isFinite(sx)||!Number.isFinite(sy)||ix<0||iy<0||ix>=img.width-1||iy>=img.height-1){
      out[o]=out[o+1]=out[o+2]=out[o+3]=255;continue;
    }
    const fx=sx-ix,fy=sy-iy,i=(iy*img.width+ix)*4,j=i+img.width*4;
    for(let c=0;c<3;c++)out[o+c]=Math.round((img.data[i+c]*(1-fx)+img.data[i+c+4]*fx)*(1-fy)+(img.data[j+c]*(1-fx)+img.data[j+c+4]*fx)*fy);
    out[o+3]=255;
  }
  return {data:out,width,height};
}
root.DonaAntoniaPhotoGeometry={homography,warp};
})(typeof window==='undefined'?globalThis:window);


// === inventory-label-photo-markers.js ===
/* DA6 — detectar os quatro quadrados pretos de referência na foto. */
(function(root){
'use strict';
function findMarkers(img,threshold=105){
 if(!img?.data||img.width<300||img.height<300)throw Error('image_too_small');
 const scale=Math.min(1,Math.sqrt(700000/(img.width*img.height)));
 const w=Math.round(img.width*scale),h=Math.round(img.height*scale);
 const dark=new Uint8Array(w*h),seen=new Uint8Array(w*h),queue=new Int32Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const ix=Math.min(img.width-1,Math.floor(x/scale)),iy=Math.min(img.height-1,Math.floor(y/scale));
  const i=(iy*img.width+ix)*4;
  dark[y*w+x]=(img.data[i]*77+img.data[i+1]*150+img.data[i+2]*29)<threshold*256?1:0;
 }
 const choices=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const start=y*w+x;if(seen[start]||!dark[start])continue;
  let head=0,tail=1,minx=x,maxx=x,miny=y,maxy=y;queue[0]=start;seen[start]=1;
  while(head<tail){
   const at=queue[head++],px=at%w,py=Math.floor(at/w);
   minx=Math.min(minx,px);maxx=Math.max(maxx,px);
   miny=Math.min(miny,py);maxy=Math.max(maxy,py);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const nx=px+dx,ny=py+dy;
    if(nx<0||nx>=w||ny<0||ny>=h)continue;
    const n=ny*w+nx;if(dark[n]&&!seen[n]){seen[n]=1;queue[tail++]=n}
   }
  }
  const bw=maxx-minx+1,bh=maxy-miny+1,ratio=bw/bh,fill=tail/(bw*bh),size=Math.min(w,h);
  if(tail<Math.max(15,size*size*.000025)||bw<size*.008||bh<size*.008||bw>size*.095||bh>size*.095||ratio<.55||ratio>1.8||fill<.74)continue;
  const cx=(minx+maxx+1)/(2*w),cy=(miny+maxy+1)/(2*h);
  choices.push({x:cx*img.width,y:cy*img.height,cx,cy,fill});
 }
 const corners=[[0,0],[1,0],[1,1],[0,1]].map(([cx,cy])=>{
  const eligible=choices.filter(p=>(cx?p.cx>.5:p.cx<.5)&&(cy?p.cy>.5:p.cy<.5));
  eligible.sort((a,b)=>Math.hypot(a.cx-cx,a.cy-cy)-Math.hypot(b.cx-cx,b.cy-cy));
  return eligible[0]||null;
 });
 if(corners.some(x=>!x))throw Error('fiducials_not_found');
 const horizontal=Math.hypot(corners[0].x-corners[1].x,corners[0].y-corners[1].y);
 const vertical=Math.hypot(corners[0].x-corners[3].x,corners[0].y-corners[3].y);
 if(horizontal<Math.min(img.width,img.height)*.2||vertical<Math.min(img.width,img.height)*.2)throw Error('fiducials_too_close');
 return corners.map(({x,y})=>({x,y}));
}
root.DonaAntoniaPhotoMarkers={findMarkers};
})(typeof window==='undefined'?globalThis:window);


// === inventory-label-omr-geometry.js ===
/* DA6 · leitura de marcas em imagem previamente retificada 1000×1500. Sem IA. */
(function(root){
'use strict';
const WIDTH_MM=100,HEIGHT_MM=150;
function density(image,cx,cy,radius){
  const {data,width,height}=image;
  const scaleX=width/WIDTH_MM,scaleY=height/HEIGHT_MM;
  const x0=Math.floor((cx-radius)*scaleX),x1=Math.ceil((cx+radius)*scaleX);
  const y0=Math.floor((cy-radius)*scaleY),y1=Math.ceil((cy+radius)*scaleY);
  let dark=0,total=0;
  for(let y=Math.max(0,y0);y<Math.min(height,y1);y++){
    for(let x=Math.max(0,x0);x<Math.min(width,x1);x++){
      const dx=(x+.5)/scaleX-cx,dy=(y+.5)/scaleY-cy;
      if(dx*dx+dy*dy>radius*radius)continue;
      const i=(y*width+x)*4;
      const lum=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
      if(lum<125)dark++;
      total++;
    }
  }
  return total?dark/total:0;
}
function markedDigit(scores){
  if(scores.length!==10)throw Error('digits_required');
  const sorted=scores.map((score,digit)=>({score,digit})).sort((a,b)=>b.score-a.score);
  if(sorted[0].score<.32)return {value:null,confidence:0,reason:'unmarked'};
  // A borda impressa dos círculos vazios interfere na densidade em 203 dpi.
  // Compare o segundo sinal com a linha de base do próprio grupo de dez dígitos.
  const reference=sorted.slice(3).map(x=>x.score).sort((a,b)=>a-b);
  const baseline=reference[Math.floor(reference.length/2)];
  const contrast=sorted[0].score-sorted[1].score;
  if(contrast<.24||(sorted[1].score>.28&&sorted[1].score-baseline>.08))
    return {value:null,confidence:0,reason:'multiple_marks'};
  return {value:sorted[0].digit,confidence:Math.min(1,contrast*1.4)};
}
function read(image){
  if(!image?.data||image.width<500||image.height<750)throw Error('image_too_small');
  const readings=[],errors=[];
  const rowHeight=(76-5)/6;
  for(let slot=1;slot<=6;slot++){
    const top=61+(slot-1)*(rowHeight+1);
    const active=density(image,18.5,top+7.3,1);
    const tens=Array.from({length:10},(_,n)=>density(image,25.09+n*3.535,top+8.7,.55));
    const units=Array.from({length:10},(_,n)=>density(image,61.09+n*3.535,top+8.7,.55));
    if(active<.2){
      if(Math.max(...tens,...units)>.27)errors.push({slot,reason:'marks_without_activation'});
      continue;
    }
    if(active<.36){errors.push({slot,reason:'uncertain_activation'});continue}
    const t=markedDigit(tens),u=markedDigit(units);
    if(t.value===null||u.value===null){errors.push({slot,reason:t.reason||u.reason});continue}
    readings.push({slot,quantity:t.value*10+u.value,confidence:Math.min(t.confidence,u.confidence)});
  }
  return {readings,errors,needs_review:errors.length>0};
}
root.DonaAntoniaOMRGeometry={density,markedDigit,read,geometry:'DA6-100x150-v1'};
})(typeof window==='undefined'?globalThis:window);

// === inventory-label-photo-reader.js ===
/* DA6 — QR da etiqueta + marcações OMR, determinístico. */
(function(root){
'use strict';
function parseQR(raw){
 const match=/^DA6\|([0-9A-Z]{25})\|([0-9A-F]{10})$/.exec(String(raw||'').trim().toUpperCase());
 if(!match)throw Error('invalid_label_qr');
 let n=0n;for(const c of match[1])n=n*36n+BigInt(parseInt(c,36));
 if(n>=(1n<<128n))throw Error('invalid_product_id');
 const hex=n.toString(16).padStart(32,'0');
 return {product_id:[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-'),label_serial:match[2]};
}
function process(img,qrDecoder,omrReader,threshold=105){
 if(typeof qrDecoder!=='function'||typeof omrReader!=='function')throw Error('decoder_required');
 const corners=root.DonaAntoniaPhotoMarkers.findMarkers(img,threshold);
 const warp=root.DonaAntoniaPhotoGeometry.warp;
 let selected=null;
 for(let orientation=0;orientation<4;orientation++){
  const points=corners.map((_,i)=>corners[(i+orientation)%4]);
  const preview=warp(img,points,500,750);
  const qr=qrDecoder(preview.data,500,750,{inversionAttempts:'attemptBoth'});
  if(!qr)continue;
  let identity;try{identity=parseQR(qr.data)}catch{continue}
  const loc=qr.location;
  if(!loc)continue;
  const positions=[loc.topLeftCorner,loc.topRightCorner,loc.bottomRightCorner,loc.bottomLeftCorner].filter(Boolean);
  if(positions.length!==4)continue;
  const x=positions.reduce((sum,p)=>sum+p.x,0)/4;
  const y=positions.reduce((sum,p)=>sum+p.y,0)/4;
  if(x<275||y>315)continue;
  selected={points,identity,orientation};break;
 }
 if(!selected)throw Error('label_qr_not_found');
 const rectified=warp(img,selected.points);
 const marks=omrReader(rectified);
 return {...selected.identity,readings:marks.readings||[],errors:marks.errors||[],
   needs_review:!!marks.needs_review||!marks.readings?.length,geometry:'DA6-100x150-v1'};
}
root.DonaAntoniaPhotoReader={parseQR,process};
})(typeof window==='undefined'?globalThis:window);

export function readDA6(image:{width:number,height:number,data:Uint8ClampedArray}, qrDecoder:(data:Uint8ClampedArray,width:number,height:number,options?:any)=>any,threshold=105){
 const rt:any=globalThis as any;
 return rt.DonaAntoniaPhotoReader.process(image,qrDecoder,rt.DonaAntoniaOMRGeometry.read,threshold);
}
