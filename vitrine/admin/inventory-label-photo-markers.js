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
