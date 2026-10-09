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
  if(sorted[1].score>.22)return {value:null,confidence:0,reason:'multiple_marks'};
  return {value:sorted[0].digit,confidence:Math.min(1,(sorted[0].score-sorted[1].score)*1.4)};
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