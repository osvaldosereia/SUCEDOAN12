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
