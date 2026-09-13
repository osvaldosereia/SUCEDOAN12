import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFiveCharacteristicName,
  normalizeManualCatalogFields,
  validatePhotoFiles,
  buildRunCardModel,
} from '../ame-mais/app-core.mjs';
import {
  buildFiveCharacteristicName as buildBackendFiveCharacteristicName,
  storagePaths,
} from '../supabase/functions/ame-mais-analyze-v1/core.mjs';

test('nome usa somente as cinco características na ordem definida',()=>{
  const a={tipo_produto:'Terço',devocao_tema:'Nossa Senhora Aparecida',material_modelo:'Cristal',cor_acabamento:'Branco',diferencial_tamanho:'Com crucifixo'};
  const expected='Terço Nossa Senhora Aparecida Cristal Branco Com crucifixo';
  assert.equal(buildFiveCharacteristicName(a),expected);
  assert.equal(buildBackendFiveCharacteristicName(a),expected);
});

test('nome ignora texto comercial e não cria separadores para campos vazios',()=>{
  const a={tipo_produto:'Quadro',devocao_tema:'',material_modelo:'Moldura madeira',cor_acabamento:'Dourado',diferencial_tamanho:'',descricao_vitrine:'Lindo presente exclusivo'};
  assert.equal(buildFiveCharacteristicName(a),'Quadro Moldura madeira Dourado');
});

test('aceita de uma a três fotos e rejeita quatro',()=>{
  const f={type:'image/jpeg',size:100000};
  assert.equal(validatePhotoFiles([f]).ok,true);
  assert.equal(validatePhotoFiles([f,f,f]).ok,true);
  assert.equal(validatePhotoFiles([]).ok,false);
  assert.equal(validatePhotoFiles([f,f,f,f]).ok,false);
});

test('normaliza EAN NCM custo e venda digitados',()=>{
  const v=normalizeManualCatalogFields({ean:' 7891234567890 ',ncm:'7117.90.00',preco_custo:'12,50',preco_venda:'29,90'});
  assert.deepEqual(v,{ean:'7891234567890',ncm:'71179000',preco_custo:12.5,preco_venda:29.9});
});

test('card inclui dados comerciais e mantém três miniaturas com hero primeiro',()=>{
  const run={id:'r1',ean:'7891234567890',ncm:'71179000',preco_custo:12.5,preco_venda:29.9,analysis:{tipo_produto:'Terço',devocao_tema:'',material_modelo:'Cristal',cor_acabamento:'Branco',diferencial_tamanho:'',nome_cadastro:'Terço Cristal Branco'},images:{detail:{kind:'detail',url:'d'},hero:{kind:'hero',url:'h'},lifestyle:{kind:'lifestyle',url:'l'}}};
  const c=buildRunCardModel(run,'logo.jpg');
  assert.equal(c.gallery.length,3);
  assert.deepEqual(c.gallery.map(x=>x.kind),['hero','lifestyle','detail']);
  assert.equal(c.activeKind,'hero');
  assert.equal(c.ean,'7891234567890');
  assert.equal(c.ncm,'71179000');
  assert.equal(c.precoCusto,12.5);
  assert.equal(c.precoVenda,29.9);
});

test('storage reserva até três referências de entrada',()=>{
  const p=storagePaths('abc');
  assert.equal(p.original1,'runs/abc/original-1.jpg');
  assert.equal(p.original2,'runs/abc/original-2.jpg');
  assert.equal(p.original3,'runs/abc/original-3.jpg');
});
