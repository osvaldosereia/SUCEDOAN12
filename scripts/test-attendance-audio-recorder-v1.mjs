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
assert.match(recorder,/MediaRecorder\.isTypeSupported/,'formato deve ser detectado no navegador');
assert.match(recorder,/audio\/mp4/,'deve manter MP4/AAC apenas como fallback compatível');
assert.match(recorder,/audio\/ogg/,'deve tentar OGG compatível com Meta');
assert.match(recorder,/audio\/aac/,'deve tentar AAC antes do fallback MP4 fragmentado');
const oggIndex=recorder.indexOf("{mimeType:'audio/ogg;codecs=opus'");
const aacIndex=recorder.indexOf("{mimeType:'audio/aac'");
const mp4Index=recorder.indexOf("{mimeType:'audio/mp4;codecs=mp4a.40.2'");
assert.ok(oggIndex>=0&&aacIndex>=0&&mp4Index>=0,'formatos OGG/Opus, AAC e MP4/AAC devem estar declarados');
assert.ok(oggIndex<aacIndex&&aacIndex<mp4Index,'gravador deve priorizar OGG/Opus, depois AAC e deixar MP4/AAC por último');
assert.doesNotMatch(recorder,/audio\/webm/,'não deve produzir WebM que o transporte atual não aceita');
assert.match(recorder,/attendance:recorded-audio-ready/,'gravação pronta deve entrar no pipeline de mídia existente');
assert.match(recorder,/attendance:send-recorded-audio/,'botão do gravador deve disparar envio direto pelo pipeline existente');
assert.match(recorder,/new File\(/,'gravação deve virar File compatível com FormData atual');
assert.match(recorder,/getTracks\(\)\.forEach/,'stream do microfone deve ser encerrado');
assert.match(recorder,/URL\.revokeObjectURL/,'preview anterior deve liberar memória');
assert.match(recorder,/NotAllowedError|microfone/i,'negação de permissão deve ter estado explícito');
assert.match(recorder,/selectedConversationId/,'gravação deve ficar vinculada à conversa selecionada');
assert.match(recorder,/recorder\.mimeType/,'formato efetivamente produzido pelo MediaRecorder deve ser observado');
assert.match(recorder,/recording_mime_type:actualMimeType/,'evento deve transportar o MIME efetivamente produzido, não apenas o solicitado');
assert.match(recorder,/Formato real:/,'UI deve mostrar o MIME real para diagnóstico do canário');

assert.match(media,/attendance:recorded-audio-ready/,'composer de mídia deve aceitar áudio gravado');
assert.match(media,/recordedMediaFile/,'composer deve manter arquivo gravado separado do input nativo');
assert.match(media,/attendance:send-recorded-audio/,'composer de mídia deve aceitar pedido de envio direto do gravador');
assert.match(media,/attendance:media-cleared/,'limpeza do anexo deve sincronizar o gravador');
assert.match(media,/audio\/x-m4a/,'arquivo M4A baixado deve aceitar MIME audio/x-m4a do navegador');
assert.match(media,/audio\/m4a/,'arquivo M4A baixado deve aceitar MIME audio/m4a do navegador');
assert.match(media,/\.m4a/i,'arquivo .m4a sem MIME confiável deve ser reconhecido e normalizado com segurança no servidor');
assert.match(media,/function fileForUpload\(file\)[\s\S]*canonicalFileMime\(file\)[\s\S]*new File\(\[file\],file\.name,\{type:canonical/,'M4A com MIME alias deve ser reenvelopado com MIME canônico antes do FormData');
assert.match(media,/uploadFile=fileForUpload\(file\)/,'envio deve construir arquivo de upload canônico');
assert.match(media,/form\.set\('file',uploadFile,uploadFile\.name\)/,'FormData deve receber o arquivo canônico, não o MIME alias original');
assert.doesNotMatch(recorder,/graph\.facebook\.com/,'gravador nunca deve chamar Graph diretamente');

console.log('PASS test-attendance-audio-recorder-v1');
