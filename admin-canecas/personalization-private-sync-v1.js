import { FIREBASE_BASE, text, safeKey, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD = '20260901-admin-canecas-personalization-private-sync-v1';
const PRIVATE_NODE = 'canecas/modelos_privados';
const innerFetch = window.fetch.bind(window);

const FIELD_INSTRUCTIONS = Object.freeze({
  nome: label => `Substitua exclusivamente o nome ou texto correspondente pelo valor exato informado no campo "${label}". Preserve integralmente todos os demais elementos do modelo.`,
  foto: label => `Substitua exclusivamente a fotografia autorizada pela imagem enviada no campo "${label}". Preserve moldura, fundo, textos, cores e todos os demais elementos do modelo.`,
  logo: label => `Substitua exclusivamente a logomarca autorizada pela imagem enviada no campo "${label}". Preserve fielmente símbolo, textos e proporções da logo recebida e mantenha inalterados os demais elementos.`,
  endereco: label => `Substitua exclusivamente o endereço correspondente pelo valor exato informado no campo "${label}". Preserve grafia, números, pontuação e todo o restante do modelo.`,
  telefone: label => `Substitua exclusivamente o telefone correspondente pelo valor exato informado no campo "${label}". Preserve números, sinais e todo o restante do modelo.`,
  site: label => `Substitua exclusivamente o site ou endereço eletrônico correspondente pelo valor exato informado no campo "${label}". Preserve a grafia e todo o restante do modelo.`,
});

function isProductWrite(url, init = {}) {
  const method = String(init?.method || 'GET').toUpperCase();
  if (!['PATCH', 'PUT'].includes(method) || typeof init?.body !== 'string') return null;
  const match = String(url).match(/\/produtos\/([^/?]+)\.json(?:\?|$)/i);
  if (!match) return null;
  try {
    const body = JSON.parse(init.body);
    if (!body || !body.personalizacao || typeof body.personalizacao !== 'object') return null;
    return { key: decodeURIComponent(match[1]), body };
  } catch { return null; }
}

async function fbGet(path) {
  const response = await innerFetch(`${FIREBASE_BASE}/${path}.json?_=${Date.now()}`, { cache:'no-store', headers:{Accept:'application/json'} });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function syncPrivateModel(productKey, personalizacao = {}) {
  const existing = await fbGet(`${PRIVATE_NODE}/${safeKey(productKey)}`).catch(() => null) || {};
  const rawFields = personalizacao.campos && typeof personalizacao.campos === 'object' ? personalizacao.campos : {};
  const previousFields = existing.campos && typeof existing.campos === 'object' ? existing.campos : {};
  const fields = {};

  for (const [id, itemRaw] of Object.entries(rawFields)) {
    const item = itemRaw && typeof itemRaw === 'object' ? itemRaw : {};
    if (item.ativo !== true) continue;
    const label = text(item.rotulo || item.label || id) || id;
    const type = text(item.tipo || item.type || (['foto','logo'].includes(id) ? 'image' : 'text'));
    const previous = previousFields[id] && typeof previousFields[id] === 'object' ? previousFields[id] : {};
    const instructionFactory = FIELD_INSTRUCTIONS[id] || (fieldLabel => `Altere somente o conteúdo correspondente ao campo "${fieldLabel}" usando exatamente o valor informado pelo cliente. Preserve todo o restante do modelo.`);
    fields[id] = {
      id,
      ativo: true,
      obrigatorio: item.obrigatorio === true || item.required === true,
      rotulo: label,
      tipo: type,
      instrucao_ia: text(previous.instrucao_ia) || instructionFactory(label),
    };
  }

  const promptBase = text(personalizacao.prompt_base_texto);
  const promptSpecific = text(personalizacao.prompt_especifico);
  const promptPrivate = [promptBase, promptSpecific].filter(Boolean).join('\n\nINSTRUÇÃO ESPECÍFICA DESTE MODELO:\n');
  const payload = {
    ativo: personalizacao.ativa !== false,
    obrigatoria: personalizacao.obrigatoria === true,
    prompt_privado: promptPrivate,
    prompt_base_id: text(personalizacao.prompt_base_id),
    prompt_base_nome: text(personalizacao.prompt_base_nome),
    prompt_base_versao: Number(personalizacao.prompt_base_versao || 0) || 0,
    prompt_especifico: promptSpecific,
    campos: fields,
    config_version: Number(personalizacao.config_version || 0) || 0,
    atualizado_em: nowIso(),
    origem: BUILD,
  };

  const response = await innerFetch(`${FIREBASE_BASE}/${PRIVATE_NODE}/${safeKey(productKey)}.json`, {
    method:'PUT',
    headers:{'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Firebase privado ${response.status}`);
  return payload;
}

window.fetch = async function cfPersonalizationPrivateSyncFetch(input, init = {}) {
  const target = isProductWrite(input, init);
  const response = await innerFetch(input, init);
  if (!target || !response.ok) return response;
  try {
    await syncPrivateModel(target.key, target.body.personalizacao);
  } catch (error) {
    console.error('[Admin Canecas] Falha ao sincronizar regras privadas da personalização:', error);
  }
  return response;
};

document.documentElement.dataset.cfPersonalizationPrivateSync = BUILD;
console.info(`Admin Canecas · regras privadas do personalizador ${BUILD}`);
