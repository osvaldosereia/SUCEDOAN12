-- CM-1.8 v2: keep legacy commercial segment keys queryable while adding the new dynamic engine keys.

create or replace view public.customer_segment_registry_v1
with (security_invoker=true)
as
select * from (values
  ('comprou_alguma_vez','Comprou alguma vez',false,'Possui ao menos um pedido válido'),
  ('primeira_compra','Primeira compra',false,'Possui exatamente um pedido válido'),
  ('primeiro_comprador','Primeiro comprador',false,'Segmento comercial legado: exatamente um pedido válido'),
  ('recorrente','Recorrente',false,'Possui dois ou mais pedidos válidos'),
  ('mensal','Mensal',false,'Segmento comercial legado: padrão de recompra mensal'),
  ('inativo','Inativo',false,'Segmento comercial legado: ultrapassou o limite calculado de inatividade'),
  ('alto_valor','Alto valor',false,'Segmento comercial legado: valor acumulado no percentil alto da base'),
  ('comprador_cesta','Compra cestas',false,'Segmento comercial legado: possui compra identificável com cesta'),
  ('produtos_avulsos','Produtos avulsos',false,'Segmento comercial legado: compra local avulsa sem cesta identificável'),
  ('cesta_favorita','Cesta favorita',false,'Segmento comercial legado: mesma cesta em múltiplas compras'),
  ('proximo_recompra','Próximo da recompra',false,'Segmento comercial legado: dentro da janela estimada de recompra'),
  ('sem_compra_30d','30 dias sem compra',false,'Última compra ocorreu há 30 dias ou mais'),
  ('sem_compra_60d','60 dias sem compra',false,'Última compra ocorreu há 60 dias ou mais'),
  ('mercearia','Compra mercearia',false,'Histórico contém produto de mercearia'),
  ('lavanderia','Compra limpeza/lavanderia',false,'Histórico contém produto de limpeza ou lavanderia'),
  ('higiene','Compra higiene/beleza',false,'Histórico contém produto de higiene ou beleza'),
  ('cesta_basica','Compra cesta básica',false,'Possui pedido válido identificado com cesta'),
  ('falou_nao_comprou','Falou e não comprou',false,'Possui conversa e nenhum pedido válido'),
  ('carrinho_nao_concluido','Carrinho não concluído',false,'Possui carrinho abandonado ou rascunho antigo'),
  ('marketing_permitido','Marketing permitido',false,'Customer Protection permite marketing no WhatsApp agora'),
  ('marketing_nao_permitido','Marketing não permitido',false,'Customer Protection bloqueia marketing no WhatsApp agora'),
  ('atendimento_problema','Em atendimento/problema',false,'Possui handoff aberto ou conversa marcada para humano'),
  ('baixa_qualidade_dados','Baixa qualidade de dados',false,'Completude cadastral operacional abaixo de 75%'),
  ('marca','Comprou marca específica',true,'Histórico contém compra da marca informada'),
  ('categoria','Comprou categoria específica',true,'Histórico contém compra da categoria informada')
) as x(segment_key,label,requires_value,description);
