const SAMPLE_RATE=48000;
const FRAME_DURATION_US=20000;
const FRAME_SAMPLES=960;
const PRE_SKIP=312;
const CHANNELS=1;
const DEFAULT_BITRATE=64000;
const MAX_OGG_PACKET_BYTES=255*255;

function asciiBytes(text){return new TextEncoder().encode(text)}
function writeU16LE(view,offset,value){view.setUint16(offset,value,true)}
function writeU32LE(view,offset,value){view.setUint32(offset,value>>>0,true)}
function writeI16LE(view,offset,value){view.setInt16(offset,value,true)}
function writeU64LE(view,offset,value){
  const n=BigInt(value);
  view.setUint32(offset,Number(n&0xffffffffn),true);
  view.setUint32(offset+4,Number((n>>32n)&0xffffffffn),true);
}
function randomSerial(){
  try{const value=new Uint32Array(1);crypto.getRandomValues(value);return value[0]||1}catch{}
  return ((Date.now()^Math.floor(Math.random()*0xffffffff))>>>0)||1;
}
function lacingFor(packetLength){
  if(packetLength>MAX_OGG_PACKET_BYTES)throw new Error('Pacote Opus excede o limite de uma página Ogg.');
  const segments=[];let remaining=packetLength;
  while(remaining>=255){segments.push(255);remaining-=255}
  segments.push(remaining);
  return Uint8Array.from(segments);
}
function oggCrc(bytes){
  let crc=0;
  for(const byte of bytes){
    crc^=byte<<24;
    for(let bit=0;bit<8;bit++)crc=(crc&0x80000000)?((crc<<1)^0x04c11db7):(crc<<1);
    crc>>>=0;
  }
  return crc>>>0;
}
function makeOggPage(packet,{headerType=0,granulePosition=0,serial,pageSequence=0}={}){
  const payload=packet instanceof Uint8Array?packet:new Uint8Array(packet);
  const segments=lacingFor(payload.length);
  const page=new Uint8Array(27+segments.length+payload.length);
  const view=new DataView(page.buffer);
  page.set(asciiBytes('OggS'),0);
  page[4]=0;
  page[5]=headerType;
  writeU64LE(view,6,granulePosition);
  writeU32LE(view,14,serial);
  writeU32LE(view,18,pageSequence);
  writeU32LE(view,22,0);
  page[26]=segments.length;
  page.set(segments,27);
  page.set(payload,27+segments.length);
  const checksum=oggCrc(page);
  writeU32LE(view,22,checksum);
  return page;
}
function makeOpusHead(){
  const packet=new Uint8Array(19);const view=new DataView(packet.buffer);
  packet.set(asciiBytes('OpusHead'),0);
  packet[8]=1;
  packet[9]=CHANNELS;
  writeU16LE(view,10,PRE_SKIP);
  writeU32LE(view,12,SAMPLE_RATE);
  writeI16LE(view,16,0);
  packet[18]=0;
  return packet;
}
function makeOpusTags(){
  const vendor=asciiBytes('Dona Antonia Attendance WebCodecs');
  const packet=new Uint8Array(8+4+vendor.length+4);const view=new DataView(packet.buffer);
  packet.set(asciiBytes('OpusTags'),0);
  writeU32LE(view,8,vendor.length);
  packet.set(vendor,12);
  writeU32LE(view,12+vendor.length,0);
  return packet;
}
function muxOggOpus(packets,totalInputSamples,serialOverride){
  if(!packets.length)throw new Error('Nenhum pacote Opus foi produzido.');
  const serial=Number.isInteger(serialOverride)?(serialOverride>>>0):randomSerial();let pageSequence=0;
  const pages=[
    makeOggPage(makeOpusHead(),{headerType:2,granulePosition:0,serial,pageSequence:pageSequence++}),
    makeOggPage(makeOpusTags(),{headerType:0,granulePosition:0,serial,pageSequence:pageSequence++}),
  ];
  for(let index=0;index<packets.length;index++){
    const isLast=index===packets.length-1;
    const fullFrameSamples=(index+1)*FRAME_SAMPLES;
    const audibleSamples=isLast?totalInputSamples:Math.min(totalInputSamples,fullFrameSamples);
    const granule=PRE_SKIP+Math.max(0,audibleSamples);
    pages.push(makeOggPage(packets[index],{headerType:isLast?4:0,granulePosition:granule,serial,pageSequence:pageSequence++}));
  }
  return new Blob(pages,{type:'audio/ogg'});
}
async function bytesFrom(value){
  if(value instanceof Uint8Array)return value;
  if(value instanceof ArrayBuffer)return new Uint8Array(value);
  if(value?.arrayBuffer)return new Uint8Array(await value.arrayBuffer());
  return new Uint8Array(0);
}
async function isValidOggOpus(value){
  const bytes=await bytesFrom(value);
  if(bytes.length<32)return false;
  const prefix=bytes.subarray(0,Math.min(bytes.length,65536));
  const text=new TextDecoder('latin1').decode(prefix);
  return text.startsWith('OggS')&&text.includes('OpusHead')&&text.includes('OpusTags');
}
function encoderConfig(audioBitsPerSecond=DEFAULT_BITRATE){
  return {
    codec:'opus',sampleRate:SAMPLE_RATE,numberOfChannels:CHANNELS,
    bitrate:Math.max(6000,Math.min(510000,Number(audioBitsPerSecond)||DEFAULT_BITRATE)),
    opus:{format:'opus',signal:'voice',application:'voip',frameDuration:FRAME_DURATION_US,usedtx:false},
  };
}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}

