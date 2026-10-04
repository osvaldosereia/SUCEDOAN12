import assert from 'node:assert/strict';
import fs from 'node:fs';

const adapterPath='vitrine/admin/atendimento/attendance-audio-webcodecs-adapter.js';
const workletPath='vitrine/admin/atendimento/attendance-audio-pcm-worklet.js';
const recorderPath='vitrine/admin/atendimento/attendance-audio-recorder.js';

assert.equal(fs.existsSync(adapterPath),true,'adapter WebCodecs OGG/Opus deve existir');
assert.equal(fs.existsSync(workletPath),true,'AudioWorklet PCM same-origin deve existir');

const adapter=fs.readFileSync(adapterPath,'utf8');
const worklet=fs.readFileSync(workletPath,'utf8');
const recorder=fs.readFileSync(recorderPath,'utf8');

assert.match(adapter,/const SAMPLE_RATE=48000/,'adapter deve fixar sample rate em 48 kHz');
assert.match(adapter,/const CHANNELS=1/,'adapter deve fixar voz mono');
assert.match(adapter,/const DEFAULT_BITRATE=64000/,'adapter deve fixar bitrate padrão em 64 kbps');
assert.match(adapter,/const FRAME_DURATION_US=20000/,'adapter deve fixar frame Opus em 20 ms');
assert.match(adapter,/const PRE_SKIP=312/,'mux Ogg deve declarar pre-skip libopus a 48 kHz');
assert.match(adapter,/AudioEncoder\.isConfigSupported/,'fallback deve sondar WebCodecs em runtime');
assert.match(adapter,/codec:\s*['"]opus['"]/,'WebCodecs deve usar codec Opus');
assert.match(adapter,/sampleRate:SAMPLE_RATE/,'configuração do encoder deve usar 48 kHz');
assert.match(adapter,/numberOfChannels:CHANNELS/,'configuração do encoder deve usar mono');
assert.match(adapter,/Number\(audioBitsPerSecond\)\|\|DEFAULT_BITRATE/,'configuração deve preservar 64 kbps como padrão');
assert.match(adapter,/format:\s*['"]opus['"]/,'Chromium deve receber pacotes Opus crus para mux Ogg local');
assert.doesNotMatch(adapter,/format:\s*['"]ogg['"]/,'Chromium atual rejeita Opus format=ogg; adapter não deve depender disso');
assert.match(adapter,/signal:\s*['"]voice['"]/,'Opus deve ser otimizado para voz');
assert.match(adapter,/application:\s*['"]voip['"]/,'Opus deve usar aplicação voip');
assert.match(adapter,/frameDuration:FRAME_DURATION_US/,'encoder deve usar frames de 20 ms');
assert.match(adapter,/OpusHead/,'adapter deve criar identification header obrigatório');
assert.match(adapter,/OpusTags/,'adapter deve criar comment header obrigatório');
assert.match(adapter,/OggS/,'adapter deve produzir/validar container Ogg');
assert.match(adapter,/oggCrc|checksum/i,'páginas Ogg devem ter checksum');
assert.match(adapter,/isValidOggOpus/,'adapter deve validar OggS + OpusHead antes do envio');
assert.match(adapter,/audioWorklet\.addModule/,'captura PCM deve carregar worklet same-origin');
assert.match(adapter,/attendance-audio-pcm-worklet\.js/,'adapter deve usar o worklet versionado local');
assert.match(adapter,/async stop\(\)\{[\s\S]*try\{[\s\S]*await this\.encoder\.flush\(\)[\s\S]*finally\{[\s\S]*await this\._closeGraph\(\)/,'stop deve liberar AudioContext/encoder mesmo quando flush ou mux falhar');
assert.doesNotMatch(adapter,/https?:\/\//,'adapter não pode buscar CDN/API externa');
assert.doesNotMatch(adapter,/graph\.facebook\.com/,'adapter nunca deve chamar Meta diretamente');

assert.match(worklet,/registerProcessor/,'worklet deve registrar processador PCM');
assert.match(worklet,/Float32Array/,'worklet deve transportar PCM float32');
assert.doesNotMatch(worklet,/fetch\(|XMLHttpRequest|WebSocket/,'worklet não pode fazer rede');

assert.match(recorder,/attendance-audio-webcodecs-adapter\.js/,'gravador deve importar adapter WebCodecs');
assert.match(recorder,/audio\/ogg;codecs=opus/,'caminho nativo OGG/Opus deve continuar preferencial');
assert.doesNotMatch(recorder,/audio\/aac|audio\/mp4|\.m4a/i,'gravador não pode fazer fallback automático AAC/M4A');
assert.match(recorder,/audio\/ogg/,'arquivo final deve ser OGG');
assert.match(recorder,/\.ogg/,'arquivo gravado deve usar extensão .ogg');
assert.match(recorder,/isValidOggOpus/,'gravador deve validar bytes antes de liberar preview/envio');
assert.match(recorder,/Anexar/,'falha do encoder deve orientar fallback manual seguro');

console.log('PASS test-attendance-audio-webcodecs-v1');
