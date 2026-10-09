const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const root={window:{},Uint8ClampedArray,Uint8Array,Int32Array,Math,BigInt};
for(const name of ['inventory-label-photo-homography','inventory-label-photo-markers','inventory-label-photo-reader'])
 vm.runInNewContext(fs.readFileSync('vitrine/admin/'+name+'.js','utf8'),root);
const modules=root.window;
function sample(){
 const width=1000,height=1500,data=new Uint8ClampedArray(width*height*4);data.fill(255);
 for(const [x,y] of [[15,15],[953,15],[953,1453],[15,1453]])
  for(let yy=y;yy<y+32;yy++)for(let xx=x;xx<x+32;xx++){
   const p=(yy*width+xx)*4;data[p]=data[p+1]=data[p+2]=0;
  }
 return {width,height,data};
}
const uuid='9a7b3c2d-3333-4444-8888-0123456789ab';
const qr='DA6|'+BigInt('0x'+uuid.replace(/-/g,'')).toString(36).toUpperCase().padStart(25,'0')+'|ABCDEF1234';
test('QR DA6 recupera produto e serial',()=>{
 const decoded=modules.DonaAntoniaPhotoReader.parseQR(qr);
 assert.equal(decoded.product_id,uuid);assert.equal(decoded.label_serial,'ABCDEF1234');
});
test('quatro marcadores detectados e homografia calculada',()=>{
 const points=modules.DonaAntoniaPhotoMarkers.findMarkers(sample());
 assert.equal(points.length,4);
 assert.ok(Math.abs(points[0].x-31)<3);
 const image=modules.DonaAntoniaPhotoGeometry.warp(sample(),points,100,150);
 assert.equal(image.width,100);assert.equal(image.height,150);
});
test('QR e marcações são combinados sem IA',()=>{
 const fakeQR=()=>({data:qr,location:{
  topLeftCorner:{x:400,y:80},topRightCorner:{x:450,y:80},
  bottomRightCorner:{x:450,y:130},bottomLeftCorner:{x:400,y:130}
 }});
 const out=modules.DonaAntoniaPhotoReader.process(sample(),fakeQR,
  ()=>({readings:[{slot:1,quantity:23,confidence:.9}],errors:[],needs_review:false}));
 assert.equal(out.product_id,uuid);assert.equal(out.readings[0].quantity,23);
 assert.equal(out.needs_review,false);
});
