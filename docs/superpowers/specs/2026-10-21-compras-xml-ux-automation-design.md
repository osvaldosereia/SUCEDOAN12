# Compras XML: fluxo simples e automação segura

**Data:** 2026-10-21  
**Repositório:** SUCEDOAN12  
**Estado:** proposta aprovada em conversa; aguardando revisão deste documento antes do plano de implementação.

## Objetivo

Transformar Compras XML em uma fila clara de trabalho: importar notas do Bling a cada 12 horas, identificar com segurança produtos já cadastrados, preparar produtos novos para revisão como inativos e manter dados da nota, conversão e política de estoque sem repetição de tarefas.

O uso diário deve exigir poucas decisões. Produtos novos permanecem inativos na vitrine até revisão e publicação humana. O processamento automático não deve duplicar registros nem alterar estoque fora do fluxo de recebimento já controlado pelo Bling.

## Evidências da revisão atual

- A rotina `purchase-xml-daily-v1` está ativa às 10:00 e 22:00 UTC (06:00 e 18:00 em Cuiabá).
- Em 21/10/2026, às 10:00 UTC, foram listadas 38 notas em uma janela móvel de 31 dias. Todas eram duplicadas; nenhuma falhou. O contador, entretanto, registrou 103 itens como revisão porque a rotina soma os itens mesmo quando a nota é duplicada.
- O banco tinha 412 itens com `processing_status=review_required` (391 sem produto) e 144 itens `matched`.
- O importador agendado grava evidência de catálogo a partir dos XMLs. Ele não cria produtos, não atualiza custo ou fiscal, não grava estoque e não cadastra produtos no Bling.
- A tela principal carrega sem esperar os dados avançados. O bloco avançado agrega catálogo recente, histórico XML, comparação com Bling e ferramentas relacionadas.
- O fator de embalagem já pode ser guardado por produto, fornecedor e unidade de compra. A seleção de estoque é atualmente registrada no item da nota, não como preferência permanente do produto.

## Experiência proposta

### Tela principal

1. A lista principal continua sendo a fila de notas. Abrir uma nota revela seus itens, com produtos sem vínculo e itens que exigem conversão primeiro.
2. A nota e cada item mostram um estado simples: **Novo**, **Conferir**, **Concluído** ou **Aguardando Bling**. Repetições não aparecem como trabalho novo.
3. Cada item apresenta apenas as decisões necessárias: vincular um produto existente ou criar um produto inativo. Correspondência de EAN exato pode vir pré-selecionada, mas nunca é gravada sem confirmação.
4. O divisor só é solicitado quando XML ou unidade indicarem uma embalagem. A conversão confirmada continua sendo salva por produto e fornecedor, pois o mesmo produto pode vir em caixas diferentes.
5. A opção permanente de estoque fica no cadastro do produto. Na nota, a tela informa qual regra será aplicada. A preferência pode ser revisada no cadastro; não se cria um segundo conjunto de botões por nota.
6. Histórico, comparação com Bling, histórico completo de XML e ferramentas fiscais ficam sob uma seção secundária recolhida. A fila de pendências não terá um segundo índice que exija abrir a mesma nota para executar as mesmas ações.

### Importação a cada 12 horas

- Manter a rotina agendada e a janela de segurança de 31 dias para recuperar notas que foram importadas tardiamente no Bling.
- Antes de baixar XML e buscar detalhes adicionais, consultar os IDs do Bling e as chaves de acesso já registrados. Para uma nota já íntegra, contar como duplicada e encerrar o trabalho sem reprocessar seus itens.
- Só repetir leitura de XML quando o documento estiver incompleto, marcado para recuperação ou quando um operador solicitar reprocessamento.
- Gravar métricas independentes: notas novas, duplicadas, recuperadas, falhas e itens realmente pendentes. Uma nota duplicada não incrementa itens revisados nem altera o estado já apresentado.
- Preservar deduplicação por chave de acesso e hash do XML. O processamento de uma mesma nota pode ser repetido com segurança sem criar produtos, vínculos ou movimentos duplicados.

### Identificação e atualização dos produtos

- Vínculo automático somente por identificador confirmado: EAN de unidade, EAN de embalagem ou código do fornecedor já associado ao CNPJ correto.
- Conflito, identificador ausente ou correspondência apenas pelo nome permanece em revisão manual; a IA não escolhe sozinha entre produtos parecidos.
- Ao encontrar vínculo seguro, registrar fornecedor, divisor e todos os campos recebidos da nota. NCM/CEST podem atualizar os campos de catálogo e ficam marcados para revisão fiscal. CFOP/CST permanecem ligados à evidência da nota, com a origem preservada.
- Nome de produto existente não é reescrito pela nota. Produto novo usa a descrição da nota como nome inicial, recebe os dados disponíveis e fica inativo na vitrine.
- A rotina não atualiza estoque local diretamente. Quando a preferência permanente do produto permitir entrada, o item é incluído no plano de recebimento e a confirmação continua dependente do processo no Bling.

