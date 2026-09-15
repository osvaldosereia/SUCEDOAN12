import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const root=readFileSync('index.html','utf8');
const comprar=readFileSync('comprar/index.html','utf8');
const app=readFileSync('comprar/app.js','utf8');

assert.match(root,/id="timeline" class="timeline"/,'root domain must render the Comprar interface');
assert.match(root,/id="cartBar" class="cart-bar"/,'root domain must expose the Comprar fixed cart bar');
assert.match(root,/src="\/comprar\/config\.js\?v=20260915-05/,'root domain must load the Comprar runtime configuration');
for(const file of ['app','baskets','products','checkout','help','admin-test-bridge']){
  assert.match(root,new RegExp(`src="\\/comprar\\/${file}\\.js\\?v=20260915-05`),`root domain must load clean ${file} module`);
}
assert.match(root,/href="\/comprar\/styles\.css\?v=20260915-05/,'root domain must load consolidated Comprar styles');
for(const obsolete of ['chat-light-v2.js','chat-checkout-quantity-v1.js','checkout-final-v2.js','chat-helper-menu.js','phone-retry-v1.js']){
  assert.doesNotMatch(root,new RegExp(obsolete.replaceAll('.','\\.')),`root domain must not load obsolete ${obsolete}`);
}
assert.match(root,/href="https:\/\/donaantonia\.com\.br\/"/,'root canonical URL must remain the main domain');
assert.match(root,/name="robots" content="index,follow/,'main domain must remain indexable');
assert.doesNotMatch(root,/noindex,nofollow/,'main domain must not inherit the internal Comprar noindex rule');
assert.doesNotMatch(root,/\/app-next\//,'legacy storefront must no longer load on the main domain');
assert.doesNotMatch(root,/http-equiv="refresh"/i,'main domain must render Comprar directly instead of redirecting');
assert.match(comprar,/name="robots" content="noindex,nofollow"/,'internal /comprar/ route must remain available and non-indexable');
assert.match(app,/history\.replaceState\(\{\},'',`\$\{location\.pathname\}\?s=\$\{encodeURIComponent\(token\)\}`\)/,'new shopping sessions must preserve the current pathname, including the root domain');

console.log('comprar_root_home_v1_ok');
