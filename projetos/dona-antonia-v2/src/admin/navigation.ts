/** Estrutura de navegação em uma única fonte; módulos futuros não ficam espalhados em condicionais. */
export const ADMIN_GROUPS = [
  {id:'operation',label:'OPERAÇÃO'},
  {id:'catalog',label:'CATÁLOGO E VITRINE'},
  {id:'management',label:'GESTÃO'},
  {id:'system',label:'SISTEMA'}
] as const;

export const ADMIN_SECTIONS = [
  {id:'inicio',label:'Início',title:'Visão geral',description:'Acesse as ferramentas da loja e continue as configurações.',group:'operation',icon:'home',available:true},
  {id:'pedidos',label:'Pedidos',title:'Pedidos',description:'Acompanhamento, separação e entrega.',group:'operation',icon:'orders',available:false},
  {id:'produtos',label:'Produtos',title:'Produtos',description:'Encontre, revise e organize os produtos da loja.',group:'catalog',icon:'package',available:true},
  {id:'tipos',label:'Tipos de produto',title:'Tipos de produto',description:'Defina os grupos e as marcas que podem compor as cestas.',group:'catalog',icon:'layers',available:true},
  {id:'cestas',label:'Composição das cestas',title:'Cestas básicas',description:'Configure tamanhos, quantidades e o valor interno de cada cesta.',group:'catalog',icon:'basket',available:true},
  {id:'extras',label:'Produtos extras',title:'Produtos extras',description:'Organize os produtos complementares disponíveis no segundo passo da compra.',group:'catalog',icon:'sparkles',available:true},
  {id:'clientes',label:'Clientes',title:'Clientes',description:'Cadastro e histórico de compras.',group:'management',icon:'users',available:false},
  {id:'marketing',label:'Marketing',title:'Marketing',description:'Campanhas e comunicação.',group:'management',icon:'megaphone',available:false},
  {id:'relatorios',label:'Relatórios',title:'Relatórios',description:'Indicadores e análises.',group:'management',icon:'chart',available:false},
  {id:'integracoes',label:'Integrações',title:'Integrações',description:'Bling, Supabase e WhatsApp.',group:'system',icon:'plug',available:false},
  {id:'configuracoes',label:'Configurações',title:'Configurações',description:'Ajustes e permissões.',group:'system',icon:'settings',available:false}
] as const;
export type AdminSection = typeof ADMIN_SECTIONS[number];
export type AdminSectionId = AdminSection['id'];
export type AvailableAdminSection = Extract<AdminSection,{available:true}>['id'];
export function isActiveAdminSection(value:string):value is AvailableAdminSection {
  return ADMIN_SECTIONS.some(section=>section.id===value && section.available);
}
