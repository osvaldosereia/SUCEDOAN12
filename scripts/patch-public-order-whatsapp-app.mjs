import fs from 'node:fs';
const path='pedido/index.html';
let s=fs.readFileSync(path,'utf8');
const from="function talkToWhatsapp(channel){const phone=CHANNELS[String(channel||'')]||CHANNELS['0975'];location.href='https://wa.me/'+phone}";
const to="function talkToWhatsapp(channel){const phone=CHANNELS[String(channel||'')]||CHANNELS['0975'],appUrl='whatsapp://send?phone='+encodeURIComponent(phone);location.href=appUrl;setTimeout(()=>{if(document.visibilityState==='visible')location.href='https://wa.me/'+phone},900)}";
if(!s.includes(from))throw new Error('public WhatsApp function marker not found');
s=s.replace(from,to);
fs.writeFileSync(path,s);
console.log('public order WhatsApp app-first handoff patched');