### IA e imagens

A primeira entrega deve concluir o fluxo determinístico de nota, vínculo, cadastro inativo e revisão sem depender de IA. Em uma segunda etapa isolada, a IA poderá sugerir um nome melhor e um fator de embalagem, sempre exibindo a evidência e sem mudar NCM/CEST por inferência.

A busca de imagem deve usar uma fonte/API autorizada e guardar URL de origem, data e GTIN associado. Não usar raspagem de páginas de resultados do Google. Se não houver fonte de imagem disponível, o produto permanece sem imagem para revisão; a rotina não deve bloquear o cadastro nem criar uma imagem que represente outro produto. A geração de imagem existente poderá ser chamada em lote somente depois que o fluxo manual atual for validado e houver limite de custo configurado.

## Dados e migração

- Adicionar preferência de estoque persistente no cadastro do produto, respeitando a última opção registrada nas notas quando disponível. Para produtos sem histórico explícito, manter o comportamento atual de item selecionado por padrão.
- Não sobrescrever o histórico de notas. A nova preferência controla entradas futuras e não modifica recebimentos já preparados, verificados ou concluídos.
- Continuar salvando conversão em `product_supplier_packaging`, sem copiar fator de um fornecedor para outro.
- Antes de ativar gravações automáticas, executar uma simulação que informe quantos itens seriam vinculados, criados inativos ou deixados para revisão. Só avançar com regras que não apresentem conflito de identidade.

## Segurança e limites

- Produto novo permanece `is_active=false` e `is_whatsapp_active=false` até publicação humana.
- Nenhum produto é excluído, publicado ou renomeado automaticamente se já existir.
- Nenhuma movimentação de estoque é criada diretamente pelo agente.
- O agente não cria contas financeiras nem envia pagamentos.
- Segredos de Bling, OpenAI e provedores de imagem ficam somente no Supabase Secrets; jamais no JavaScript público, HTML ou registros.
- Chamadas de IA e de imagem têm limite por execução, idempotência por item e registro da fonte. Sem chave válida ou dentro do limite, o restante do fluxo continua sem enriquecimento.

## Etapas da implementação

1. Ajustar a telemetria de duplicatas e evitar reprocessamento repetido de notas já completas.
2. Persistir a preferência de estoque por produto e preservar as conversões por fornecedor.
3. Simplificar a área principal e recolher ferramentas secundárias sem remover operações existentes.
4. Habilitar processamento automático determinístico de vínculos confirmados e criação local inativa; manter conflitos na fila manual.
5. Validar com notas reais representativas, sem movimentação de estoque nem publicação de produto.
6. Projetar e implementar enriquecimento de nome, divisor e imagem como uma etapa separada, depois de verificar as fontes e os limites de custo disponíveis.

Cada etapa deve entrar por branch/PR, executar os testes da sessão XML e verificar a consistência entre fonte da Edge Function, cópia implantada e runtime da tela. A ativação de gravações automáticas deve ser gradual e acompanhada pela fila de revisão.

## Critérios de aceite

- Uma nota duplicada não baixa novamente o XML nem aumenta contadores de revisão.
- Uma nova nota aparece uma única vez e seus itens mantêm GTIN, quantidades, unidade, valores, NCM, CEST, CFOP, CST/CSOSN, fornecedor e dados de lote/validade existentes no XML.
- Identificador confirmado associa o produto correto; conflito não associa automaticamente.
- Produto criado automaticamente fica inativo na vitrine, com GTIN preservado, estoque inicial preservado e sem publicação.
- A preferência persistente de estoque controla a inclusão em recebimentos futuros; o recebimento é verificado no Bling e não soma estoque duas vezes.
- A conversão confirmada é recuperada para o mesmo fornecedor e não é aplicada a outro fornecedor.
- A tela inicial continua rápida; pendências e ações comuns ficam na primeira área, enquanto ferramentas secundárias permanecem acessíveis e recolhidas.
- Erro de Bling, banco, IA ou imagem não descarta XML nem interrompe processamento de outros itens; a fila mostra uma razão compreensível para revisão.

## Fora desta entrega inicial

- Mudanças na sessão Ler EAN, compras manuais e demais áreas do Admin.
- Alteração do fluxo de pedidos, emissão fiscal ou publicação automática.
- Escrita direta de estoque no catálogo local.
- Raspagem de páginas do Google ou cópia de imagens sem fonte identificável.
- Revisão em massa de produtos antigos antes de concluir a fila de notas novas.
