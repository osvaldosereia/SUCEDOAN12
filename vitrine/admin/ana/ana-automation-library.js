const templates=[
  {
    key:'humano',
    title:'Falar com atendente',
    description:'Transfere imediatamente quando a pessoa pedir atendimento humano.',
    priority:100,
    phrases:['atendente','atendimento humano','falar com uma pessoa','falar com humano','quero falar com alguém'],
    actions:[{type:'handoff'}]
  },
  {
    key:'reclamacao',
    title:'Problema ou reclamação',
    description:'Encaminha atrasos, erros e reclamações para uma pessoa.',
    priority:95,
    phrases:['reclamação','reclamar','problema com pedido','pedido atrasou','não chegou','veio errado','produto errado'],
    actions:[{type:'handoff'}]
  },
  {
    key:'catalogo',
    title:'Abrir catálogo',
    description:'Informa o catálogo oficial sem depender da IA.',
    priority:80,
    phrases:['catálogo','catalogo','ver produtos','ver cestas','cestas básicas','cesta básica'],
    actions:[{type:'fixed_reply',response_text:'Você pode ver nossas cestas, kits e produtos no catálogo: www.donaantonia.com.br'}]
  },
  {
    key:'fazer-pedido',
    title:'Fazer pedido',
    description:'Direciona a compra para o catálogo oficial.',
    priority:85,
    phrases:['quero fazer um pedido','quero comprar','fazer pedido','como faço pedido','como comprar'],
    actions:[{type:'fixed_reply',response_text:'Para escolher os produtos e fazer seu pedido, acesse www.donaantonia.com.br. Se precisar de ajuda, posso orientar por aqui.'}]
  },
  {
    key:'pagamento',
    title:'Formas de pagamento',
    description:'Responde apenas as formas de pagamento aprovadas.',
    priority:75,
    phrases:['forma de pagamento','formas de pagamento','como pagar','aceita pix','aceita cartão','aceita cartao','pagar no cartão','pagar no cartao','tem pix','pode pagar na entrega'],
    actions:[{type:'fixed_reply',response_text:'O pagamento é feito na entrega. Aceitamos PIX, dinheiro, cartão de crédito e cartões de alimentação/refeição.'}]
  },
  {
    key:'area-entrega',
    title:'Área de entrega',
    description:'Informa a área estável de atendimento e encaminha exceções.',
    priority:75,
    phrases:['onde entrega','área de entrega','area de entrega','entrega em cuiabá','entrega em cuiaba','entrega em várzea grande','entrega em varzea grande','vocês entregam','voces entregam','faz entrega','entrega aqui'],
    actions:[{type:'fixed_reply',response_text:'Atendemos Cuiabá e Várzea Grande. Para confirmar uma situação específica de entrega, posso encaminhar para atendimento humano.'}]
  },
  {
    key:'horario',
    title:'Horário',
    description:'Como o horário pode variar, encaminha para confirmação humana.',
    priority:70,
    phrases:['horário de atendimento','horario de atendimento','que horas abre','que horas fecha','está aberto','esta aberto'],
    actions:[{type:'handoff'}]
  },
  {
    key:'cestas',
    title:'Interesse em cestas',
    description:'Marca interesse em cestas e permite a ANA continuar.',
    priority:60,
    phrases:['quero cesta','cesta básica','cesta basica','ver cestas'],
    actions:[{type:'label',label_name:'INT_CESTAS'},{type:'continue_ai'}]
  },
  {
    key:'limpeza',
    title:'Interesse em limpeza',
    description:'Marca interesse em produtos de limpeza.',
    priority:60,
    phrases:['produto de limpeza','produtos de limpeza','limpeza da casa','kit limpeza'],
    actions:[{type:'label',label_name:'INT_LIMPEZA'},{type:'continue_ai'}]
  },
  {
    key:'higiene',
    title:'Interesse em higiene',
    description:'Marca interesse em higiene pessoal.',
    priority:60,
    phrases:['produto de higiene','produtos de higiene','higiene pessoal','kit higiene'],
    actions:[{type:'label',label_name:'INT_HIGIENE'},{type:'continue_ai'}]
  },
  {
    key:'bebe',
    title:'Interesse em bebê',
    description:'Marca interesse em itens para bebê.',
    priority:60,
    phrases:['produto para bebê','produto para bebe','produtos para bebê','produtos para bebe','fralda','itens de bebê','itens de bebe'],
    actions:[{type:'label',label_name:'INT_BEBE'},{type:'continue_ai'}]
  },
  {
    key:'pet',
    title:'Interesse em pet',
    description:'Marca interesse em itens para animais.',
    priority:60,
    phrases:['produto pet','produtos pet','ração','racao','produto para cachorro','produto para gato'],
    actions:[{type:'label',label_name:'INT_PET'},{type:'continue_ai'}]
  },
  {
    key:'opt-out',
    title:'Parar ofertas',
    description:'Encaminha pedidos de descadastro; consentimento continua separado das etiquetas de interesse.',
    priority:100,
    phrases:['não quero receber ofertas','nao quero receber ofertas','parar ofertas','não me mande ofertas','nao me mande ofertas','não quero mensagens','nao quero mensagens'],
    actions:[{type:'handoff'}]
  }
];

const clone=value=>JSON.parse(JSON.stringify(value));

export function listAnaAutomationTemplates(){
  return clone(templates);
}

export function buildAnaAutomationTemplate(templateKey,{labels=[],key=''}={}){
  const template=templates.find(item=>item.key===templateKey);
  if(!template)throw new Error('Modelo de automação não encontrado.');
  const actions=template.actions.map(action=>{
    if(action.type!=='label')return clone(action);
    const label=labels.find(item=>String(item?.name||'').toUpperCase()===String(action.label_name||'').toUpperCase());
    if(!label?.id)throw new Error(`A etiqueta ${action.label_name} não está disponível.`);
    return {type:'label',label_id:label.id};
  });
  return {
    key:key||`gatilho-${Date.now()}`,
    name:template.title,
    enabled:false,
    priority:template.priority,
    channels:['all'],
    match:'phrase',
    phrases:clone(template.phrases),
    exclude_phrases:[],
    conditions:[],
    actions
  };
}
