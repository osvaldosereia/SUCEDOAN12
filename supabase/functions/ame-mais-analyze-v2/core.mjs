import {
  ANALYSIS_MODEL,
  ESCALATION_MODEL,
  ANALYSIS_SCHEMA,
  buildAnalysisPrompt,
  normalizeAnalysis,
  normalizeProductType,
  resolveOpenAiKey,
} from '../ame-mais-analyze-v1/core.mjs';

export { ANALYSIS_MODEL, ESCALATION_MODEL, ANALYSIS_SCHEMA, buildAnalysisPrompt, normalizeAnalysis, resolveOpenAiKey };

export const MAX_INPUT_PHOTOS = 3;
export const OUTPUT_KINDS = Object.freeze(['hero','lifestyle','detail','alternate']);
export const IMAGE_MODEL = 'gpt-image-2.5-sunburst';
export const IMAGE_OUTPUT = Object.freeze({ size:'1024x1024', quality:'low', format:'webp', compression:68 });
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp']);

const clean=v=>String(v??'').replace(/\s+/g,' ').trim();

export function sanitizeEan(value=''){
  return String(value||'').replace(/\D/g,'').slice(0,14);
}

export function validateInputFiles(files=[]){
  const list=Array.from(files||[]).filter(Boolean);
  if(list.length<1) return {ok:false,error:'Envie pelo menos uma foto.'};
  if(list.length>MAX_INPUT_PHOTOS) return {ok:false,error:'Use no máximo 3 fotos.'};
  for(const file of list){
    if(!ACCEPTED_IMAGE_TYPES.has(String(file.type||''))) return {ok:false,error:'Use fotos JPG, PNG ou WebP.'};
    const size=Number(file.size||0);
    if(size<5000||size>MAX_IMAGE_BYTES) return {ok:false,error:'Cada foto deve ter entre 5 KB e 10 MB.'};
  }
  return {ok:true};
}

export function rememberRunId(current=[],runId=''){
  const id=clean(runId);
  if(!id) return Array.from(current||[]).slice(0,3);
  return [id,...Array.from(current||[]).map(clean).filter(x=>x&&x!==id)].slice(0,3);
}

export function shouldEscalateV2(a={}){
  const essentials=Boolean(clean(a.tipo_produto)&&clean(a.nome_cadastro)&&clean(a.descricao_cadastro)&&clean(a.descricao_vitrine));
  return !essentials || Number(a.confianca_geral||0)<0.65;
}

function scene(kind,title,prompt){return {kind,title,prompt,quality:'low'};}

export function buildImagePrompts(analysis={}){
  const type=normalizeProductType(analysis.tipo_produto);
  const name=clean(analysis.nome_cadastro)||clean(analysis.tipo_produto)||'produto';
  const common=`Use todas as fotos de referência como fontes do MESMO produto. Preserve identidade, formato, proporções, cores, símbolos, estampas, inscrições legíveis e detalhes físicos. Não adicione logo, marca, selo, assinatura, marca d'água, etiqueta promocional ou texto sobreposto. Preserve somente marcas e textos que já façam parte fisicamente do produto. Fotografia quadrada de e-commerce ultra-realista, luz natural/profissional, materiais realistas, produto nítido e protagonista.`;
  const hero= type==='camiseta'
    ? `Mostre o MESMO ${name} vestido por uma pessoa adulta, frontalmente, mantendo estampa e cores fiéis.`
    : type==='quadro'
      ? `Mostre o MESMO ${name} aplicado de forma elegante em uma parede real, mantendo arte, moldura e proporção.`
      : `Mostre o MESMO ${name} inteiro ou quase inteiro em composição limpa de e-commerce, com escala plausível.`;
  const lifestyle=`Mostre o MESMO ${name} em uso ou em um ambiente realista coerente com sua função. Não invente função, tamanho ou acessórios incompatíveis.`;
  const detail=`Faça um close-up fotográfico do MESMO ${name}, destacando um detalhe realmente visível nas referências, sem criar componentes novos.`;
  const alternate=`Crie uma quarta fotografia do MESMO ${name} em ângulo alternativo comercial, diferente das anteriores, mantendo máxima fidelidade ao produto e cenário discreto.`;
  return [
    scene('hero','Foto 1 · Principal',`${common} ${hero}`),
    scene('lifestyle','Foto 2 · Em uso',`${common} ${lifestyle}`),
    scene('detail','Foto 3 · Detalhe',`${common} ${detail}`),
    scene('alternate','Foto 4 · Outro ângulo',`${common} ${alternate}`),
  ];
}

export function storagePaths(sessionId){
  const sid=clean(sessionId);
  return {
    sources:[1,2,3].map(i=>`runs-v2/${sid}/source-${i}.jpg`),
    hero:`runs-v2/${sid}/hero.webp`,
    lifestyle:`runs-v2/${sid}/lifestyle.webp`,
    detail:`runs-v2/${sid}/detail.webp`,
    alternate:`runs-v2/${sid}/alternate.webp`,
    result:`runs-v2/${sid}/result.json`,
  };
}
