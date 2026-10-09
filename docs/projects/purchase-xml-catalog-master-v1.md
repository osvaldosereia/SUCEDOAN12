# Catálogo permanente de XMLs — Dona Antônia (fase 1)

## Pedido e escopo
Usar exclusivamente NF-e XML de entrada importados pelo Bling ou enviados manualmente. Não cadastrar automaticamente produto, modificar NCM, preço, estoque, cadastro do Bling, nem criar cron novo de pesquisa. Preservar a ferramenta operacional existente de Compras/XML.

## Auditoria e recuperação histórica
- Auditoria inicial: 88 notas, 210 itens declarados, 155 salvos; chegou mais uma nota durante o trabalho.
- Base de teste estabilizada: 89 notas, 211 itens declarados, apenas 155 itens registrados antes da recuperação.
- Causa encontrada: item sem produto correspondente era gravado com spread não filtrado dos campos XML; upsert falhado era ignorado.
- Releitura única dos arquivos originais armazenados no bucket privado via Edge Function de estágio, autenticada pelo hub e JWT do Supabase (sem criar agendamento).
- Resultado validado: 89 de 89 notas verificadas no XML; 211 itens lidos do original e inseridos no catálogo; 56 itens recuperados na tabela operacional (30 notas), com status de revisão, sem vínculo forçado com products.
- Evidências: 145 candidatos de produto, 30 não vinculados, 1 candidato com divergência de NCM; zero itens ausentes e zero documentos sem conferência do XML.

## Código e estrutura
- Patch nas duas cópias de purchase-xml-v1/index.ts: somente colunas válidas na gravação de itens desconhecidos; falhas de gravação verificadas; não substituir NCM do produto ao importar XML (edição explicitamente aprovada continua disponível).
- Migração purchase_xml_catalog_observations_v1: observações por nota/item independentes do produto de venda, armazenamento do conteúdo bruto por item, proveniência e versão do parser. Views purchase_xml_catalog_candidates_v1 e purchase_xml_catalog_reconciliation_v1.
- Parser XML validado (fast-xml-parser 5.11.2 fixo), namespace NF-e, proteção contra DTD, chave igual à nota registrada, SHA-256 igual ao original, sem presumir dimensões/peso a partir de volumes gerais.
- Releitura reexecutável sem duplicar alterações: inserir somente itens em falta com ignoreDuplicates; não alterar estoque, custo, preços, produtos ou financeiro.
- Novos XMLs já produzem observações no mesmo evento de chegada, sem novo cron.
- No Admin: abrir catálogo histórico por botão e somente carregar sob demanda; busca/filtros, métricas e releitura explícita de três notas por clique.

## Segurança e operações
- Dados permanecem no Supabase canônico. RLS e GRANT de observações e views restritos a service_role; anon e authenticated sem acesso direto.
- Entrada de estoque continua sob confirmação de recebimento via Bling; o leitor XML não a executa.
- O cron preexistente de importação XML do Bling permanece, sem novo agendamento de pesquisa.
- Fase 1 implementada em branch e compilada em função de estágio; publicação da função Admin e interface deverá observar release/PR e compatibilidade com mudanças simultâneas.

## Próximas fases
1. Interface de revisão permanente por produto com identificação GTIN comercial versus embalagem, códigos por fornecedor e histórico de evidências.
2. Ações humanas separadas: Vincular produto, Criar produto inativo, Atualizar atributos, Revisar fiscal; nunca alterar estoque só pela leitura.
3. Conclusão da interface para produtos de qualquer época (não somente últimos 31 dias), com aprovação individual de atributos.
4. Testar lotes, XML duplicado, CFOP de devolução/remessa, conversão caixa-unidade, documentos inválidos e alterações de preço Bling.
5. Revisar qualidade fiscal a partir das notas e das tabelas oficiais antes de sincronizar o Bling.

## Adição da etapa 2: upload somente para catalogar
- Nova operação humana xml_catalog_only_import: permite selecionar XMLs, conferir NF-e, armazenar origem, registrar todos os itens como evidência e no staging de revisão sem consultar Bling ou criar cadastro, fornecedor, financeiro ou movimentação de estoque.
- A mesma chave de NF-e é idempotente; divergência de hash é bloqueada. Documentos marcados como catalog_only não serão automaticamente promovidos para fluxo comercial por uma importação posterior do Bling.
- Interface com botão próprio Enviar XMLs ao catálogo; mantém intactos os botões antigos de importação operacional.
- Requer validação de upload por usuário autenticado e revisão fiscal humana antes de qualquer publicação.
