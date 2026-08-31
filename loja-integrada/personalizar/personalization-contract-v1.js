export const PERSONALIZATION_CONTRACT_BUILD = '20260831-personalization-contract-v1.1';

export const ALLOWED_FIELDS = Object.freeze({
  nome: Object.freeze({ id: 'nome', label: 'Nome', type: 'text', max: 60 }),
  foto: Object.freeze({ id: 'foto', label: 'Foto', type: 'image' }),
  logo: Object.freeze({ id: 'logo', label: 'Logo', type: 'image' }),
  endereco: Object.freeze({ id: 'endereco', label: 'Endereço', type: 'text', max: 140 }),
  telefone: Object.freeze({ id: 'telefone', label: 'Telefone', type: 'text', max: 40 }),
  site: Object.freeze({ id: 'site', label: 'Site', type: 'text', max: 100 })
});

const text = value => String(value ?? '').trim();
const asBool = value => value === true || value === 1 || value === '1' || String(value ?? '').toLowerCase() === 'true';

function legacyFields(product = {}) {
  const raw = product.personalizacao?.campos || product.personalizacao_campos || product.campos_personalizacao || {};
  const map = {};
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const id = text(item?.id || item?.key || item?.nome).toLowerCase();
      if (id && ALLOWED_FIELDS[id]) map[id] = item || {};
    }
  } else if (raw && typeof raw === 'object') {
    for (const [id, item] of Object.entries(raw)) {
      if (!ALLOWED_FIELDS[id]) continue;
      map[id] = item && typeof item === 'object' ? item : { ativo: asBool(item) };
    }
  }
  return map;
}

export function normalizePersonalizationConfig(product = {}) {
  const raw = product.personalizacao && typeof product.personalizacao === 'object' ? product.personalizacao : {};
  const legacy = legacyFields(product);
  const legacyActive = product.loja_integrada_personalizavel === true || product.canecafacil_personalizavel === true || product.personalizavel === true || product.personalizacao_publica === true;
  const active = typeof raw.ativa === 'boolean' ? raw.ativa : legacyActive;
  const fields = [];
  for (const def of Object.values(ALLOWED_FIELDS)) {
    const item = raw.campos?.[def.id] || legacy[def.id] || {};
    const enabled = item.ativo === true || item.enabled === true || (Array.isArray(product.personalizacao_campos) && legacy[def.id]);
    if (!enabled) continue;
    fields.push({
      id: def.id,
      type: def.type,
      label: text(item.rotulo || item.label || item.nome) || def.label,
      required: item.obrigatorio === true || item.required === true,
      max: Number(item.max || item.maxlength || def.max || 0) || 0
    });
  }
  return {
    active,
    requiredForPurchase: active && raw.obrigatoria === true,
    fields,
    promptBaseId: text(raw.prompt_base_id || product.personalizacao_prompt_base),
    promptBaseName: text(raw.prompt_base_nome),
    promptBaseText: text(raw.prompt_base_texto),
    promptBaseVersion: Number(raw.prompt_base_versao || 0) || 0,
    promptSpecific: text(raw.prompt_especifico || product.personalizacao_prompt_especifico),
    configVersion: Number(raw.config_version || 0) || 0,
    allowFreeInstruction: false
  };
}

export function validatePersonalizationInput(config, values = {}, uploads = {}) {
  const errors = [];
  if (!config?.active) errors.push('Este modelo não está liberado para personalização.');
  const allowed = new Set((config?.fields || []).map(field => field.id));
  for (const key of Object.keys(values || {})) if (!allowed.has(key)) errors.push(`Campo não autorizado: ${key}.`);
  for (const key of Object.keys(uploads || {})) if (!allowed.has(key)) errors.push(`Upload não autorizado: ${key}.`);
  for (const field of config?.fields || []) {
    if (!field.required) continue;
    if (field.type === 'image') {
      if (!uploads?.[field.id]) errors.push(`${field.label} é obrigatório.`);
    } else if (!text(values?.[field.id])) errors.push(`${field.label} é obrigatório.`);
  }
  for (const field of config?.fields || []) {
    if (field.type === 'image' || !field.max) continue;
    if (text(values?.[field.id]).length > field.max) errors.push(`${field.label} excede ${field.max} caracteres.`);
  }
  return errors;
}

function valueLines(config, values = {}, uploads = {}) {
  const lines = [];
  for (const field of config?.fields || []) {
    if (field.type === 'image') {
      if (uploads?.[field.id]) lines.push(`- ${field.label}: imagem enviada pelo cliente no anexo identificado como "${field.id}".`);
      continue;
    }
    const value = text(values?.[field.id]);
    if (value) lines.push(`- ${field.label}: ${value}`);
  }
  return lines;
}

export function buildPersonalizationPrompt(config, values = {}, uploads = {}) {
  const allowedLabels = (config?.fields || []).map(field => field.label).join(', ');
  const parts = [
    'EDITE A ARTE-BASE DESTA CANECA COM FIDELIDADE MÁXIMA.',
    'A arte-base enviada é a composição oficial do modelo e deve permanecer como referência principal.',
    `Você está autorizado a alterar SOMENTE: ${allowedLabels || 'nenhum elemento'}.`,
    'Não acrescente, remova, reescreva ou reposicione qualquer outro elemento que não esteja explicitamente autorizado.',
    'Preserve formato horizontal, composição, fundo, ilustrações, cores, estilo, tipografia e elementos não autorizados.'
  ];
  if (text(config?.promptBaseText)) parts.push(`REGRA PADRÃO DO MODELO:\n${text(config.promptBaseText)}`);
  if (text(config?.promptSpecific)) parts.push(`REGRA ESPECÍFICA DESTA CANECA:\n${text(config.promptSpecific)}`);
  const lines = valueLines(config, values, uploads);
  if (lines.length) parts.push(`DADOS DO CLIENTE AUTORIZADOS PARA ESTA EDIÇÃO:\n${lines.join('\n')}`);
  parts.push('Entregue somente a nova arte horizontal final, preservando tudo o que não foi autorizado a alterar.');
  return parts.join('\n\n');
}

export function makeUploadDescriptors(config, uploads = {}) {
  const allowed = new Set((config?.fields || []).filter(field => field.type === 'image').map(field => field.id));
  return Object.entries(uploads || {})
    .filter(([id, value]) => allowed.has(id) && /^data:image\//i.test(text(value)))
    .map(([id, image_base64]) => ({ field_id: id, role: id, image_base64 }));
}
