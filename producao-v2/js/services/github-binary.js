import { text } from '../core/utils.js';

function requireConfig(config) {
  const missing = [];
  if (!text(config.githubToken)) missing.push('token GitHub');
  if (!text(config.githubOwner)) missing.push('owner GitHub');
  if (!text(config.githubRepo)) missing.push('repositório GitHub');
  if (!text(config.githubBranch)) missing.push('branch GitHub');
  if (missing.length) throw new Error(`Configuração incompleta: ${missing.join(', ')}.`);
  if (!config.writeMode) throw new Error('O modo geral de gravação da V2 está bloqueado.');
}

function apiUrl(config, path) {
  const clean = text(path).replace(/^\/+/, '');
  return `https://api.github.com/repos/${encodeURIComponent(config.githubOwner)}/${encodeURIComponent(config.githubRepo)}/contents/${clean.split('/').map(encodeURIComponent).join('/')}`;
}

async function readExisting(config, path) {
  const response = await fetch(`${apiUrl(config, path)}?ref=${encodeURIComponent(config.githubBranch)}&_=${Date.now()}`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.githubToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub retornou ${response.status} ao consultar a imagem.`);
  return response.json();
}

export async function upsertBase64File(config, path, base64Content, message) {
  requireConfig(config);
  const clean = text(path).replace(/^\/+/, '');
  const base64 = text(base64Content).replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  if (base64.length < 80) throw new Error('A imagem está vazia ou em formato inválido.');
  let lastError = '';
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const existing = await readExisting(config, clean);
    const body = {
      message: message || `Atualiza ${clean} pelo Admin V2`,
      branch: config.githubBranch,
      content: base64,
      ...(existing?.sha ? { sha: existing.sha } : {}),
    };
    const response = await fetch(apiUrl(config, clean), {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${config.githubToken}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      const result = await response.json();
      return { path: clean, sha: result?.content?.sha || '', commit: result?.commit?.sha || '', url: rawGithubUrl(config, clean) };
    }
    lastError = await response.text().catch(() => '');
    if (![409, 422].includes(response.status) || attempt === 4) {
      throw new Error(`GitHub retornou ${response.status}${lastError ? `: ${lastError.slice(0, 240)}` : ''}`);
    }
    await new Promise(resolve => setTimeout(resolve, attempt * 450));
  }
  throw new Error(`Não foi possível gravar ${clean}. ${lastError}`);
}

export function rawGithubUrl(config, path) {
  const clean = text(path).replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${encodeURIComponent(config.githubOwner)}/${encodeURIComponent(config.githubRepo)}/${encodeURIComponent(config.githubBranch)}/${clean}`;
}
