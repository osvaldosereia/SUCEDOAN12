/**
 * Dona Antônia Admin — canonical module registry V1.
 * Describes navigation/ownership without changing runtime gates.
 */
export const ADMIN_GROUPS=Object.freeze([
  {id:'operation',label:'Operação',order:10},
  {id:'catalog',label:'Catálogo & Estoque',order:20},
  {id:'customer',label:'Atendimento & Relacionamento',order:30},
  {id:'marketing',label:'Marketing & Criativos',order:40},
  {id:'management',label:'Operação & Gestão',order:50},
  {id:'system',label:'Sistema',order:60}
]);
const module=(value)=>Object.freeze({kind:'page',status:'production',mobilePriority:'standard',externalEffects:false,...value});
export const ADMIN_MODULES=Object.freeze([
  module({id:'dashboard',label:'Início',group:'operation',route:{type:'hash',value:'dashboard'},order:10}),
  module({id:'orders',label:'Pedidos',group:'operation',route:{type:'hash',value:'orders'},order:20}),
  module({id:'customers',label:'Clientes',group:'operation',route:{type:'hash',value:'customers'},order:30}),
  module({id:'baskets',label:'Cestas',group:'operation',route:{type:'hash',value:'baskets'},order:40}),
  module({id:'kits',label:'Kits',group:'operation',route:{type:'page',value:'../kit-mobile/'},order:45,mobilePriority:'high'}),
  module({id:'storefront',label:'Vitrine',group:'operation',route:{type:'hash',value:'storefront'},order:50}),
  module({id:'buy',label:'Comprar',group:'operation',route:{type:'external',value:'../comprar/'},order:60}),
  module({id:'products',label:'Produtos',group:'catalog',route:{type:'hash',value:'products'},order:10}),
  module({id:'productRegistration',label:'Cadastro rápido',group:'catalog',route:{type:'page',value:'../cadastro/'},order:15,mobilePriority:'critical'}),
  module({id:'categories',label:'Categorias',group:'catalog',route:{type:'hash',value:'categories'},order:20}),
  module({id:'shelves',label:'Gôndolas',group:'catalog',route:{type:'page',value:'./gondolas.html'},order:30,mobilePriority:'high'}),
  module({id:'productNames',label:'Nomes dos produtos',group:'catalog',route:{type:'page',value:'./nomes-produtos.html'},order:40}),
  module({id:'productImages',label:'Imagens IA',group:'catalog',route:{type:'page',value:'./imagens-ia.html'},order:50}),
  module({id:'expiries',label:'Validades',group:'catalog',route:{type:'page',value:'../validades/'},order:55,mobilePriority:'critical'}),
  module({id:'stockCount',label:'Balanço rápido',group:'catalog',route:{type:'page',value:'../contagem/'},order:60,mobilePriority:'critical'}),
  module({id:'service',label:'Atendimento',group:'customer',route:{type:'page',value:'./atendimento.html'},order:10}),
  module({id:'serviceIntelligence',label:'Inteligência',group:'customer',route:{type:'page',value:'./inteligencia.html'},order:20}),
  module({id:'learning',label:'Aprendizados',group:'customer',route:{type:'page',value:'./aprendizados.html'},order:30}),
  module({id:'relationship',label:'Central de Relacionamento',group:'customer',route:{type:'page',value:'./relacionamento.html'},order:40,gate:'relationship'}),
  module({id:'marketing',label:'Marketing',group:'marketing',route:{type:'page',value:'./marketing.html'},order:10,externalEffects:true,gate:'marketing'}),
  module({id:'creativeStudio',label:'Estúdio Criativo',group:'marketing',route:{type:'page',value:'./creative-studio.html'},order:20}),
  module({id:'video',label:'Vídeo',group:'marketing',route:{type:'page',value:'../video/'},order:30}),
  module({id:'commercial',label:'Central Comercial',group:'management',route:{type:'mount',value:'commercialTruthMount'},order:10,status:'gated',gate:'commercialTruth'}),
  module({id:'logistics',label:'Logística',group:'management',route:{type:'mount',value:'logisticsMount'},order:20,status:'gated',gate:'logistics',externalEffects:true}),
  module({id:'financial',label:'Financeiro',group:'management',route:{type:'mount',value:'financialAdminMount'},order:30,status:'gated',gate:'financial'}),
  module({id:'automations',label:'Automações',group:'management',route:{type:'mount',value:'automationBuilderMount'},order:40,status:'gated',gate:'automationBuilder',externalEffects:true}),
  module({id:'integrations',label:'Integrações',group:'system',route:{type:'planned',value:'integrations'},order:10,status:'planned'}),
  module({id:'health',label:'Saúde do sistema',group:'system',route:{type:'planned',value:'health'},order:20,status:'planned'}),
  module({id:'settings',label:'Configurações',group:'system',route:{type:'planned',value:'settings'},order:30,status:'planned'}),
  module({id:'labs',label:'Ferramentas técnicas',group:'system',route:{type:'planned',value:'labs'},order:40,status:'planned'})
]);
export function modulesByGroup(){return ADMIN_GROUPS.map(group=>({...group,modules:ADMIN_MODULES.filter(item=>item.group===group.id).sort((a,b)=>a.order-b.order)}));}
export function getAdminModule(id){return ADMIN_MODULES.find(item=>item.id===id)||null;}
export function validateAdminRegistry(){const errors=[];const ids=new Set();const groupIds=new Set(ADMIN_GROUPS.map(x=>x.id));for(const item of ADMIN_MODULES){if(ids.has(item.id))errors.push(`duplicate module id: ${item.id}`);ids.add(item.id);if(!groupIds.has(item.group))errors.push(`unknown group ${item.group}: ${item.id}`);if(!item.route?.type||!item.route?.value)errors.push(`invalid route: ${item.id}`);}return Object.freeze({ok:errors.length===0,errors:Object.freeze(errors)});}
