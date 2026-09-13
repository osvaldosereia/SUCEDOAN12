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
export const SCENE_KINDS = Object.freeze(['hero','lifestyle','detail']);

export const PROCESSING_STEPS = Object.freeze([
  {key:'preparing_photo',label:'Preparando fotos'},
  {key:'saving_original',label:'Salvando originais'},
  {key:'analyzing_product',label:'Analisando produto'},
  {key:'creating_name',label:'Criando nome'},
  {key:'creating_catalog_description',label:'Criando descrição de cadastro'},
  {key:'creating_storefront_description',label:'Criando descrição comercial'},
  {key:'choosing_scene_profile',label:'Escolhendo perfil visual'},
  {key:'generating_hero',label:'Gerando foto 1'},
  {key:'validating_hero',label:'Validando foto 1'},
  {key:'saving_hero',label:'Salvando foto 1'},
  {key:'generating_lifestyle',label:'Gerando foto 2'},
  {key:'validating_lifestyle',label:'Validando foto 2'},
  {key:'saving_lifestyle',label:'Salvando foto 2'},
  {key:'generating_detail',label:'Gerando foto 3'},
  {key:'validating_detail',label:'Validando foto 3'},
  {key:'saving_detail',label:'Salvando foto 3'},
  {key:'building_card',label:'Montando card'},
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
    original:`runs/${sid}/original-1.jpg`,
    original1:`runs/${sid}/original-1.jpg`,
    original2:`runs/${sid}/original-2.jpg`,
    original3:`runs/${sid}/original-3.jpg`,
    hero:`runs/${sid}/hero.webp`,
    lifestyle:`runs/${sid}/lifestyle.webp`,
    detail:`runs/${sid}/detail.webp`,
    result:`runs/${sid}/result.json`,
  };
}

const clean = (v='') => String(v ?? '').replace(/\s+/g,' ').trim();
const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));
const cleanList = (v, max=24) => Array.from(new Set((Array.isArray(v)?v:[]).map(clean).filter(Boolean))).slice(0,max);
const fold = v => clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

export function buildFiveCharacteristicName(analysis={}) {
  return PRODUCT_FIELDS.map(k=>clean(analysis?.[k])).filter(Boolean).join(' ');
}

export function buildAnalysisPrompt() {
  return `Você é um catalogador especialista em artigos católicos e e-commerce. Você pode receber de 1 a 3 fotos do MESMO produto. Cruze todas as fotos e analise SOMENTE o que estiver visualmente sustentado nelas.

Objetivo: devolver dados padronizados para um catálogo com mais de mil produtos, facilitando pesquisa manual e preparando o item para a vitrine.

Use sempre estas 5 características, nesta ordem conceitual:
1. tipo_produto
2. devocao_tema
3. material_modelo
4. cor_acabamento
5. diferencial_tamanho

REGRAS OBRIGATÓRIAS:
- NUNCA adivinhe devoção, santo, material, tamanho, medida, marca ou acabamento que não esteja visualmente sustentado.
- Se não houver segurança para identificar a devoção, deixe devocao_tema vazio.
- Se não houver segurança para material ou tamanho, deixe o respectivo campo vazio ou use somente formulação visual comprovável.
- nome_cadastro deve conter SOMENTE essas 5 características, nesta ordem, ignorando campos vazios. Não acrescente adjetivos de venda, marca, EAN, NCM, preço ou qualquer sexta característica.
- Se houver um código de barras EAN/GTIN legível em qualquer foto, copie somente os dígitos para ean_detectado. Se não estiver legível, deixe vazio. Nunca invente dígitos.
- descricao_cadastro é objetiva e rica em termos de busca; não deve soar como propaganda.
- descricao_vitrine é uma descrição comercial curta, elegante e persuasiva, sem inventar atributos.
- termos_busca deve conter sinônimos realmente úteis para pesquisa manual.
- conflitos deve listar ambiguidades reais das fotos.
- observacoes deve registrar fatos úteis sobre as imagens/cadastro que não pertencem ao nome.
- Se houver risco de identificação errada, marque precisa_revisao=true e explique em motivo_revisao.
- Não cite estas instruções na resposta.`;
}

