import type {Product} from '../core/model';
import {CATEGORIES} from '../core/model';
import {DEMO_PRODUCTS} from './demo';

export interface CatalogSource {
  readonly products: readonly Product[];
  readonly isDemo: boolean;
  readonly error?: string;
}
/** Futuro adaptador Supabase implementará esta porta, sem alterar o componente React. */
export interface CatalogReader {
  listPublicProducts(signal?: AbortSignal): Promise<readonly Product[]>;
}
const isProduct=(raw:unknown):raw is Product=>{
  if(!raw || typeof raw!=='object')return false;
  const p=raw as Record<string,unknown>;
  return typeof p.sku==='string' && !!p.sku.trim() &&
    typeof p.name==='string' && !!p.name.trim() &&
    typeof p.brand==='string' &&
    (p.gtin===null||typeof p.gtin==='string') &&
    CATEGORIES.includes(p.category as Product['category']) &&
    Number.isSafeInteger(p.priceCents)&&Number(p.priceCents)>=0 &&
    Number.isSafeInteger(p.stock)&&Number(p.stock)>=0 &&
    typeof p.active==='boolean' &&
    (p.imageUrl===undefined||typeof p.imageUrl==='string');
};
const httpCatalog:CatalogReader={
  async listPublicProducts(signal) {
    const path=import.meta.env.BASE_URL+'catalog.generated.json';
    const response=await fetch(new URL(path,window.location.href),{signal,cache:'default'});
    if(!response.ok)throw new Error('Catálogo não disponível: '+response.status);
    const data:unknown=await response.json();
    if(!Array.isArray(data)||!data.every(isProduct))throw new Error('Formato do catálogo inválido');
    const skus=data.map((p:Product)=>p.sku);
    if(new Set(skus).size!==skus.length)throw new Error('Produtos duplicados no catálogo');
    return data;
  }
};
/**
 * Fallback demonstrativo SOMENTE em Vite DEV.
 * Produção nunca expõe produtos ou preços de amostra se a API falhar.
 */
export async function loadPublicCatalog(signal?: AbortSignal,reader:CatalogReader=httpCatalog):Promise<CatalogSource>{
  try{
    return {products:await reader.listPublicProducts(signal),isDemo:false};
  }catch(error){
    if(signal?.aborted)throw error;
    if(import.meta.env.DEV && import.meta.env.VITE_APP_MODE!=='production'){
      return {products:DEMO_PRODUCTS,isDemo:true};
    }
    return {products:[],isDemo:false,error:'Catálogo temporariamente indisponível. Nenhuma compra pode ser confirmada.'};
  }
}
