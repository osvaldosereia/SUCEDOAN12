import { catalogVersionPayload } from '../core/catalog.js';
import { NFE_RECORDS_PATH, digits } from '../core/nfe.js';
import { text } from '../core/utils.js';

const NFE_XML_PATH = 'fiscal/nfe-importadas';

function requiredConfig(config, { write = true, catalog = true } = {}) {
  const missing = [];
  if (write && !text(config.githubToken)) missing.push('token GitHub');
  if (!text(config.githubOwner)) missing.push('owner GitHub');
  if (!text(config.githubRepo)) missing.push('repositório GitHub');
  if (!text(config.githubBranch)) missing.push('branch GitHub');
  if (catalog && !text(config.productsHomePath)) missing.push('caminho de produtos-home');
  if (catalog && !text(config.catalogVersionPath)) missing.push('caminho de catalog-version');
  return missing;
}

export function githubConfigProblems(config) {
  return requiredConfig(config, { write: true, catalog: true });
}

export function githubNfeConfigProblems(config, { write = false } = {}) {
  return requiredConfig(config, { write, catalog: false });
}

function apiBase(config) {
  return `https://api.github.com/repos/${encodeURIComponent(config.githubOwner)}/${encodeURIComponent(config.githubRepo)}`;
}

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(String(value ?? ''));
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64ToUtf8(value) {
  const binary = atob(String(value || '').replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function request(config, path, options = {}) {
  const token = text(config.githubToken);
  const response = await fetch(`${apiBase(config)}${path}`, {
    ...options,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });
  if (response.status === 404 && options.allowNotFound) return null;
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`GitHub retornou ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ''}`);
  }
  return await response.json().catch(() => null);
}

async function readFile(config, path) {
  const cleanPath = text(path).replace(/^\/+/, '');
  return request(
    config,
    `/contents/${cleanPath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(config.githubBranch)}`,
    { allowNotFound: true },
  );
}

export async function readTextFile(config, path) {
  const missing = requiredConfig(config, { write: false, catalog: false });
  if (missing.length) throw new Error(`Configuração incompleta: ${missing.join(', ')}.`);
  const file = await readFile(config, path);
  if (!file) return null;
  if (!file.content) throw new Error(`O GitHub não retornou o conteúdo de ${path}.`);
  return { path: text(path).replace(/^\/+/, ''), sha: file.sha || '', content: base64ToUtf8(file.content) };
}

export async function readJsonFile(config, path) {
  const file = await readTextFile(config, path);
  if (!file) return null;
  try {
    return { ...file, data: JSON.parse(file.content) };
  } catch {
    throw new Error(`O arquivo ${path} não contém um JSON válido.`);
  }
}

export async function inspectNfeImport(config, accessKey) {
  const key = digits(accessKey);
  if (key.length !== 44) throw new Error('A chave da NF-e precisa ter 44 números para consultar o registro fiscal.');
  const result = await readJsonFile(config, `${NFE_RECORDS_PATH}/${key}.json`);
  return result?.data || null;
}

export async function upsertText(config, path, content, message) {
  const missing = requiredConfig(config, { write: true, catalog: false });
  if (missing.length) throw new Error(`Configuração incompleta: ${missing.join(', ')}.`);
  const cleanPath = text(path).replace(/^\/+/, '');
  const normalizedContent = String(content ?? '').replace(/\r\n/g, '\n').trimEnd() + '\n';

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const old = await readFile(config, cleanPath);
    if (old?.content) {
      const current = base64ToUtf8(old.content).replace(/\r\n/g, '\n').trimEnd() + '\n';
      if (current === normalizedContent) return { path: cleanPath, skipped: true, sha: old.sha };
    }

    const body = {
      message,
      branch: config.githubBranch,
      content: utf8ToBase64(normalizedContent),
    };
    if (old?.sha) body.sha = old.sha;

    try {
      const result = await request(config, `/contents/${cleanPath.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { path: cleanPath, skipped: false, sha: result?.content?.sha || '', commit: result?.commit?.sha || '' };
    } catch (error) {
      const retryable = /GitHub retornou (409|422)/.test(String(error?.message || error));
      if (!retryable || attempt === 4) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`Não foi possível atualizar ${cleanPath}.`);
}

function noteYearMonth(note) {
  const issued = new Date(note?.issuedAt || '');
  const valid = !Number.isNaN(issued.getTime());
  const date = valid ? issued : new Date();
  return { year: String(date.getFullYear()), month: String(date.getMonth() + 1).padStart(2, '0') };
}

export function nfeXmlPath(note) {
  const { year, month } = noteYearMonth(note);
  return `${NFE_XML_PATH}/${year}/${month}/${digits(note?.key)}.xml`;
}

export async function archiveNfeXml(config, note, rawXml) {
  if (!config.writeMode || !config.nfeImportMode) throw new Error('A importação de NF-e está bloqueada nas configurações da V2.');
  const key = digits(note?.key);
  if (key.length !== 44) throw new Error('Chave inválida para arquivar o XML.');
  if (!String(rawXml || '').trim()) throw new Error('XML vazio; o arquivo fiscal não pode ser arquivado.');
  const path = nfeXmlPath(note);
  const result = await upsertText(config, path, rawXml, `Arquiva XML da NF-e ${key} pelo Admin V2`);
  return { ...result, path, archivedAt: new Date().toISOString() };
}

export async function writeNfeImportRecord(config, record) {
  if (!config.writeMode || !config.nfeImportMode) throw new Error('A importação de NF-e está bloqueada nas configurações da V2.');
  const key = digits(record?.chave_nfe || record?.codigo_xml);
  if (key.length !== 44) throw new Error('Registro fiscal sem chave válida de 44 números.');
  const payload = { ...record, chave_nfe: key, codigo_xml: key, registro_path: `${NFE_RECORDS_PATH}/${key}.json` };
  const result = await upsertText(config, payload.registro_path, JSON.stringify(payload, null, 2), `Atualiza controle da NF-e ${key} pelo Admin V2`);
  return { ...result, record: payload };
}

export async function testGithubConnection(config) {
  const missing = requiredConfig(config, { write: true, catalog: false });
  if (missing.length) throw new Error(`Configuração incompleta: ${missing.join(', ')}.`);
  const repository = await request(config, '');
  return { repository: repository?.full_name || `${config.githubOwner}/${config.githubRepo}`, defaultBranch: repository?.default_branch || '' };
}

export async function publishCatalog(config, productsPayload) {
  const missing = requiredConfig(config, { write: true, catalog: true });
  if (missing.length) throw new Error(`Configuração incompleta: ${missing.join(', ')}.`);
  if (!config.writeMode) throw new Error('As gravações da V2 estão bloqueadas.');

  const productsResult = await upsertText(config, config.productsHomePath, JSON.stringify(productsPayload, null, 2), 'Atualiza produtos-home.json pelo Admin V2 Dona Antônia');
  let versionResult = { path: config.catalogVersionPath, skipped: true };
  if (!productsResult.skipped) {
    versionResult = await upsertText(config, config.catalogVersionPath, JSON.stringify(catalogVersionPayload(config, ['products']), null, 2), 'Atualiza catalog-version.json pelo Admin V2 Dona Antônia');
  }
  return { products: productsResult, version: versionResult, written: [productsResult, versionResult].filter(item => !item.skipped).length, skipped: [productsResult, versionResult].filter(item => item.skipped).length, publishedAt: new Date().toISOString() };
}
