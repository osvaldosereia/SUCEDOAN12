import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('vitrine/admin/atendimento/index.html', 'utf8');
const app = readFileSync('vitrine/admin/atendimento/attendance-app.js', 'utf8');
const media = readFileSync('vitrine/admin/atendimento/attendance-media-send.js', 'utf8');

for (const id of ['globalSearch', 'queueList', 'messages', 'messageDraft', 'sendBtn', 'mediaFile', 'sendMediaBtn']) {
  assert.ok(new RegExp(`id="${id}"`).test(html), `Simple chat must keep #${id}.`);
}
for (const channel of ['all', '0975', '1018']) {
  assert.ok(new RegExp(`data-channel-switch="${channel}"`).test(html), `Both WhatsApp numbers must remain reachable (${channel}).`);
}
for (const removed of ['libraryBtn', 'quickRepliesBtn', 'templatesBtn', 'productsBtn', 'catalogBtn', 'moreToolsBtn', 'openContextBtn', 'conversationLabelsBtn', 'recordAudioBtn', 'attendanceLibraryDrawer']) {
  assert.doesNotMatch(html, new RegExp(`id="${removed}"`), `Extra Atendimento tool #${removed} must be removed.`);
}
assert.ok(/accept="[^"]*video\/mp4[^"]*video\/3gpp/.test(html), 'Composer must accept MP4 and 3GPP videos.');
assert.ok(/video\/mp4/.test(media), 'MP4 video must be accepted.');
assert.ok(/video\/3gpp/.test(media), '3GPP video must be accepted.');
assert.ok(/message_type\s*===\s*'video'/.test(app), 'Incoming and outgoing video must render in the conversation.');
assert.ok(!/application\/pdf/.test(media), 'Only image, audio, and video files are part of the simple chat.');

console.log('OK: Atendimento is limited to simple chat with text, audio, images, and videos on both numbers.');
