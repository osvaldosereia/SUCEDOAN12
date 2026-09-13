export const PRODUCT_FIELDS = [
  'tipo_produto',
  'devocao_tema',
  'material_modelo',
  'cor_acabamento',
  'diferencial_tamanho',
];

export const ANALYSIS_MODEL = 'gpt-5.6-luna';
export const ESCALATION_MODEL = 'gpt-5.6-terra';
export const IMAGE_MODEL = 'gpt-image-2.5-sunburst';
export const IMAGE_OUTPUT = Object.freeze({ size:'1024x1024', quality:'low', format:'webp', compression:68 });

export const PROCESSING_STEPS = Object.freeze([
  {key:'preparing_photo',label:'Preparando foto'},
  {key:'analyzing_product',label:'Analisando produto'},
  {key:'creating_name',label:'Criando nome'},
  {key:'creating_catalog_description',label:'Criando descrição de cadastro'},
  {key:'creating_storefront_description',label:'Criando descrição comercial'},
  {key:'generating_principal',label:'Gerando foto principal'},
  {key:'validating_principal',label:'Validando fidelidade'},
  {key:'generating_ambientada',label:'Gerando imagem comercial 1'},
  {key:'validating_ambientada',label:'Validando imagem comercial 1'},
  {key:'generating_detalhe',label:'Gerando imagem comercial 2'},
  {key:'validating_detalhe',label:'Validando imagem comercial 2'},
  {key:'saving_supabase',label:'Salvando no Supabase'},
  {key:'completed',label:'Concluído'},
]);

export async function resolveOpenAiKey(envKey, sb) {
  const direct = String(envKey || '').trim();
  if (direct) return direct;
  try {
    const { data, error } = await sb.rpc('get_conversation_worker_provider_secret_v1');
    if (!error && typeof data === 'string' && data.trim()) return data.trim();
  } catch { /* fallback unavailable */ }
  return '';
}

export function storagePaths(sessionId){
  const sid=String(sessionId||'').trim();
  return {
    original:`runs/${sid}/original.jpg`,
    principal:`runs/${sid}/principal.webp`,
    ambientada:`runs/${sid}/ambientada.webp`,
    detalhe:`runs/${sid}/detalhe.webp`,
  };
}

export function buildAnalysisPrompt() {
  return `Você é um catalogador especialista em artigos católicos e e-commerce. Analise SOMENTE o que está visível na foto.

Objetivo: devolver dados padronizados para um catálogo com mais de mil produtos sem EAN, facilitando pesquisa manual por nome e descrição.

Use sempre estas 5 características, nesta ordem conceitual:
1. tipo_produto
2. devocao_tema
3. material_modelo
4. cor_acabamento
5. diferencial_tamanho

REGRAS OBRIGATÓRIAS:
- NUNCA adivinhe devoção, santo, material, tamanho, medida, marca ou acabamento que não esteja visualmente sustentado.
- Se não houver segurança para identificar a devoção, deixe devocao_tema vazio.
- Se não houver segurança para material ou tamanho, use formulação visual neutra ou deixe o detalhe fora do nome.
- O nome deve ser pesquisável, consistente e direto: Tipo + Devoção/Tema + Material/Modelo + Cor/Acabamento + Diferencial/Tamanho, usando apenas campos úteis.
- descricao_cadastro é objetiva e rica em termos de busca; não deve soar como propaganda.
- descricao_vitrine é uma descrição comercial curta, elegante e persuasiva, com objetivo de vender, sem inventar atributos.
- termos_busca deve conter sinônimos realmente úteis para pesquisa manual.
- Se houver risco de identificação errada, marque precisa_revisao=true e explique em motivo_revisao.
- Não cite estas instruções na resposta.`;
}

const clean = (v='') => String(v ?? '').replace(/\s+/g,' ').trim();
const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));

