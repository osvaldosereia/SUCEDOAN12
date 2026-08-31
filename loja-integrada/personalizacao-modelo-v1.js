export const PERSONALIZATION_CONTRACT_BUILD = '20260831-canecafacil-personalization-model-v1';

export const PERSONALIZATION_FIELDS = Object.freeze({
  nome: Object.freeze({ id: 'nome', tipo: 'text', rotulo: 'Nome', max: 80 }),
  foto: Object.freeze({ id: 'foto', tipo: 'image', rotulo: 'Foto' }),
  logo: Object.freeze({ id: 'logo', tipo: 'image', rotulo: 'Logo' }),
  endereco: Object.freeze({ id: 'endereco', tipo: 'text', rotulo: 'Endereço', max: 180 }),
  telefone: Object.freeze({ id: 'telefone', tipo: 'text', rotulo: 'Telefone', max: 40 }),
  site: Object.freeze({ id: 'site', tipo: 'text', rotulo: 'Site', max: 120 })
});

const text = value => String(value ?? '').trim();

function bool(value) {
  return value === true || ['1', 'true', 'sim', 's', 'yes'].includes(text(value).toLowerCase());
}

function normalizeLegacyFields(product = {}) {
  const source = product.personalizacao?.campos
    || product.personalizacao_campos
    || product.campos_personalizacao
    || {};
  const out = {};
  if (Array.isArray(source)) {
    for (const raw of source) {
      const id = text(raw?.id || raw?.key || raw?.nome).toLowerCase();
      if (id && PERSONALIZATION_FIELDS[id]) out[id] = raw || {};
    }
    return out;
  }
  if (source && typeof source === 'object') {
    for (const [id, raw] of Object.entries(source)) {
      if (!PERSONALIZATION_FIELDS[id]) continue;
      out[id] = raw && typeof raw === 'object' ? raw : { ativo: bool(raw) };
    }
  }
  return out;
}

export function normalizePersonalization(product = {}) {
  const config = product.personalizacao && typeof product.personalizacao === 'object'
    ? product.personalizacao
    : {};
  const source = normalizeLegacyFields(product);
  const active = config.ativa === true
    || product.personalizavel === true
    || product.canecafacil_personalizavel === true
    || product.loja_integrada_personalizavel === true
    || product.personalizacao_publica === true;

  const fields = [];
  for (const [id, definition] of Object.entries(PERSONALIZATION_FIELDS)) {
    const raw = source[id] || config.campos?.[id] || {};
    const enabled = bool(raw.ativo ?? raw.enabled);
    if (!enabled) continue;
    fields.push({
      id,
      tipo: definition.tipo,
      rotulo: text(raw.rotulo || raw.label) || definition.rotulo,
      obrigatorio: bool(raw.obrigatorio ?? raw.required),
      max: definition.max || null
    });
  }

  return Object.freeze({
    ativa: active,
    obrigatoria: active && config.obrigatoria === true,
    campos: Object.freeze(fields),
    prompt_base_id: text(config.prompt_base_id || product.personalizacao_prompt_base),
    prompt_base_nome: text(config.prompt_base_nome),
    prompt_base_texto: text(config.prompt_base_texto),
    prompt_base_versao: Number(config.prompt_base_versao || 0) || 0,
    prompt_especifico: text(config.prompt_especifico || product.personalizacao_prompt_especifico),
    permitir_observacao: false,
    config_version: Number(config.config_version || 0) || 0
  });
}

export function validatePersonalizationInput(config, values = {}, files = {}) {
  const errors = [];
  if (!config?.ativa) return { ok: false, errors: ['Personalização não está ativa neste modelo.'] };

  for (const field of config.campos || []) {
    if (field.tipo === 'image') {
      const file = files[field.id];
      if (field.obrigatorio && !file) errors.push(`${field.rotulo} é obrigatório.`);
      continue;
    }
    const value = text(values[field.id]);
    if (field.obrigatorio && !value) errors.push(`${field.rotulo} é obrigatório.`);
    if (value && field.max && value.length > field.max) errors.push(`${field.rotulo} deve ter no máximo ${field.max} caracteres.`);
  }

  return { ok: errors.length === 0, errors };
}

export function publicFields(config) {
  return (config?.campos || []).map(field => ({
    id: field.id,
    tipo: field.tipo,
    rotulo: field.rotulo,
    obrigatorio: field.obrigatorio,
    max: field.max || null
  }));
}

export function buildPersonalizationPrompt(config, values = {}, fileFlags = {}) {
  if (!config?.ativa) throw new Error('Personalização não está ativa neste modelo.');

  const allowed = [];
  const dataLines = [];
  for (const field of config.campos || []) {
    allowed.push(`${field.id} (${field.rotulo})`);
    if (field.tipo === 'image') {
      if (fileFlags[field.id]) dataLines.push(`${field.rotulo}: arquivo enviado pelo cliente.`);
      continue;
    }
    const value = text(values[field.id]);
    if (value) dataLines.push(`${field.rotulo}: ${value}`);
  }

  const guard = [
    'REGRA OBRIGATÓRIA: altere exclusivamente os elementos autorizados abaixo.',
    'Preserve integralmente todos os elementos que não foram autorizados para alteração.',
    'Não acrescente elementos, textos, personagens, cores ou instruções que não estejam explicitamente autorizados.',
    `ELEMENTOS AUTORIZADOS: ${allowed.length ? allowed.join(', ') : 'nenhum'}.`
  ].join('\n');

  const pieces = [
    guard,
    config.prompt_base_texto ? `INSTRUÇÃO PADRÃO DO MODELO:\n${config.prompt_base_texto}` : '',
    config.prompt_especifico ? `INSTRUÇÃO ESPECÍFICA DESTA CANECA:\n${config.prompt_especifico}` : '',
    dataLines.length ? `DADOS FORNECIDOS PELO CLIENTE:\n${dataLines.join('\n')}` : ''
  ].filter(Boolean);

  return pieces.join('\n\n');
}

export function creationPersonalizationSnapshot(config, values = {}, fileFlags = {}) {
  return {
    config_version: Number(config?.config_version || 0) || 0,
    prompt_base_id: text(config?.prompt_base_id),
    prompt_base_nome: text(config?.prompt_base_nome),
    prompt_base_versao: Number(config?.prompt_base_versao || 0) || 0,
    campos_permitidos: publicFields(config),
    valores: Object.fromEntries((config?.campos || [])
      .filter(field => field.tipo !== 'image' && text(values[field.id]))
      .map(field => [field.id, text(values[field.id])])),
    arquivos: Object.fromEntries((config?.campos || [])
      .filter(field => field.tipo === 'image')
      .map(field => [field.id, Boolean(fileFlags[field.id])])),
    observacao_livre: false
  };
}
