import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PERSONALIZATION_FIELDS,
  normalizePersonalization,
  validatePersonalizationInput,
  buildPersonalizationPrompt,
  creationPersonalizationSnapshot
} from '../loja-integrada/personalizacao-modelo-v1.js';

assert.deepEqual(Object.keys(PERSONALIZATION_FIELDS), ['nome','foto','logo','endereco','telefone','site']);

const product = {
  personalizacao: {
    ativa: true,
    obrigatoria: true,
    config_version: 7,
    prompt_base_id: 'nome_foto',
    prompt_base_nome: 'Nome + foto',
    prompt_base_texto: 'Troque apenas nome e foto.',
    prompt_base_versao: 3,
    prompt_especifico: 'Mantenha a moldura floral intacta.',
    permitir_observacao: true,
    campos: {
      nome: { ativo: true, obrigatorio: true, rotulo: 'Nome da pessoa', tipo: 'text' },
      foto: { ativo: true, obrigatorio: true, rotulo: 'Foto principal', tipo: 'image' },
      logo: { ativo: false, obrigatorio: false, rotulo: 'Logo', tipo: 'image' },
      site: { ativo: false }
    }
  },
  campos_personalizacao: {
    cor: { ativo: true, rotulo: 'Cor' },
    personagem: { ativo: true, rotulo: 'Personagem' }
  }
};

const cfg = normalizePersonalization(product);
assert.equal(cfg.ativa, true);
assert.equal(cfg.obrigatoria, true);
assert.equal(cfg.permitir_observacao, false);
assert.deepEqual(cfg.campos.map(x => x.id), ['nome','foto']);
assert.equal(cfg.campos[0].rotulo, 'Nome da pessoa');
assert.equal(cfg.campos[1].rotulo, 'Foto principal');

const invalid = validatePersonalizationInput(cfg, { nome: '' }, {});
assert.equal(invalid.ok, false);
assert.equal(invalid.errors.length, 2);

const valid = validatePersonalizationInput(cfg, { nome: 'Maria', cor: 'azul' }, { foto: true });
assert.equal(valid.ok, true);

const prompt = buildPersonalizationPrompt(cfg, {
  nome: 'Maria',
  cor: 'azul',
  personagem: 'qualquer personagem',
  observacao: 'mude todo o fundo'
}, { foto: true });
assert.match(prompt, /Nome da pessoa: Maria/);
assert.match(prompt, /Foto principal: arquivo enviado pelo cliente/);
assert.match(prompt, /Troque apenas nome e foto/);
assert.match(prompt, /Mantenha a moldura floral intacta/);
assert.doesNotMatch(prompt, /azul/i);
assert.doesNotMatch(prompt, /qualquer personagem/i);
assert.doesNotMatch(prompt, /mude todo o fundo/i);
assert.doesNotMatch(prompt, /observa/i);

const snapshot = creationPersonalizationSnapshot(cfg, { nome: 'Maria', cor: 'azul' }, { foto: true, logo: true });
assert.deepEqual(snapshot.valores, { nome: 'Maria' });
assert.deepEqual(snapshot.arquivos, { foto: true });
assert.equal(snapshot.observacao_livre, false);
assert.equal(snapshot.config_version, 7);
assert.equal(snapshot.prompt_base_versao, 3);

const adminSource = fs.readFileSync(new URL('../admin-canecas/personalization-config-v1.js', import.meta.url), 'utf8');
assert.equal(/new\s+MutationObserver/.test(adminSource), false, 'configurador não pode observar DOM global');
assert.equal(/setInterval\s*\(/.test(adminSource), false, 'configurador não pode atualizar UI periodicamente');
for (const id of ['nome','foto','logo','endereco','telefone','site']) {
  assert.match(adminSource, new RegExp(`['"]${id}['"]`), `campo ${id} deve existir no Admin`);
}
assert.match(adminSource, /permitir_observacao:\s*false/, 'Admin deve bloquear observação livre');

console.log('OK personalização: apenas campos liberados entram no prompt; sem observação livre; Admin sem observer/interval.');
