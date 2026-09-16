export const CREATIVE_STUDIO_MODEL=Deno.env.get('CREATIVE_STUDIO_MODEL')||'gpt-5.6-luna';

const MOTIONS=['enter_left','enter_right','enter_top','rise','drop','hop','bounce','shake','wobble','spin','tilt','slide','peek','fall','push','pull','chase','follow','orbit','scatter','stack','celebrate','squash','stretch','zoom','reveal','exit'];
const BEHAVIORS=['curious','shy','excited','sleepy','nervous','heroic','sneaky','surprised','happy','chaotic'];

const actorSchema={
  type:'object',additionalProperties:false,required:['role','motion','behavior'],
  properties:{
    role:{type:'string'},
    motion:{type:'string',enum:MOTIONS},
    behavior:{type:'string',enum:BEHAVIORS}
  }
};

const sceneSchema={
  type:'object',additionalProperties:false,required:['beat','summary','actors','sound_intent'],
  properties:{
    beat:{type:'string'},
    summary:{type:'string'},
    sound_intent:{type:'string'},
    actors:{type:'array',items:actorSchema}
  }
};

const assetRequestSchema={
  type:'object',additionalProperties:false,required:['need','keywords','role','actions'],
  properties:{
    need:{type:'string'},
    keywords:{type:'array',items:{type:'string'},maxItems:6},
    role:{type:'string'},
    actions:{type:'array',items:{type:'string'},maxItems:4}
  }
};

export const creativePlanSchema={
  type:'object',additionalProperties:false,
  required:['territory','concept','emotions','hook','payoff','product_role','duration','scenes','asset_requests'],
  properties:{
    territory:{type:'string'},
    concept:{type:'string'},
    emotions:{type:'array',items:{type:'string'},maxItems:3},
    hook:{type:'string'},
    payoff:{type:'string'},
    product_role:{type:'string'},
    duration:{type:'integer',minimum:15,maximum:25},
    scenes:{type:'array',minItems:3,maxItems:7,items:sceneSchema},
    asset_requests:{type:'array',maxItems:12,items:assetRequestSchema}
  }
};

export function buildDirectorInstructions(){return `Você é o Senior Creative Director do Estúdio Criativo Dona Antônia. Crie UMA micro-história audiovisual curta e comercialmente verdadeira. Antes da história, escolha o território de maior potencial audiovisual a partir dos creativeSignals; função do produto NÃO tem prioridade automática. Pense como diretor de animação, arte, publicidade e short-form. A história precisa ter hook imediato, protagonista/foco, acontecimento, transformação e payoff memorável. Duração 15–25 segundos. NUNCA use narração, voice-over ou fala necessária para entender. Produto/nome/preço/oferta são dados reais e não podem ser inventados. Não forneça coordenadas, nomes de arquivos ou asset IDs. Peça elementos apenas semanticamente em asset_requests. Use somente motions/behaviors permitidos pelo schema. Prefira histórias executáveis com assets reutilizáveis e elementos procedurais. O fechamento comercial deve surgir naturalmente após o payoff. Se a função óbvia for visualmente inferior a aroma, sabor, sensação, ingrediente, cor, variante, humor, ritual ou associação visual, escolha o território mais forte.`}

export function buildDirectorInput(body:any){return JSON.stringify({product:body.product,creativeSignals:body.creativeSignals||[],recentMemory:(body.recentMemory||[]).slice(0,8),constraints:{duration:[15,25],voice_over:false,one_primary_idea:true,max_external_assets:3,paid_generation:'approval_required'}})}
