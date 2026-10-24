import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('vitrine/admin/atendimento/index.html','utf8');
const recorderPath='vitrine/admin/atendimento/attendance-audio-recorder.js';
const mediaPath='vitrine/admin/atendimento/attendance-media-send.js';

assert.equal(fs.existsSync(recorderPath),true,'módulo de gravação deve existir');
const recorder=fs.readFileSync(recorderPath,'utf8');
const media=fs.readFileSync(mediaPath,'utf8');

assert.match(html,/id="recordAudioBtn"/,'composer deve ter botão de gravar áudio');
assert.match(html,/id="audioRecorderPanel"/,'composer deve ter painel de gravação');
assert.match(html,/id="audioRecorderTimer"[^>]*role="timer"/,'gravador deve expor cronômetro acessível');
assert.match(html,/id="stopAudioRecordingBtn"/,'gravador deve permitir parar');
assert.match(html,/id="cancelAudioRecordingBtn"/,'gravador deve permitir cancelar');
assert.match(html,/id="sendRecordedAudioBtn"/,'gravador deve permitir enviar diretamente sem download/anexo manual');
assert.match(html,/id="audioRecorderPreview"[^>]*controls/,'gravador deve permitir ouvir antes do envio');
assert.match(html,/attendance-audio-recorder\.js/,'módulo do gravador deve ser carregado');

assert.match(recorder,/navigator\.mediaDevices\.getUserMedia\(\{audio:true\}\)/,'microfone deve ser pedido somente no fluxo de gravação');
assert.match(recorder,/MediaRecorder\.isTypeSupported/,'OGG nativo deve ser detectado no navegador');
assert.match(recorder,/audio\/ogg;codecs=opus/,'deve preferir OGG/Opus nativo');
assert.match(recorder,/attendance-audio-webcodecs-adapter\.js/,'fallback deve usar adapter WebCodecs local');
assert.doesNotMatch(recorder,/audio\/aac|audio\/mp4|\.m4a/i,'gravador não deve produzir AAC/M4A automaticamente');
assert.match(recorder,/AttendanceOggRecorder\.resolve/,'fallback deve resolver encoder Opus local');
assert.match(recorder,/AttendanceOggRecorder\.isValidOggOpus/,'gravação deve validar OggS/Opus antes de ficar pronta');
assert.match(recorder,/attendance:recorded-audio-ready/,'gravação pronta deve entrar no pipeline de mídia existente');
assert.match(recorder,/attendance:send-recorded-audio/,'botão do gravador deve disparar envio direto pelo pipeline existente');
assert.match(recorder,/new File\(/,'gravação deve virar File compatível com FormData atual');
assert.match(recorder,/type:'audio\/ogg'/,'arquivo automático deve sair com MIME audio/ogg');
assert.match(recorder,/\.ogg/,'arquivo automático deve usar extensão .ogg');
assert.match(recorder,/getTracks\(\)\.forEach/,'stream do microfone deve ser encerrado');
assert.match(recorder,/URL\.revokeObjectURL/,'preview anterior deve liberar memória');
assert.match(recorder,/NotAllowedError|microfone/i,'negação de permissão deve ter estado explícito');
assert.match(recorder,/selectedConversationId/,'gravação deve ficar vinculada à conversa selecionada');
assert.match(recorder,/Anexar/,'falha do encoder local deve orientar fallback manual seguro');

assert.match(media,/attendance:recorded-audio-ready/,'composer de mídia deve aceitar áudio gravado');
assert.match(media,/recordedMediaFile/,'composer deve manter arquivo gravado separado do input nativo');
assert.match(media,/attendance:send-recorded-audio/,'composer de mídia deve aceitar pedido de envio direto do gravador');
assert.match(media,/attendance:media-cleared/,'limpeza do anexo deve sincronizar o gravador');
assert.match(media,/audio\/x-m4a/,'anexo manual M4A deve continuar reconhecendo MIME audio/x-m4a');
assert.match(media,/audio\/m4a/,'anexo manual M4A deve continuar reconhecendo MIME audio/m4a');
assert.match(media,/\.m4a/i,'anexo manual .m4a sem MIME confiável deve continuar normalizável no servidor');
assert.match(media,/function fileForUpload\(file\)[\s\S]*canonicalFileMime\(file\)[\s\S]*new File\(\[file\],file\.name,\{type:canonical/,'M4A manual com MIME alias deve ser reenvelopado com MIME canônico antes do FormData');
assert.match(media,/uploadFile=fileForUpload\(file\)/,'envio deve construir arquivo de upload canônico');
assert.match(media,/form\.set\('file',uploadFile,uploadFile\.name\)/,'FormData deve receber o arquivo canônico, não o MIME alias original');
assert.doesNotMatch(recorder,/graph\.facebook\.com/,'gravador nunca deve chamar Graph diretamente');

console.log('PASS test-attendance-audio-recorder-v1');