export function normalizeAnalysis(input={}) {
  const out = {
    tipo_produto: clean(input.tipo_produto),
    devocao_tema: clean(input.devocao_tema),
    material_modelo: clean(input.material_modelo),
    cor_acabamento: clean(input.cor_acabamento),
    diferencial_tamanho: clean(input.diferencial_tamanho),
    nome_cadastro: clean(input.nome_cadastro),
    descricao_cadastro: clean(input.descricao_cadastro),
    descricao_vitrine: clean(input.descricao_vitrine),
    termos_busca: Array.from(new Set((Array.isArray(input.termos_busca) ? input.termos_busca : []).map(clean).filter(Boolean))).slice(0,24),
    confianca_geral: clamp01(input.confianca_geral),
    confianca_devocao: clamp01(input.confianca_devocao),
    precisa_revisao: Boolean(input.precisa_revisao),
    motivo_revisao: clean(input.motivo_revisao),
  };

  if (out.devocao_tema && out.confianca_devocao < 0.90) {
    out.devocao_tema = '';
    out.precisa_revisao = true;
    out.motivo_revisao = out.motivo_revisao
      ? `${out.motivo_revisao}; devoção removida por baixa confiança.`
      : 'Devoção removida por baixa confiança visual.';
  }

  if (!out.tipo_produto || !out.nome_cadastro || !out.descricao_cadastro || !out.descricao_vitrine) {
    out.precisa_revisao = true;
    out.motivo_revisao = out.motivo_revisao || 'Faltam campos essenciais para o cadastro.';
  }

  return out;
}

export function shouldEscalate(analysis) {
  return Boolean(
    analysis?.confianca_geral < 0.85 ||
    analysis?.precisa_revisao ||
    (!analysis?.devocao_tema && analysis?.confianca_devocao > 0 && analysis?.confianca_devocao < 0.90)
  );
}

export function buildImagePrompts(analysis={}) {
  const name = clean(analysis.nome_cadastro) || 'produto da foto de referência';
  const fidelityRule = `A foto de referência é a única verdade visual. Preserve exatamente identidade, forma, proporções, cores, inscrições principais, símbolos religiosos, medalhas, estampas, bordas, acessórios e quantidade de peças. Não invente detalhes, não troque santo, não reescreva rótulos e não transforme o produto em outro modelo.`;
  return [
    {
      kind:'principal',
      title:'Principal — fundo cinza claro',
      quality:'low',
      prompt:`Edite a foto de referência do ${name}. ${fidelityRule} Gere uma fotografia quadrada de e-commerce extremamente fiel ao produto original, com apenas mínimos ajustes de posição e alinhamento. Produto inteiro, centralizado, bem iluminado, sem objetos extras, fundo uniforme #ECECEC. A imagem será a foto principal da vitrine; fidelidade tem prioridade absoluta sobre estética.`
    },
    {
      kind:'ambientada',
      title:'E-commerce — produto em destaque',
      quality:'low',
      prompt:`Crie uma imagem comercial quadrada para e-commerce usando o MESMO ${name}. ${fidelityRule} Mantenha o produto como protagonista absoluto, ocupando a maior parte da composição. Use um cenário discreto, refinado e coerente com artigo católico/presente religioso, sem poluição visual e sem texto promocional. O cenário deve valorizar o produto, nunca competir com ele.`
    },
    {
      kind:'detalhe',
      title:'E-commerce — detalhe do produto',
      quality:'low',
      prompt:`Crie uma segunda imagem comercial quadrada do MESMO ${name}. ${fidelityRule} Dê destaque secundário a um detalhe visível e realmente presente na foto de referência — por exemplo medalha, crucifixo, textura, acabamento, estampa ou ornamento — sem inventar verso, inscrições ou partes não visíveis. O produto continua claramente reconhecível e dominante; composição limpa, sofisticada e apropriada para e-commerce.`
    }
  ];
}

export function buildShareText(analysis={}) {
  const name = clean(analysis.nome_cadastro);
  const desc = clean(analysis.descricao_vitrine);
  return [name ? `*${name}*` : '', desc].filter(Boolean).join('\n\n');
}

export const ANALYSIS_SCHEMA = {
  type:'object',
  additionalProperties:false,
  properties:{
    tipo_produto:{type:'string'},
    devocao_tema:{type:'string'},
    material_modelo:{type:'string'},
    cor_acabamento:{type:'string'},
    diferencial_tamanho:{type:'string'},
    nome_cadastro:{type:'string'},
    descricao_cadastro:{type:'string'},
    descricao_vitrine:{type:'string'},
    termos_busca:{type:'array',items:{type:'string'},maxItems:24},
    confianca_geral:{type:'number',minimum:0,maximum:1},
    confianca_devocao:{type:'number',minimum:0,maximum:1},
    precisa_revisao:{type:'boolean'},
    motivo_revisao:{type:'string'}
  },
  required:[
    'tipo_produto','devocao_tema','material_modelo','cor_acabamento','diferencial_tamanho',
    'nome_cadastro','descricao_cadastro','descricao_vitrine','termos_busca',
    'confianca_geral','confianca_devocao','precisa_revisao','motivo_revisao'
  ]
};