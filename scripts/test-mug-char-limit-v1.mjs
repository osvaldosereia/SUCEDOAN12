import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const files={
  adminLoader:'producao-v2/admin-produtivo.html',
  adminLimit:'producao-v2/js/mug-text-limit-v1.js',
  publicLimit:'app-next/src/mug-public-char-limit-v1.js',
  runtime:'app-next/src/mug-public-runtime-v6.js'
};
const [adminLoader,adminLimit,publicLimit,runtime]=await Promise.all(Object.values(files).map(file=>readFile(file,'utf8')));
for(const file of [files.adminLimit,files.publicLimit,files.runtime]){
  const checked=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr||checked.stdout||`Erro de sintaxe em ${file}`);
}

assert.match(adminLoader,/mug-text-limit-v1\.js/,'Admin produtivo não carrega controle de limite');
assert.match(adminLimit,/max_caracteres/,'controle Admin não persiste max_caracteres');
assert.match(adminLimit,/tipo==='texto_longo'\?220:tipo==='texto'\?120:0/,'padrões 120\/220 foram alterados');
assert.match(adminLimit,/Math\.min\(1000,Math\.max\(1,parsed\)\)/,'limite Admin deixou de restringir 1 a 1000');
assert.match(adminLimit,/personalizacao_config_publica:nextCfg/,'Admin não grava configuração pública atualizada');
assert.match(adminLimit,/data-mug-char-limit-input/,'campo numérico do limite não existe');

assert.match(runtime,/mug-public-char-limit-v1\.js/,'runtime público não carrega limite de caracteres');
assert.match(publicLimit,/field\.max_caracteres/,'site não lê max_caracteres do campo');
assert.match(publicLimit,/control\.maxLength=max/,'site não aplica maxlength');
assert.match(publicLimit,/caracteres/,'site não exibe contador de caracteres');
assert.match(publicLimit,/control\.value\.slice\(0,max\)/,'site não protege contra valor acima do limite');

console.log('OK · Limite de caracteres por campo: Admin salva max_caracteres, site aplica maxlength e mostra contador.');