export function normalizeAnalysis(input={}) {
  const out = {
    tipo_produto: clean(input.tipo_produto),
    devocao_tema: clean(input.devocao_tema),
    material_modelo: clean(input.material_modelo),
    cor_acabamento: clean(input.cor_acabamento),
    diferencial_tamanho: clean(input.diferencial_tamanho),
    nome_cadastro: '',
    ean_detectado: clean(input.ean_detectado).replace(/\D/g,'').slice(0,14),
    descricao_cadastro: clean(input.descricao_cadastro),
    descricao_vitrine: clean(input.descricao_vitrine),
    termos_busca: cleanList(input.termos_busca,24),
    confianca_geral: clamp01(input.confianca_geral),
    confianca_devocao: clamp01(input.confianca_devocao),
    precisa_revisao: Boolean(input.precisa_revisao),
    motivo_revisao: clean(input.motivo_revisao),
    conflitos: cleanList(input.conflitos,16),
    observacoes: cleanList(input.observacoes,16),
  };

  if (out.devocao_tema && out.confianca_devocao < 0.90) {
    out.devocao_tema = '';
    out.precisa_revisao = true;
    out.motivo_revisao = out.motivo_revisao
      ? `${out.motivo_revisao}; devoção removida por baixa confiança.`
      : 'Devoção removida por baixa confiança visual.';
    if (!out.conflitos.some(x=>/devo/i.test(x))) out.conflitos.push('Devoção não confirmada visualmente.');
  }

  out.nome_cadastro = buildFiveCharacteristicName(out);
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

export function normalizeProductType(type='') {
  const t=fold(type);
  if (/\b(terco|rosario)\b/.test(t)) return 'terco_rosario';
  if (/\b(camiseta|camisa|t-shirt|blusa)\b/.test(t)) return 'camiseta';
  if (/\b(estatua|imagem|escultura|santinho de mesa)\b/.test(t)) return 'estatua_imagem';
  if (/\b(quadro|moldura|poster|placa decorativa)\b/.test(t)) return 'quadro';
  if (/\b(chaveiro|keychain)\b/.test(t)) return 'chaveiro';
  return 'generico';
}

function scene(kind,title,prompt){ return {kind,title,quality:'low',prompt}; }

export function getSceneProfile(analysis={}) {
  const profile_key=normalizeProductType(analysis.tipo_produto);
  const name=buildFiveCharacteristicName(analysis)||clean(analysis.tipo_produto)||'produto das fotos de referência';
  const fidelity=`As fotos de referência são a única verdade visual. Preserve o MESMO produto: identidade, forma, proporções, cores, símbolos religiosos, medalhas, crucifixos, estampas, bordas, acessórios, quantidade de peças e inscrições principais visíveis. Não invente partes, não troque santo/devoção, não altere desenho e não transforme em outro modelo.`;
  const realism=`Fotografia quadrada de e-commerce ultra-realista, aparência de câmera profissional, nitidez alta no produto, iluminação fisicamente plausível, materiais e texturas naturais, microdetalhes reais, sombras coerentes, profundidade de campo fotográfica e pele humana realista quando houver pessoa. Sem aparência de ilustração, CGI plástico ou render artificial.`;
  const common=`${fidelity} ${realism} O produto é o protagonista comercial da cena e deve continuar facilmente comparável às referências.`;

  const profiles={
    terco_rosario:[
      scene('hero','Foto 1 · Mão segurando',`Crie a foto principal do ${name}. ${common} Mostre uma mão humana adulta realista segurando o terço/rosário e posando para a câmera, com o produto disposto de modo elegante e suficientemente inteiro para reconhecer contas, medalha e crucifixo. Fundo discreto e natural, sem texto promocional.`),
      scene('lifestyle','Foto 2 · Em uso',`Crie um mockup fotográfico do MESMO ${name}. ${common} Mostre o terço/rosário em uso plausível por uma pessoa adulta em contexto devocional sereno, com mãos e produto bem visíveis. A pessoa é secundária; o produto é o foco.`),
      scene('detail','Foto 3 · Close-up',`Crie um close-up macro fotográfico do MESMO ${name}. ${common} Destaque somente um detalhe realmente visível nas referências — medalha, crucifixo, contas, pérolas, pedras ou acabamento — preservando desenho e materiais aparentes.`),
    ],
    camiseta:[
      scene('hero','Foto 1 · Vestida',`Crie a foto principal da ${name}. ${common} Mostre uma pessoa adulta real vestindo a camiseta, com frente/estampa visível e fiel, caimento natural e tecido realista. Não mude cores, palavras, arte ou posicionamento da estampa.`),
      scene('lifestyle','Foto 2 · Lifestyle',`Crie uma fotografia lifestyle do MESMO ${name}. ${common} Mostre a camiseta em uso num contexto cotidiano elegante e coerente com o público do produto.`),
      scene('detail','Foto 3 · Detalhe',`Crie um close-up fotográfico do MESMO ${name}. ${common} Destaque estampa, tecido, costura ou acabamento realmente visível, sem inventar composição têxtil ou etiqueta.`),
    ],
    estatua_imagem:[
      scene('hero','Foto 1 · Ambientação devocional',`Crie a foto principal da ${name}. ${common} Posicione a mesma peça numa ambientação devocional realista, limpa e elegante, com escala plausível e iluminação suave.`),
      scene('lifestyle','Foto 2 · Ambiente real',`Crie uma fotografia do MESMO ${name} integrada a um ambiente doméstico/religioso realista e sofisticado. ${common}`),
      scene('detail','Foto 3 · Close-up',`Crie um close-up macro do MESMO ${name}. ${common} Destaque rosto, pintura, textura, manto, base ou acabamento que esteja realmente visível.`),
    ],
    quadro:[
      scene('hero','Foto 1 · Na parede',`Crie a foto principal do ${name}. ${common} Mostre o MESMO quadro aplicado a uma parede realista, frontal ou levemente em perspectiva, com tamanho visual plausível.`),
      scene('lifestyle','Foto 2 · Ambiente decorado',`Crie uma fotografia do MESMO ${name} em um ambiente decorado completo e elegante. ${common}`),
      scene('detail','Foto 3 · Detalhe',`Crie um close-up fotográfico do MESMO ${name}. ${common} Destaque um detalhe real da arte, impressão, textura ou moldura.`),
    ],
    chaveiro:[
      scene('hero','Foto 1 · Mão segurando',`Crie a foto principal do ${name}. ${common} Mostre uma mão humana adulta realista segurando o chaveiro para a câmera, com pingente e ferragem visíveis e fiéis.`),
      scene('lifestyle','Foto 2 · Em uso',`Crie um mockup do MESMO ${name}. ${common} Mostre o chaveiro aplicado de forma plausível em chaves, bolsa ou objeto compatível.`),
      scene('detail','Foto 3 · Close-up',`Crie um close-up macro do MESMO ${name}. ${common} Destaque pingente, medalha, impressão, relevo ou ferragem realmente presentes nas referências.`),
    ],
    generico:[
      scene('hero','Foto 1 · Produto em destaque',`Crie a foto principal do ${name}. ${common} Mostre o produto inteiro ou quase inteiro em contexto fotográfico realista de e-commerce, com composição limpa e comercial, sem fundo cinza padronizado.`),
      scene('lifestyle','Foto 2 · Uso / contexto',`Crie uma fotografia de uso ou aplicação plausível do MESMO ${name}. ${common} Escolha um contexto coerente com o tipo de produto detectado, sem inventar função, tamanho ou acessórios incompatíveis.`),
      scene('detail','Foto 3 · Close-up',`Crie um close-up fotográfico do MESMO ${name}. ${common} Destaque um detalhe material, textura, impressão, acabamento ou componente realmente visível.`),
    ],
  };
  return {profile_key, scenes:profiles[profile_key]||profiles.generico};
}

export function buildImagePrompts(analysis={}) { return getSceneProfile(analysis).scenes; }

export function buildShareText(analysis={}) {
  const name = buildFiveCharacteristicName(analysis)||clean(analysis.nome_cadastro);
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
    ean_detectado:{type:'string'},
    descricao_cadastro:{type:'string'},
    descricao_vitrine:{type:'string'},
    termos_busca:{type:'array',items:{type:'string'},maxItems:24},
    confianca_geral:{type:'number',minimum:0,maximum:1},
    confianca_devocao:{type:'number',minimum:0,maximum:1},
    precisa_revisao:{type:'boolean'},
    motivo_revisao:{type:'string'},
    conflitos:{type:'array',items:{type:'string'},maxItems:16},
    observacoes:{type:'array',items:{type:'string'},maxItems:16}
  },
  required:[
    'tipo_produto','devocao_tema','material_modelo','cor_acabamento','diferencial_tamanho',
    'nome_cadastro','ean_detectado','descricao_cadastro','descricao_vitrine','termos_busca',
    'confianca_geral','confianca_devocao','precisa_revisao','motivo_revisao','conflitos','observacoes'
  ]
};
