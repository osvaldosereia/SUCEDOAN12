import type { Product, ProductType } from '../core/model';
import type { ExtraGroup } from '../core/extras';

export const DEMO_EXTRA_PRODUCTS: Product[] = [
  {sku:'DEMO-EX-001',name:'Biscoito Rosquinha de Coco 400 g',brand:'Exemplo',gtin:null,category:'MERCEARIA BÁSICA',priceCents:579,active:true,stock:12},
  {sku:'DEMO-EX-002',name:'Biscoito Rosquinha de Chocolate 400 g',brand:'Exemplo',gtin:null,category:'MERCEARIA BÁSICA',priceCents:625,active:true,stock:10},
  {sku:'DEMO-EX-003',name:'Detergente Líquido Neutro 500 ml',brand:'Exemplo',gtin:null,category:'LIMPEZA',priceCents:298,active:true,stock:24},
  {sku:'DEMO-EX-004',name:'Detergente Líquido de Coco 500 ml',brand:'Exemplo',gtin:null,category:'LIMPEZA',priceCents:345,active:true,stock:20},
  {sku:'DEMO-EX-005',name:'Sabonete Suave de Lavanda 85 g',brand:'Exemplo',gtin:null,category:'HIGIÊNE',priceCents:320,active:true,stock:32},
  {sku:'DEMO-EX-006',name:'Sabonete Suave de Erva-Doce 85 g',brand:'Exemplo',gtin:null,category:'HIGIÊNE',priceCents:320,active:true,stock:25}
];

/** Tipos extras usam o MESMO formato da relação tipo ↔ SKUs da cesta. */
export const DEMO_EXTRA_TYPES: ProductType[] = [
  {id:'extra-biscoito',name:'Biscoitos',order:101,productSkus:['DEMO-EX-001','DEMO-EX-002']},
  {id:'extra-detergente',name:'Detergentes',order:102,productSkus:['DEMO-EX-003','DEMO-EX-004']},
  {id:'extra-sabonete',name:'Sabonetes',order:103,productSkus:['DEMO-EX-005','DEMO-EX-006']}
];

export const DEMO_EXTRA_GROUPS: ExtraGroup[] = [
  {typeId:'extra-biscoito',order:1,active:true},
  {typeId:'extra-detergente',order:2,active:true},
  {typeId:'extra-sabonete',order:3,active:true}
];
