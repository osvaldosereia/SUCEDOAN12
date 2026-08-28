import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [bridge, restore, library, compact, cache] = await Promise.all([
  readFile('producao-v2/js/mug-make-native-openai-bridge.js','utf8'),
  readFile('producao-v2/js/mug-command-library-restore-v3.js','utf8'),
  readFile('producao-v2/js/mug-command-library-v1.js','utf8'),
  readFile('producao-v2/js/mug-command-library-compact-v2.js','utf8'),
  readFile('site/canecas-comandos.json','utf8'),
]);

assert.match(bridge,/mug-command-library-v1\.js/);
assert.match(bridge,/mug-command-library-compact-v2\.js/);
assert.match(bridge,/mug-command-library-restore-v3\.js/);
assert.match(library,/mugCommandName/);
assert.match(library,/mugCommandText/);
assert.match(library,/mugCommandSave/);
assert.match(compact,/iniciar_ativo/);
assert.match(restore,/site\/canecas-comandos\.json/);
assert.match(restore,/state\.commands=items/);
assert.match(restore,/mug-command-form/);
const parsed=JSON.parse(cache);
assert.ok(Object.keys(parsed).length>=10,'snapshot deve preservar os comandos existentes');
console.log(`OK · Biblioteca restaurada com ${Object.keys(parsed).length} comandos salvos + criador + padrões ★/☆.`);
