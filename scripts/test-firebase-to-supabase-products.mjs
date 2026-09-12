import assert from 'node:assert/strict';
import {firebaseIsActive, normalizeFirebaseProduct, findExistingProduct, buildNewProductRow, buildExistingPatch, rememberInsertedProduct, collectPages} from './firebase-to-supabase-products.mjs';

const active={ativo:true,codigo:'ABC',nome:'Produto Teste',gtin:'7891234567890',preco:12.5,preco_custo:8,estoque:7,ncm:'12345678',marca:'Marca',categoria:'Mercearia',subcategoria:'Arroz',embalagem:'1kg',fornecedor:'Fornecedor',validade:'2027-01-31',gondola:'G1',prateleira:'P2',url_imagem:'https://example.com/p.jpg',descricao:'Descrição completa'};
assert.equal(firebaseIsActive(active),true);
assert.equal(firebaseIsActive({...active,ativo:false}),false);
assert.equal(firebaseIsActive({...active,situacao:'INATIVO'}),false);

const normalized=normalizeFirebaseProduct('fb-key',active);
assert.equal(normalized.firebase_key,'fb-key');
assert.equal(normalized.sku,'ABC');
assert.equal(normalized.gtin,'7891234567890');
assert.equal(normalized.image_url,'https://example.com/p.jpg');
assert.equal(normalized.price,12.5);
assert.equal(normalized.cost,8);
assert.equal(normalized.stock,7);
assert.equal(normalized.firebase_snapshot.nome,'Produto Teste');

const existing=[
  {id:'1',firebase_key:'fb-key',gtin:'111',sku:'ONE'},
  {id:'2',firebase_key:null,gtin:'7891234567890',sku:'TWO'},
  {id:'3',firebase_key:null,gtin:null,sku:'ABC'}
];
assert.equal(findExistingProduct(normalized,existing).row.id,'1','firebase_key tem prioridade');
assert.equal(findExistingProduct({...normalized,firebase_key:'other'},existing).row.id,'2','GTIN é segundo critério');
assert.equal(findExistingProduct({...normalized,firebase_key:'other',gtin:null},existing).row.id,'3','SKU é terceiro critério');

const inserted=buildNewProductRow(normalized);
assert.equal(inserted.is_active,false);
assert.equal(inserted.is_whatsapp_active,false);
assert.equal(inserted.physically_verified,false);
assert.equal(inserted.image_url,'https://example.com/p.jpg');
assert.equal(inserted.image_original_url,'https://example.com/p.jpg');

const patch=buildExistingPatch({id:'1',name:'Nome Atual',price:99,cost:50,stock:22,image_url:'https://current/img.jpg',brand:null,category:null,firebase_key:'fb-key',firebase_snapshot:{},metadata:{}},normalized,'firebase_key');
assert.equal(patch.price,undefined,'não sobrescreve preço atual');
assert.equal(patch.cost,undefined,'não sobrescreve custo atual');
assert.equal(patch.stock,undefined,'não sobrescreve estoque atual');
assert.equal(patch.image_url,undefined,'não sobrescreve imagem atual');
assert.equal(patch.brand,'Marca','completa campo ausente');
assert.equal(patch.firebase_snapshot.nome,'Produto Teste','preserva snapshot completo');

const aliasSource={...normalized,firebase_key:'fb-alias',firebase_snapshot:{nome:'Produto duplicado no Firebase',gtin:'7891234567890'}};
const aliasPatch=buildExistingPatch({id:'2',firebase_key:'fb-primary',gtin:'7891234567890',sku:'TWO',firebase_snapshot:{nome:'Registro principal'},metadata:{origem:'admin'}},aliasSource,'gtin');
assert.equal(aliasPatch.firebase_snapshot,undefined,'não sobrescreve snapshot principal quando outro firebase_key encontra o mesmo EAN');
assert.equal(aliasPatch.metadata.origem,'admin','preserva metadata existente');
assert.equal(aliasPatch.metadata.firebase_aliases.length,1,'guarda snapshot do registro Firebase duplicado');
assert.equal(aliasPatch.metadata.firebase_aliases[0].firebase_key,'fb-alias');

const dynamicRows=[];
rememberInsertedProduct(dynamicRows,{id:'novo',firebase_key:'first',gtin:'7900204005654',sku:'A'});
assert.equal(findExistingProduct({firebase_key:'second',gtin:'7900204005654',sku:'B'},dynamicRows).row.id,'novo','produto recém inserido entra no índice da mesma execução');

const pagedSource=Array.from({length:2305},(_,i)=>({id:String(i+1)}));
const requested=[];
const paged=await collectPages(async(from,to)=>{requested.push([from,to]);return pagedSource.slice(from,to+1)},1000);
assert.equal(paged.length,2305,'paginação precisa ler além do limite de 1000 do PostgREST');
assert.deepEqual(requested,[[0,999],[1000,1999],[2000,2999]],'paginação deve avançar por ranges de 1000 até a última página');

console.log('firebase-to-supabase-products contract ok');
