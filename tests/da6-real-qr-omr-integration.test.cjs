/* Integration: QR printed with qrcode-generator, decoded by REAL jsQR, DA6 OMR without AI. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const qrGenerator=require('qrcode-generator');
const jsQR=require('jsqr');
const {DonaAntoniaPhotoReader,DonaAntoniaOMRGeometry}=(()=>{
 const root={Uint8Array,Uint8ClampedArray,Int32Array,BigInt,Math};
 for(const name of ['inventory-label-photo-homography','inventory-label-photo-markers','inventory-label-omr-geometry','inventory-label-photo-reader'])
  vm.runInNewContext(fs.readFileSync('vitrine/admin/'+name+'.js','utf8'),root);
 return root;
})();
const width=1000,height=1500;
const uuid='9a7b3c2d-3333-4444-8888-0123456789ab';
const serial='ABCDEF1234';
const id='DA6|'+BigInt('0x'+uuid.replace(/-/g,'')).toString(36).toUpperCase().padStart(25,'0')+'|'+serial;
const quantities=[0,1,7,10,23,99];
function draw(){
 const data=new Uint8ClampedArray(width*height*4);data.fill(255);
 function blackRect(x0,y0,x1,y1){
  for(let y=Math.max(0,Math.floor(y0));y<Math.min(height,Math.ceil(y1));y++)
   for(let x=Math.max(0,Math.floor(x0));x<Math.min(width,Math.ceil(x1));x++){
    const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;
   }
 }
 function dot(cx,cy,r){
  for(let y=Math.floor(cy-r);y<=cy+r;y++)for(let x=Math.floor(cx-r);x<=cx+r;x++){
   if((x-cx)**2+(y-cy)**2>r*r||x<0||x>=width||y<0||y>=height)continue;
   const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;
  }
 }
 for(const [x,y] of [[31,31],[969,31],[969,1469],[31,1469]])
  blackRect(x-16,y-16,x+16,y+16);
 const qr=qrGenerator(0,'M');qr.addData(id);qr.make();
 const modules=qr.getModuleCount(),cell=170/(modules+8),startX=780,startY=170;
 for(let y=0;y<modules;y++)for(let x=0;x<modules;x++)if(qr.isDark(y,x))
  blackRect(startX+(x+4)*cell,startY+(y+4)*cell,
    startX+(x+5)*cell,startY+(y+5)*cell);
 for(let i=0;i<6;i++){
  const top=61+i*((76-5)/6+1),q=quantities[i];
  dot(185,(top+7.3)*10,11);
  dot((25.09+Math.floor(q/10)*3.535)*10,(top+8.7)*10,8);
  dot((61.09+(q%10)*3.535)*10,(top+8.7)*10,8);
 }
 return {data,width,height};
}
const read=image=>DonaAntoniaPhotoReader.process(image,jsQR,DonaAntoniaOMRGeometry.read);
test('QR digital REAL identifica produto e seis contagens',()=>{
 const result=read(draw());
 assert.equal(result.product_id,uuid);
 assert.equal(result.label_serial,serial);
 assert.deepEqual(Array.from(result.readings,r=>r.quantity),quantities);
 assert.equal(result.needs_review,false);
});
test('QR ausente não autoriza interpretação da etiqueta',()=>{
 const image=draw();
 for(let y=170;y<340;y++)for(let x=780;x<950;x++){
  const i=(y*width+x)*4;image.data[i]=image.data[i+1]=image.data[i+2]=255;
 }
 assert.throws(()=>read(image),/label_qr_not_found/);
});
