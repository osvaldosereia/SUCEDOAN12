import fs from 'node:fs';
const core=fs.readFileSync('supabase/functions/_shared/whatsapp-core-v1.mjs','utf8');
const must=(v,m)=>{if(!v)throw new Error(m)};
must(core.includes("location:type==='location'&&message?.location"),'Meta location canonical metadata missing');
must(core.includes('latitude:Number(message.location.latitude)'), 'Meta latitude missing');
must(core.includes('longitude:Number(message.location.longitude)'), 'Meta longitude missing');
must(core.includes('name:clean(message.location.name,240)'), 'Meta location name missing');
must(core.includes('address:clean(message.location.address,600)'), 'Meta location address missing');
console.log('whatsapp Meta location canonicalization: ok');