class WebCodecsOggSession{
  constructor(stream,config){
    this.stream=stream;this.config=config;this.encoderKind='webcodecs';this.state='inactive';
    this.context=null;this.source=null;this.node=null;this.silentGain=null;this.encoder=null;
    this.pending=new Float32Array(0);this.packets=[];this.totalInputSamples=0;this.timestampUs=0;this.encoderError=null;
  }
  _appendPcm(samples){
    if(this.state!=='recording'||!samples?.length)return;
    const incoming=samples instanceof Float32Array?samples:new Float32Array(samples);
    this.totalInputSamples+=incoming.length;
    const combined=new Float32Array(this.pending.length+incoming.length);
    combined.set(this.pending,0);combined.set(incoming,this.pending.length);
    let offset=0;
    while(combined.length-offset>=FRAME_SAMPLES){
      this._encodeFrame(combined.subarray(offset,offset+FRAME_SAMPLES));offset+=FRAME_SAMPLES;
    }
    this.pending=new Float32Array(combined.subarray(offset));
  }
  _encodeFrame(samples){
    if(this.encoderError)throw this.encoderError;
    const frame=new Float32Array(FRAME_SAMPLES);frame.set(samples.subarray(0,FRAME_SAMPLES));
    const audioData=new AudioData({format:'f32',sampleRate:SAMPLE_RATE,numberOfFrames:FRAME_SAMPLES,numberOfChannels:CHANNELS,timestamp:this.timestampUs,data:frame});
    try{this.encoder.encode(audioData)}finally{audioData.close()}
    this.timestampUs+=FRAME_DURATION_US;
  }
  async start(){
    if(this.state!=='inactive')throw new Error('Gravador OGG já foi iniciado.');
    const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!Context||typeof AudioWorkletNode==='undefined')throw new Error('AudioWorklet não está disponível neste navegador.');
    this.context=new Context({sampleRate:SAMPLE_RATE,latencyHint:'interactive'});
    if(this.context.sampleRate!==SAMPLE_RATE){await this.context.close();throw new Error('O navegador não abriu o microfone em 48 kHz.');}
    await this.context.audioWorklet.addModule(new URL('./attendance-audio-pcm-worklet.js?v=webcodecs-ogg-v1',import.meta.url).href);
    this.encoder=new AudioEncoder({
      output:chunk=>{const copy=new Uint8Array(chunk.byteLength);chunk.copyTo(copy);this.packets.push(copy)},
      error:error=>{this.encoderError=error instanceof Error?error:new Error(String(error))},
    });
    this.encoder.configure(this.config);
    this.source=this.context.createMediaStreamSource(this.stream);
    this.node=new AudioWorkletNode(this.context,'attendance-pcm-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:'explicit'});
    this.silentGain=this.context.createGain();this.silentGain.gain.value=0;
    this.node.port.onmessage=event=>{if(event?.data?.type==='pcm')this._appendPcm(event.data.samples)};
    this.source.connect(this.node);this.node.connect(this.silentGain);this.silentGain.connect(this.context.destination);
    await this.context.resume();this.node.port.postMessage({type:'active',value:true});this.state='recording';
  }
  async stop(){
    if(this.state!=='recording')throw new Error('Gravador OGG não está ativo.');
    this.state='finalizing';this.node?.port.postMessage({type:'active',value:false});
    try{
      await wait(35);
      this.source?.disconnect();this.node?.disconnect();this.silentGain?.disconnect();
      if(this.pending.length){this._encodeFrame(this.pending);this.pending=new Float32Array(0)}
      if(this.encoderError)throw this.encoderError;
      await this.encoder.flush();
      if(this.encoderError)throw this.encoderError;
      return muxOggOpus(this.packets,this.totalInputSamples);
    }finally{
      await this._closeGraph();this.state='inactive';
    }
  }
  async cancel(){
    if(this.state==='closed')return;
    this.state='cancelled';this.node?.port.postMessage({type:'active',value:false});
    this.source?.disconnect();this.node?.disconnect();this.silentGain?.disconnect();
    await this._closeGraph();this.state='inactive';
  }
  async _closeGraph(){
    try{if(this.encoder&&this.encoder.state!=='closed')this.encoder.close()}catch{}
    try{if(this.context&&this.context.state!=='closed')await this.context.close()}catch{}
    this.encoder=null;this.context=null;this.source=null;this.node=null;this.silentGain=null;
  }
}

async function resolve(stream,{audioBitsPerSecond=DEFAULT_BITRATE}={}){
  if(!stream)throw new Error('Fluxo de microfone ausente.');
  if(typeof AudioEncoder==='undefined'||typeof AudioData==='undefined'||typeof AudioEncoder.isConfigSupported!=='function')throw new Error('WebCodecs Opus não está disponível neste navegador.');
  const config=encoderConfig(audioBitsPerSecond);
  let support;
  try{support=await AudioEncoder.isConfigSupported(config)}catch(error){throw new Error(`WebCodecs Opus indisponível: ${String(error?.message||error)}`)}
  if(!support?.supported)throw new Error('O navegador não oferece encoder Opus compatível.');
  return new WebCodecsOggSession(stream,config);
}
async function dispose(session){try{await session?.cancel?.()}catch{}}

export const AttendanceOggRecorder={resolve,isValidOggOpus,dispose};
export {PRE_SKIP,muxOggOpus as __testMuxOggOpus};
