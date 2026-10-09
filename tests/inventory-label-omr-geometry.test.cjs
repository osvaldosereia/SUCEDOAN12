// DA6 · testes de leitura de marcações. Executar com node --test.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={window:{}};
vm.runInNewContext(fs.readFileSync('vitrine/admin/inventory-label-omr-geometry.js','utf8'),context);
const omr=context.window.DonaAntoniaOMRGeometry;
function blank(){
 const width=1000,height=1500,data=new Uint8ClampedArray(width*height*4);data.fill(255);
 return {width,height,data};
}
function dot(image,x,y,r=.9){
 for(let yy=Math.floor((y-r)*10);yy<Math.ceil((y+r)*10);yy++)
 for(let xx=Math.floor((x-r)*10);xx<Math.ceil((x+r)*10);xx++){
  if((xx/10-x)**2+(yy/10-y)**2>r*r)continue;
  const i=(yy*image.width+xx)*4;
  image.data[i]=image.data[i+1]=image.data[i+2]=0;
 }
}
function mark(image,slot,qty){
 const y=61+(slot-1)*((76-5)/6+1);
 dot(image,18.5,y+7.3,1.05);
 dot(image,25.09+Math.floor(qty/10)*3.535,y+8.7);
 dot(image,61.09+(qty%10)*3.535,y+8.7);
}
for(const qty of [0,1,7,10,23,41,99]){
 test('decodifica '+qty,()=>{
  const image=blank();mark(image,1,qty);
  assert.equal(omr.read(image).readings[0].quantity,qty);
 });
}
test('dupla marcação exige revisão',()=>{
 const image=blank();mark(image,2,23);
 const y=61+((76-5)/6+1);
 dot(image,25.09+4*3.535,y+8.7);
 const result=omr.read(image);
 assert.equal(result.needs_review,true);
 assert.equal(result.readings.length,0);
});
