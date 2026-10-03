import fs from 'node:fs';
const path='checkout-resilience.js';
let s=fs.readFileSync(path,'utf8');
const old="    return Boolean(result?.classList?.contains('found')&&/cadastro completo/i.test(String(result.textContent||''))&&!byId('checkoutName'));";
const next="    return Boolean(result?.classList?.contains('found')&&!byId('checkoutName'));";
if(s.includes(old))s=s.replace(old,next);
else if(!s.includes(next))throw new Error('existingRegistrationComplete contract not found');
fs.writeFileSync(path,s);
console.log('existing registration detection updated');
