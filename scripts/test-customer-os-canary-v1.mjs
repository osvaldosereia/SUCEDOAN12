import fs from 'node:fs';
import assert from 'node:assert/strict';

const config=fs.readFileSync('admin/runtime-config.js','utf8');
const app=fs.readFileSync('admin/app.js','utf8');
const auth=fs.readFileSync('admin/customer-os-auth.js','utf8');
const api=fs.readFileSync('admin/customer-os-api.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');

assert.match(config,/customerOsSecureUiEnabled:false/,'global Customer OS must remain off during canary');
assert.match(config,/customerOsCanaryEnabled:true/,'canary must be explicitly enabled');
assert.match(config,/customerOsCanaryParam:'customer_os'/);
assert.match(config,/customerOsCanaryValue:'canary'/);

assert.match(app,/customerOsCanaryRequested/);
assert.match(app,/URLSearchParams\(window\.location\.search\)/);
assert.match(app,/customerOsSecureUiEnabled===true\|\|customerOsCanaryRequested\(\)/);
assert.match(app,/CANARY CUSTOMER OS/);
assert.match(app,/ativação global continua desligada/);
assert.match(app,/if\(secureCustomersEnabled\(\)&&!getCustomerOsSession\(\)\)return renderCustomerOsLogin\(\)/,
  'canary must require protected PIN session before customer data is rendered');

assert.match(auth,/^import \{CONFIG\} from '\.\/runtime-config\.js\?v=20260918-customer-os-canary-1';/m);
assert.match(api,/^import \{CONFIG\} from '\.\/runtime-config\.js\?v=20260918-customer-os-canary-1';/m);
assert.match(app,/^import \{CONFIG\} from '\.\/runtime-config\.js\?v=20260918-customer-os-canary-1';/m);
assert.match(html,/app\.js\?v=20260918-customer-directory-3/);

assert.match(auth,/sessionStorage/,'secure session must remain tab-scoped');
assert.match(auth,/^const SESSION_KEY='da_customer_os_session_v1'/m);
assert.match(api,/Authorization:`Bearer \$\{token\}`/);
assert.match(api,/if\(response\.status===401\)[\s\S]*clearCustomerOsSession\(\)/);

console.log('customer os canary contract ok');
