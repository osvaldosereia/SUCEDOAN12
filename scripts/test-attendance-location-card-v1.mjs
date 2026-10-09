import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canonicalMessagesFromMeta} from '../supabase/functions/_shared/whatsapp-core-v1.mjs';
import {
  normalizeWhatsAppLocation,
  locationCoordinates,
  locationMapsUrl
} from '../vitrine/admin/atendimento/attendance-location.mjs';

const message = location => ({message_type:'location',metadata:{location}});
const good=normalizeWhatsAppLocation(message({
  latitude:-15.601,longitude:'-56.097',name:'Portaria',address:'Rua Exemplo, Cuiabá',
  url:'javascript:alert(1)'
}));
assert.equal(good.latitude,-15.601);
assert.equal(good.longitude,-56.097);
assert.equal(good.name,'Portaria');
assert.equal(good.address,'Rua Exemplo, Cuiabá');
assert.equal(locationCoordinates(good),'-15.601000,-56.097000');
assert.equal(locationMapsUrl(good),'https://www.google.com/maps/search/?api=1&query=-15.601000%2C-56.097000');
assert.equal(locationMapsUrl(good).includes('javascript'),false);
assert.equal(normalizeWhatsAppLocation(message({latitude:90,longitude:180})).latitude,90);
for(const coordinates of [
  null,undefined,{},[],{latitude:null,longitude:0},{latitude:'',longitude:0},
  {latitude:'x',longitude:1},{latitude:91,longitude:0},{latitude:1,longitude:181},
  {latitude:Infinity,longitude:0},{latitude:'0;alert(1)',longitude:0}
])assert.equal(normalizeWhatsAppLocation(message(coordinates)),null);
assert.equal(normalizeWhatsAppLocation({metadata:null}),null);

// O Meta deve preservar o mesmo ponto recebido e ecoado pelo WhatsApp Business.
for(const [field,list,direction] of [
  ['messages','messages','inbound'],
  ['smb_message_echoes','message_echoes','outbound']
]){
  const payload={entry:[{id:'123456789',changes:[{field,value:{
    metadata:{phone_number_id:'123456789'},
    [list]:[{
      id:'wamid.location-test-'+direction,type:'location',
      ...(direction==='inbound'?{from:'5565999999999'}:{to:'5565999999999'}),
      timestamp:'1791460000',
      location:{latitude:-15.6,longitude:-56.1,name:'Entrada',address:'Rua Teste'}
    }]
  }}]}]};
  const parsed=canonicalMessagesFromMeta(payload,()=>({id:'account-test'}));
  assert.equal(parsed.length,1);
  assert.equal(parsed[0].message.direction,direction);
  assert.equal(parsed[0].message.message_type,'location');
  assert.equal(parsed[0].message.metadata.location.latitude,-15.6);
  assert.equal(parsed[0].message.metadata.location.longitude,-56.1);
}

const app=fs.readFileSync('vitrine/admin/atendimento/attendance-app.js','utf8');
const html=fs.readFileSync('vitrine/admin/atendimento/index.html','utf8');
const css=fs.readFileSync('vitrine/admin/atendimento/attendance.css','utf8');
const core=fs.readFileSync('supabase/functions/_shared/whatsapp-core-v1.mjs','utf8');
assert.match(app,/msg\.message_type==='location'\)b\.append\(renderLocationMessage\(msg\)\)/);
assert.match(app,/function renderLocationMessage\(msg\)/);
assert.match(app,/O WhatsApp registrou uma localização, mas as coordenadas não estão disponíveis/);
assert.match(app,/Confirme o endereço no pedido antes de usar este ponto na rota/);
assert.match(app,/Abrir no Maps/);
assert.match(app,/Copiar localização/);
assert.match(app,/Compartilhar link/);
assert.match(app,/noopener noreferrer/);
assert.match(app,/locationMapsUrl\(position\)/);
assert.match(html,/attendance-app\.js\?v=mobile-chat-v1-template-history-location-v1/);
assert.match(css,/\.location-card-unavailable/);
assert.match(css,/\.location-actions button/);
assert.match(core,/source_event:'smb_message_echoes'[\s\S]+location:type==='location'&&message\?\.location/);

console.log('OK · localizador WhatsApp válido/incompleto, Maps, cópia, compartilhamento, responsivo e echo Meta.');
