import {spawnSync} from 'node:child_process';
import {existsSync,statSync,unlinkSync} from 'node:fs';
import assert from 'node:assert/strict';
import {buildFfmpegArgs} from '../marketing/creative-studio/render-command.js';

const output='/tmp/creative-studio-smoke.mp4';
if(existsSync(output))unlinkSync(output);
const job={duration_seconds:15,width:1080,height:1920,fps:30,product_snapshot:{name:'Produto Teste',price:19.9,is_offer:false},creative_plan:{concept:'Uma história curta',territory:'surprise'},timeline:{audio:{voice:false,cues:[{time:1.2,event:'reveal',sound:'sparkle_soft'},{time:10.5,event:'price_reveal',sound:'impact'}]},scenes:[{start:0,end:5,summary:'O produto aparece'},{start:5,end:10,summary:'A cena se transforma'},{start:10,end:15,summary:'Oferta e fechamento'}]}};
const args=buildFfmpegArgs(job,{output});
const run=spawnSync('ffmpeg',args,{stdio:'inherit'});assert.equal(run.status,0,'ffmpeg_failed');assert.ok(existsSync(output),'output_missing');assert.ok(statSync(output).size>10000,'output_too_small');
const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type,width,height,r_frame_rate','-show_entries','format=duration','-of','json',output],{encoding:'utf8'});assert.equal(probe.status,0,'ffprobe_failed');const info=JSON.parse(probe.stdout);const video=info.streams.find(s=>s.codec_type==='video'),audio=info.streams.find(s=>s.codec_type==='audio');assert.ok(video,'video_stream_missing');assert.ok(audio,'audio_stream_missing');assert.equal(video.width,1080);assert.equal(video.height,1920);assert.equal(video.r_frame_rate,'30/1');const duration=Number(info.format.duration);assert.ok(duration>=14.8&&duration<=15.2,`duration=${duration}`);console.log(JSON.stringify({ok:true,path:output,size:statSync(output).size,duration,width:1080,height:1920,fps:30,audio:true}));
