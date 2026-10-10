class AttendancePcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(){
    super();
    this.active=false;
    this.port.onmessage=event=>{
      if(event?.data?.type==='active')this.active=Boolean(event.data.value);
    };
  }
  process(inputs){
    if(!this.active)return true;
    const input=inputs?.[0]?.[0];
    if(!input?.length)return true;
    const samples=new Float32Array(input);
    this.port.postMessage({type:'pcm',samples},[samples.buffer]);
    return true;
  }
}
registerProcessor('attendance-pcm-capture',AttendancePcmCaptureProcessor);
