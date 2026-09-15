import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const root=readFileSync('index.html','utf8');
const comprar=readFileSync('comprar/index.html','utf8');
const chat=readFileSync('comprar/chat-light-v2.js','utf8');

assert.match(root,/id="timeline" class="timeline"/,'root domain must render the Comprar interface');
assert.match(root,/id="cartBar" class="cart-bar"/,'root domain must expose the Comprar fixed cart bar');
assert.match(root,/src="\/comprar\/config\.js/,'root domain must load the same Comprar runtime configuration');
assert.match(root,/src="\/comprar\/chat-light-v2\.js/,'root domain must load the Comprar client runtime');
assert.match(root,/href="\/comprar\/chat-light-v2\.css/,'root domain must load Comprar styles through absolute paths');
assert.match(root,/href="https:\/\/donaantonia\.com\.br\/"/,'root canonical URL must remain the main domain');
assert.match(root,/name="robots" content="index,follow/,'main domain must remain indexable');
assert.doesNotMatch(root,/noindex,nofollow/,'main domain must not inherit the internal Comprar noindex rule');
assert.doesNotMatch(root,/\/app-next\//,'legacy storefront must no longer load on the main domain');
assert.doesNotMatch(root,/http-equiv="refresh"/i,'main domain must render Comprar directly instead of redirecting');
assert.match(comprar,/name="robots" content="noindex,nofollow"/,'internal /comprar/ route must remain available and non-indexable');
assert.match(chat,/history\.replaceState\(\{\},'',`\$\{location\.pathname\}\?s=/,'new shopping sessions must preserve the current pathname, including the root domain');

console.log('comprar_root_home_v1_ok');
