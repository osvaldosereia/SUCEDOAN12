/** Fonte única dos módulos do admin. O menu não depende da ordem dos componentes. */
export const ADMIN_SECTIONS = [
  {id:'produtos',label:'Produtos',title:'Cadastro de produtos'},
  {id:'tipos',label:'Tipos de produto',title:'Tipos de produto'},
  {id:'cestas',label:'Composição das cestas',title:'Cestas básicas'},
  {id:'extras',label:'Produtos extras',title:'Produtos extras'}
] as const;
export type AdminSectionId = (typeof ADMIN_SECTIONS)[number]['id'];
