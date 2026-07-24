import { catalogVersionPayload } from '../core/catalog.js';
import { text } from '../core/utils.js';

function requiredConfig(config) {
  const missing = [];
  if (!text(config.githubToken)) missing.push('token GitHub');
  if (!text(config.githubOwner)) missing.push('owner GitHub');
  if (!text(config.githubRepo)) missing.push('repositório GitHub');
  if (!text(config.githubBranch)) missing.push('branch GitHub');
  if (!text(config.productsHomePath)) missing.push('caminho de produtos-home');
  if (!text(config.catalogVersionPath)) missing.push('caminho de catalog-version');
  return missing;
}

export function githubConfigProblems(config) {
  return requiredConfig(config);
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
  const response = await fetch(`${apiBase(config)}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.githubToken}`,
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

async function upsertText(config, path, content, message) {
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

export async function testGithubConnection(config) {
  const missing = requiredConfig(config);
  if (missing.length) throw new Error(`Configuração incompleta: ${missing.join(', ')}.`);
  const repository = await request(config, '');
  return {
    repository: repository?.full_name || `${config.githubOwner}/${config.githubRepo}`,
    defaultBranch: repository?.default_branch || '',
  };
}

export async function publishCatalog(config, productsPayload) {
  const missing = requiredConfig(config);
  if (missing.length) throw new Error(`Configuração incompleta: ${missing.join(', ')}.`);
  if (!config.writeMode) throw new Error('As gravações da V2 estão bloqueadas.');

  const productsResult = await upsertText(
    config,
    config.productsHomePath,
    JSON.stringify(productsPayload, null, 2),
    'Atualiza produtos-home.json pelo Admin V2 Dona Antônia',
  );

  let versionResult = { path: config.catalogVersionPath, skipped: true };
  if (!productsResult.skipped) {
    versionResult = await upsertText(
      config,
      config.catalogVersionPath,
      JSON.stringify(catalogVersionPayload(config, ['products']), null, 2),
      'Atualiza catalog-version.json pelo Admin V2 Dona Antônia',
    );
  }

  return {
    products: productsResult,
    version: versionResult,
    written: [productsResult, versionResult].filter(item => !item.skipped).length,
    skipped: [productsResult, versionResult].filter(item => item.skipped).length,
    publishedAt: new Date().toISOString(),
  };
}
