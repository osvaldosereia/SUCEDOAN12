import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const failures = [];
const INDEX_PATH = 'producao-v2/data/canecas/catalogos-curados/index-v2.json';
const PICKER_PATH = 'producao-v2/js/mug-phrase-picker-v2.js';
const LEGACY_PATH = 'producao-v2/data/canecas/frases-canecas-v1.json';
const EXPECTED = [
  'familia','profissoes','humor','amor-casal','amizade','empreendedorismo','mulher','masculino','cafe','pets','esporte-fitness','direito','professores','saude','trabalho-escritorio','dia-maes','dia-pais','namorados','natal','aniversario','formatura','amigo-secreto','casamento','gratidao-presente'
];

function read(relative) {
  const file = path.join(ROOT, relative);
  if (!existsSync(file)) {
    failures.push(`Arquivo ausente: ${relative}`);
    return '';
  }
  return readFileSync(file, 'utf8');
}

function parse(relative) {
  const raw = read(relative);
  try { return { raw, data: JSON.parse(raw) }; }
  catch (error) {
    failures.push(`JSON inválido em ${relative}: ${error.message}`);
    return { raw, data: null };
  }
}

const indexResult = parse(INDEX_PATH);
const index = indexResult.data;
let curatedTotal = 0;

if (index) {
  if (index.v !== 2 || !Array.isArray(index.catalogos) || index.catalogos.length !== 24) {
    failures.push('Índice curado precisa conter exatamente 24 catálogos v2.');
  } else {
    const ids = index.catalogos.map(item => item?.id);
    if (new Set(ids).size !== 24) failures.push('Há IDs duplicados no índice curado.');
    for (const id of EXPECTED) if (!ids.includes(id)) failures.push(`Catálogo ausente: ${id}.`);

    for (const meta of index.catalogos) {
      if (!meta?.id || !meta?.nome || !meta?.grupo || !meta?.arquivo) {
        failures.push(`Metadados incompletos no índice: ${meta?.id || 'sem id'}.`);
        continue;
      }
      const relative = `producao-v2/data/canecas/catalogos-curados/${meta.arquivo}`;
      const { data } = parse(relative);
      if (!data) continue;
      if (data.v !== 2 || data.id !== meta.id) failures.push(`Catálogo ${meta.id} não corresponde ao índice.`);
      if (!Array.isArray(data.categorias) || data.categorias.length < 4) failures.push(`Catálogo ${meta.id} possui poucas categorias.`);
      if (!Array.isArray(data.frases) || data.frases.length < 30 || data.frases.length > 140) {
        failures.push(`Catálogo ${meta.id} deve ter entre 30 e 140 frases curadas; recebeu ${data.frases?.length || 0}.`);
        continue;
      }
      curatedTotal += data.frases.length;
      const categories = new Set(data.categorias.map(category => category?.id).filter(Boolean));
      const phrases = [];
      const usage = new Map([...categories].map(id => [id, 0]));
      for (const [position, item] of data.frases.entries()) {
        if (!Array.isArray(item) || item.length !== 2) {
          failures.push(`Catálogo ${meta.id}: frase ${position + 1} não usa [texto,categoria].`);
          continue;
        }
        const [phrase, categoryId] = item;
        if (typeof phrase !== 'string' || phrase.trim().length < 4 || phrase.length > 150) failures.push(`Catálogo ${meta.id}: frase ${position + 1} tem tamanho inadequado.`);
        if (!categories.has(categoryId)) failures.push(`Catálogo ${meta.id}: categoria inválida na frase ${position + 1}.`);
        if (/[{}]|\{a\}|\{v1\}|\{v2\}/.test(String(phrase))) failures.push(`Catálogo ${meta.id}: frase ${position + 1} contém placeholder de gerador.`);
        if (/^(meu combo favorito|minha rotina combina|a vida pede|colecionando .* e bons momentos)/i.test(String(phrase))) failures.push(`Catálogo ${meta.id}: frase ${position + 1} parece herança do molde antigo.`);
        phrases.push(String(phrase).trim().toLowerCase());
        usage.set(categoryId, (usage.get(categoryId) || 0) + 1);
      }
      if (new Set(phrases).size !== phrases.length) failures.push(`Catálogo ${meta.id} contém frases duplicadas.`);
      for (const [categoryId, count] of usage) if (count < 2) failures.push(`Catálogo ${meta.id}: categoria ${categoryId} possui poucas frases.`);
    }
  }
}

const legacy = parse(LEGACY_PATH).data;
if (!legacy || legacy.total !== 400 || !Array.isArray(legacy.listas) || legacy.listas.length !== 2) {
  failures.push('As 400 frases clássicas religiosas/motivacionais não foram preservadas.');
}

const picker = read(PICKER_PATH);
const required = [
  ["const PAGE_SIZE = 20;", 'DOM não está limitado a 20 frases.'],
  ["catalogos-curados/index-v2.json", 'Seletor não usa o índice curado.'],
  ["catalogos-curados/${meta.arquivo}", 'Seletor não carrega cada catálogo curado separadamente.'],
  ["cache: 'force-cache'", 'Cache do navegador não está preservado.'],
  ["openButton.textContent = 'Frases para a arte · curadas'", 'Botão não identifica a biblioteca curada.'],
  ["const LEGACY_URL = new URL('../data/canecas/frases-canecas-v1.json', import.meta.url).href;", 'As 400 frases clássicas não estão ligadas ao seletor.'],
  ["filtered.slice(start, start + PAGE_SIZE)", 'Resultados não estão paginados.'],
  ["validateCurated", 'Seletor não valida os catálogos explícitos.'],
];
for (const [marker, message] of required) if (!picker.includes(marker)) failures.push(message);

const forbidden = [
  'const T=Object.freeze', 'const T = Object.freeze', 'renderTemplate(', 'function expand(', 'if(meta.compact)',
  'catalogos/catalogos-frases-v1.json', '{a}', '{v1}', '{v2}', 'Date.now()', 'picker.open = true', 'Promise.all('
];
for (const marker of forbidden) if (picker.includes(marker)) failures.push(`Padrão proibido no seletor: ${marker}`);

if (failures.length) {
  console.error(`Catálogos de frases: ${failures.length} falha(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Catálogos de frases validados: 24 catálogos curados explícitos (${curatedTotal} frases) + 400 clássicas; sem gerador por molde e com lazy-load preservado.`);
}
