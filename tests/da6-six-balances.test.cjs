/* DA6: ensaio geométrico determinístico de seis contagens na mesma etiqueta. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context={Uint8ClampedArray,Uint8Array,Int32Array,Math,BigInt};
for(const name of ['inventory-label-photo-homography','inventory-label-photo-markers','inventory-label-omr-geometry','inventory-label-photo-reader'])
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../vitrine/admin/'+name+'.js'),'utf8'),context);
const width=1000,height=1500,pixels=new Uint8ClampedArray(width*height*4);
pixels.fill(255);
function fill(x,y,r){
 for(let yy=Math.floor(y-r);yy<=y+r;yy++)for(let xx=Math.floor(x-r);xx<=x+r;xx++){
  if((xx-x)**2+(yy-y)**2>r*r||xx<0||xx>=width||yy<0||yy>=height)continue;
  const k=(yy*width+xx)*4;pixels[k]=pixels[k+1]=pixels[k+2]=0;
 }
}
const counts=[0,1,7,10,23,99];
for(const [x,y] of [[31,31],[969,31],[969,1469],[31,1469]])
 for(let yy=y-16;yy<y+16;yy++)for(let xx=x-16;xx<x+16;xx++){
  const k=(yy*width+xx)*4;pixels[k]=pixels[k+1]=pixels[k+2]=0;
 }
for(let i=0;i<6;i++){
 const top=61+i*((76-5)/6+1),qty=counts[i];
 fill(185,(top+7.3)*10,10);
 fill((25.09+Math.floor(qty/10)*3.535)*10,(top+8.7)*10,7.5);
 fill((61.09+(qty%10)*3.535)*10,(top+8.7)*10,7.5);
}
const image={data:pixels,width,height};
const uuid='9a7b3c2d-3333-4444-8888-0123456789ab';
const qr='DA6|'+BigInt('0x'+uuid.replace(/-/g,'')).toString(36).toUpperCase().padStart(25,'0')+'|ABCDEF1234';
const fakeQR=()=>({data:qr,location:{
 topLeftCorner:{x:385,y:80},topRightCorner:{x:440,y:80},
 bottomRightCorner:{x:440,y:130},bottomLeftCorner:{x:385,y:130}
}});
test('OMR extrai seis quantidades sem inventar data',()=>{
 const readings=context.DonaAntoniaOMRGeometry.read(image);
 assert.equal(readings.errors.length,0);
 assert.deepEqual(Array.from(readings.readings,x=>x.quantity),counts);
});
test('foto geométrica recupera identidade e seis balanços',()=>{
 const decoded=context.DonaAntoniaPhotoReader.process(image,fakeQR,context.DonaAntoniaOMRGeometry.read);
 assert.equal(decoded.product_id,uuid);
 assert.equal(decoded.label_serial,'ABCDEF1234');
 assert.deepEqual(Array.from(decoded.readings,x=>x.quantity),counts);
 assert.equal(decoded.needs_review,false);
});
test('duas bolinhas preenchidas no mesmo grupo exigem revisão',()=>{
 const copy={...image,data:new Uint8ClampedArray(image.data)};
 const top=61;
 for(let yy=0;yy<1500;yy++)for(let xx=0;xx<1000;xx++){
  if((xx-((25.09+3.535)*10))**2+(yy-(top+8.7)*10)**2>7.5**2)continue;
  const k=(yy*width+xx)*4;copy.data[k]=copy.data[k+1]=copy.data[k+2]=0;
 }
 const out=context.DonaAntoniaOMRGeometry.read(copy);
 assert.ok(out.errors.some(x=>x.slot===1));
 assert.equal(out.readings.length,5);
});
