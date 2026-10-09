/* DA6 R2: photograph-like digital transformations from REAL QR + OMR marks.
 * No remote images, real identities, AI services or production data.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const qrGenerator=require('qrcode-generator'),jsQR=require('jsqr');
const root={Uint8Array,Uint8ClampedArray,Int32Array,BigInt,Math};
for(const name of ['inventory-label-photo-homography','inventory-label-photo-markers','inventory-label-omr-geometry','inventory-label-photo-reader'])
  vm.runInNewContext(fs.readFileSync('vitrine/admin/'+name+'.js','utf8'),root);
const uuid='9a7b3c2d-3333-4444-8888-0123456789ab',serial='F012345678';
const identity='DA6|'+BigInt('0x'+uuid.replace(/-/g,'')).toString(36).toUpperCase().padStart(25,'0')+'|'+serial;
const quantities=[0,1,7,10,23,99];
function fixture(){
 const w=1000,h=1500,data=new Uint8ClampedArray(w*h*4);data.fill(255);
 function rect(x0,y0,x1,y1){
  for(let y=Math.max(0,Math.floor(y0));y<Math.min(h,Math.ceil(y1));y++)
   for(let x=Math.max(0,Math.floor(x0));x<Math.min(w,Math.ceil(x1));x++){
    const i=(y*w+x)*4;data[i]=data[i+1]=data[i+2]=0;
   }
 }
 function dot(cx,cy,r){
  for(let y=Math.floor(cy-r);y<=cy+r;y++)for(let x=Math.floor(cx-r);x<=cx+r;x++){
   if((x-cx)**2+(y-cy)**2>r*r||x<0||x>=w||y<0||y>=h)continue;
   const i=(y*w+x)*4;data[i]=data[i+1]=data[i+2]=0;
  }
 }
 for(const [x,y] of [[31,31],[969,31],[969,1469],[31,1469]])
  rect(x-16,y-16,x+16,y+16);
 const qr=qrGenerator(0,'M');qr.addData(identity);qr.make();
 const m=qr.getModuleCount(),cell=170/(m+8),startX=780,startY=170;
 for(let y=0;y<m;y++)for(let x=0;x<m;x++)if(qr.isDark(y,x))
  rect(startX+(x+4)*cell,startY+(y+4)*cell,startX+(x+5)*cell,startY+(y+5)*cell);
 for(let i=0;i<6;i++){
  const top=61+i*((76-5)/6+1),q=quantities[i];
  dot(185,(top+7.3)*10,11);
  dot((25.09+Math.floor(q/10)*3.535)*10,(top+8.7)*10,8);
  dot((61.09+q%10*3.535)*10,(top+8.7)*10,8);
 }
 return {data,width:w,height:h};
}
function rotate(src,turns){
 const t=((turns%4)+4)%4,w=t%2?src.height:src.width,h=t%2?src.width:src.height;
 const dest=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<src.height;y++)for(let x=0;x<src.width;x++){
  let dx,dy;
  if(t===0){dx=x;dy=y}
  else if(t===1){dx=src.height-1-y;dy=x}
  else if(t===2){dx=src.width-1-x;dy=src.height-1-y}
  else {dx=y;dy=src.width-1-x}
  const from=(y*src.width+x)*4,to=(dy*w+dx)*4;
  dest[to]=src.data[from];dest[to+1]=src.data[from+1];dest[to+2]=src.data[from+2];dest[to+3]=255;
 }
 return {data:dest,width:w,height:h};
}
function invert3(h){
 const [a,b,c,d,e,f,g,j]=h,det=a*(e-f*j)-b*(d-f*g)+c*(d*j-e*g);
 if(Math.abs(det)<1e-14)throw Error('singular_fixture');
 const A=(e-f*j)/det,B=(c*j-b)/det,C=(b*f-c*e)/det;
 const D=(f*g-d)/det,E=(a-c*g)/det,F=(c*d-a*f)/det;
 const G=(d*j-e*g)/det,H=(b*g-a*j)/det,I=(a*e-b*d)/det;
 return [A,B,C,D,E,F,G,H,I];
}
function project(src,targets,width=1250,height=1710){
 const H=root.DonaAntoniaPhotoGeometry.homography(targets),inv=invert3(H);
 const dest=new Uint8ClampedArray(width*height*4);dest.fill(255);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const den=inv[6]*x+inv[7]*y+inv[8],xx=(inv[0]*x+inv[1]*y+inv[2])/den,yy=(inv[3]*x+inv[4]*y+inv[5])/den;
  const ix=Math.round(xx),iy=Math.round(yy);
  if(ix<0||ix>=src.width||iy<0||iy>=src.height)continue;
  const i=(iy*src.width+ix)*4,j=(y*width+x)*4;
  dest[j]=src.data[i];dest[j+1]=src.data[i+1];dest[j+2]=src.data[i+2];dest[j+3]=255;
 }
 return {data:dest,width,height};
}
function shade(src){
 const data=new Uint8ClampedArray(src.data);
 for(let y=0;y<src.height;y++)for(let x=0;x<src.width;x++){
  const i=(y*src.width+x)*4;
  const light=.55+.45*x/src.width;
  for(let c=0;c<3;c++)data[i+c]=Math.round(30+data[i+c]*light*.88);
 }
 return {...src,data};
}
function read(image){return root.DonaAntoniaPhotoReader.process(image,jsQR,root.DonaAntoniaOMRGeometry.read)}
function correct(out){assert.equal(out.product_id,uuid);assert.equal(out.label_serial,serial);assert.deepEqual(Array.from(out.readings,r=>r.quantity),quantities);assert.equal(out.needs_review,false)}
test('R2: etiqueta normal e rotação 90°,180°,270°',()=>{
 const base=fixture();
 correct(read(base));
 for(let turns=1;turns<4;turns++)correct(read(rotate(base,turns)));
});
test('R2: foto inclinada com quatro fiduciais e homografia',()=>{
 const src=fixture();
 const photo=project(src,[{x:153,y:107},{x:1111,y:158},{x:1048,y:1565},{x:88,y:1516}]);
 correct(read(photo));
});
test('R2: sombra gradual na etiqueta não fabrica quantidade',()=>{
 const output=read(shade(fixture()));
 assert.equal(output.product_id,uuid);
 for(const r of output.readings)assert.equal(r.quantity,quantities[r.slot-1]);
 assert.ok(output.readings.length+output.errors.length<=6);
});
test('R2: QR apagado recusa atribuir produto, jamais aceita contagens',()=>{
 const image=fixture();
 for(let y=168;y<344;y++)for(let x=775;x<957;x++){
  const k=(y*image.width+x)*4;
  image.data[k]=image.data[k+1]=image.data[k+2]=255;
 }
 assert.throws(()=>read(image),/label_qr_not_found/);
});
