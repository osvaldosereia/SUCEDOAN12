> **Atualização 2026-09-28 — R1 LIVE:** o corte produtivo foi executado. Este arquivo descreve o runtime atual após a ativação do Hub/estoque Bling para pedidos novos.

# Dona Antônia Operations 2.0 — Current State

Última atualização: 2026-09-28.

## Estado executivo

A R1 de cutover está **LIVE** com política `future_only`.

Marco:
- `ops2_live_cutover_at = 2026-09-28T14:44:46.627499Z`
- pedidos anteriores ao marco permanecem fora do novo fluxo automático.

Checkpoint detalhado:
- `R1-LIVE-CUTOVER-2026-09-28.md`

## Runtime canônico

- GitHub: `osvaldosereia/SUCEDOAN12`.
- Supabase: `ssbesxgaijknwsjbsbcz`.
- Site: `storefront-v2` ativo.
- Admin operacional: `admin-products-live-v1` v53 ACTIVE.
- Backend/integrações: `admin-service-intelligence-v1` v198 ACTIVE.
- Bling Hub: `mode=live`, `hub_enabled=true`.
- Make: fora da arquitetura operacional.

## Domínios do Hub

Ativos:
- products;
- stock;
- customers;
- orders;
- webhooks.

Fiscal do Hub:
- `fiscal_enabled=false`.

A emissão/expedição continua usando seus gates específicos já existentes; a fila fiscal genérica do Hub não foi ligada nesta R1.

## Estoque

Fonte oficial operacional:
- **Bling**.

Runtime:
- `ops2_stock_authority=bling`.
- depósito selecionado: Geral.
- storefront/Admin usam `ops2_sellable_stock_v1.effective_sellable_stock`.

Estado validado no corte:
- 1.610 produtos ativos;
- 1.610/1.610 com leitura Bling pronta;
- 1.610/1.610 com leitura fresca após refresh;
- 0 ativos sem cobertura;
- 0 ativos com espelho >24h.

Reserva local:
- continua como proteção transitória de concorrência;
- não reduz estoque físico local sob autoridade Bling;
- duração: 48h;
- depois que o pedido está sincronizado no Bling, sua reserva não é descontada novamente do saldo virtual.

Webhooks live processados nesta R1:
- order;
- stock;
- virtual_stock.

Produto e NF-e permanecem fora deste consumidor R1.

## Fluxo real de pedido novo

1. checkout cria pedido canônico local em `storefront_received`;
2. ainda não cria pedido no Bling;
3. confirmação humana:
   - valida disponibilidade;
   - cria reserva local de proteção;
   - cria/atualiza imediatamente o pedido no Bling;
   - status Bling inicial: `Aprovado / Separar`;
   - reserva virtual passa a ser responsabilidade do Bling;
4. se a chamada imediata falhar:
   - pedido fica `review_bling`;
   - abre atenção operacional;
   - job `sync_order` entra na fila;
   - worker de 2 minutos tenta recuperar;
5. separação:
   - não dá baixa física local;
6. conferência EAN:
   - fluxo Bling `Verificado` habilitado;
7. saída para entrega:
   - baixa física Bling continua protegida pelo gate já homologado;
8. fiscal/entrega continuam com confirmação de pagamento e controles específicos existentes.

## Histórico pré-corte

Não deve ser reprocessado pela R1.

No cutover:
- 2.723 webhooks antigos ainda pendentes foram marcados `ignored`;
- gate de pedido rejeita qualquer `created_at < ops2_live_cutover_at`;
- teste real de segurança retornou `pre_cutover_order_ignored` e `external_write=false`.

## Primeiro pedido real pós-corte

O primeiro pedido real pós-corte já foi confirmado:
- pedido: `DA-260928-D6432EB3`;
- total: R$ 175,19;
- `sync_status=sent_to_bling`;
- Bling order id `26983249693`;
- situação Bling comprovada: `Aprovado / Separar` (915902);
- preflight de estoque: 30 linhas, 0 faltas;
- postcheck: 30 linhas, 0 saldos negativos;
- picking apresentado;
- conferência EAN ainda não iniciada.

O primeiro ciclo revelou ausência de transição direta `Em aberto -> Aprovado / Separar`. A R2 corrigiu com bridge seguro sem ações `Em aberto -> Aguardando confirmação -> Aprovado / Separar`, retry de estado explícito e gate forte antes da separação.

Checkpoint detalhado:
- `R2-FIRST-LIVE-ORDER-2026-09-28.md`.

Hardening pós-EAN:
- NF-e de pedido pós-corte exige prova do alvo remoto `Verificado` antes de liberar emissão;
- separação exige prova de `Aprovado / Separar` no Bling.

## Worker / cron

`bling-hub-v2-cycle`:
- schedule `*/2 * * * *`;
- ativo;
- execuções observadas como `succeeded`.

Smoke final:
- HTTP 200;
- 0 jobs reclamados;
- 0 retry;
- 0 falhas.

## XML / compras

Mantém as regras:
- rotina diária às 06:00 Cuiabá;
- CNPJ empresarial pode ser elegível a contas a pagar;
- CPF nunca gera financeiro empresarial;
- entrada de estoque exige confirmação humana;
- conversão caixa -> unidade permanece determinística/revisável;
- financeiro de XML e baixa assistida continuam independentes do cutover R1 de pedidos/estoque.

## Segurança e performance

Advisors após R1:
- nenhum bloqueador novo causado pelo cutover;
- permanecem avisos preexistentes de RLS sem policies em tabelas server-only;
- leaked password protection desativada;
- 1 FK sem índice em `ops2_bling_orphan_product_reviews`;
- índices ainda não utilizados.

Tratar em hardening separado.

## Próximo passo técnico

Não reabrir o histórico.

Observar o primeiro pedido **confirmado** criado após o marco percorrer o fluxo real:

`confirmado -> Bling Aprovado/Separar -> separação -> EAN Verificado -> expedição/baixa física`.

Se esse primeiro ciclo real fechar sem divergência, avançar para a próxima rodada de consolidação operacional e alertas.


## Atualização R2 — 2026-09-28

O primeiro pedido real pós-corte já foi confirmado e sincronizado no Bling como **Aprovado / Separar**. Pré-flight EAN está limpo (30 produtos, 33 unidades, zero GTIN ausente/duplicado). Aguardando a separação/conferência humana normal para validar o próximo gate **EAN -> Verificado**.

Checkpoint: `R2-CANARY-PROGRESS-2026-09-28.md`.


## Atualização R2 — fechamento programável 2026-09-28

R2 operacional está pronta até o próximo gate físico:
- confirmação -> Bling Aprovado/Separar;
- EAN -> Verificado com recuperação automática;
- fiscal antes da saída com reconciliação passiva de NF-e já autorizada;
- baixa física Bling idempotente antes de `out_for_delivery`;
- pagamento real/split como fonte do settlement e do controle fiscal;
- `delivered -> Atendido` com recuperação automática, sem repetir baixa física.

Runtime:
- Hub v201 ACTIVE;
- Admin Edge v56 ACTIVE.

Canário `DA-260928-D6432EB3` continua parado corretamente em `confirmed`, aguardando separação/EAN reais.


## Balanço A4 por foto

Implantado em 2026-09-28:
- A4 retrato, 5 × 4 cards (20 produtos por folha);
- lote/página/REF para rastreabilidade;
- foto sempre da folha inteira;
- OpenAI extrai as 20 contagens com saída estruturada;
- página, posição, REF e EAN são cruzados antes da liberação;
- dúvida da IA ou edição humana exige confirmação;
- contagem confirmada usa o ledger de inventário existente;
- com autoridade Bling, saldo físico é enviado pelo Hub `set_stock` e verificado por releitura;
- repetição/retry não duplica contagem;
- backend ativo: `admin-products-live-v1` v64; `admin-service-intelligence-v1` v206 atualiza o espelho Supabase após a verificação do Bling.

Próxima prova: canário físico com uma folha real, sem reprocessar pedidos/histórico.


### Cobertura do catálogo no balanço por foto
Validação de leitura em 2026-09-28:
- 1.610 produtos ativos;
- 81 páginas A4 se o catálogo inteiro for impresso de uma vez (20 por página);
- 1.587 com EAN e 23 sem EAN;
- 0 grupos de EAN duplicados entre ativos;
- 1.610/1.610 produtos ativos possuem vínculo seguro `matched` com produto no Bling.
Os 23 sem EAN permanecem identificáveis com segurança por lote + página + posição + REF do manifesto impresso.


## Ajuste do seletor de impressão — 2026-09-28
- impressão do balanço agora permite selecionar uma ou várias categorias OU uma ou várias gôndolas;
- antes de imprimir, mostra quantidade exata de produtos e páginas A4;
- seletor usa somente produtos ativos realmente imprimíveis;
- regra de categoria foi unificada entre contagem, prévia e geração;
- aliases legados são consolidados (ex.: `Mercearia` + `mercearia`);
- numeração de gôndola é normalizada para impressão (`01` = `1`, `09` = `9`);
- backend ativo: `admin-products-live-v1` v67.


## Correção de contagens acima do limite de 1.000 linhas — 2026-09-28
Causa identificada da divergência entre quantidade mostrada e impressão:
- consultas de categorias/gôndolas usavam `limit(5000)`, mas a API do Supabase limita a resposta a 1.000 linhas;
- a impressão já percorria o catálogo em páginas, por isso encontrava mais produtos que o seletor;
- exemplo confirmado: Limpeza/Lavanderia = 220 ativos = 11 folhas, enquanto a contagem truncada mostrava ~117.

Correção:
- `products` com filtro por categoria agora pagina o catálogo;
- `product_facets` agora pagina o catálogo;
- `inventory_sheet_options` agora pagina o catálogo;
- `gondolas` agora pagina os produtos usados nas contagens;
- limite operacional interno: até 10.000 produtos, em blocos de 1.000.

Contagens ativas validadas após correção:
- limpeza_lavanderia: 220 (11 folhas);
- mercearia: 555 (28 folhas);
- higiene_beleza: 671 (34 folhas);
- casa_pet: 133 (7 folhas);
- CHINELOS: 24 (2 folhas);
- Caneca de Porcelana: 5 (1 folha);
- Canecas de Porcelana: 2 (1 folha).

Backend publicado: `admin-products-live-v1` Supabase v70 ACTIVE.


## Cestas pré-montadas por lote — 2026-09-29

- Nova aba **Cestas** adicionada ao Vitrine/Admin.
- 9 modelos continuam em `basket_templates`.
- Implantado estoque de cestas prontas por lote, com composição física congelada.
- Produtos comprometidos em cestas prontas são retirados do saldo **solto** disponível ao site, sem baixa física antecipada no Bling.
- Pedido de cesta guarda `basket_lot_id` e os componentes reais; cancelamento devolve a cesta ao lote.
- Lotes futuros validam saldo solto cumulativo e oferecem sugestões de substituição com estoque/capacidade.
- Criados 9 lotes iniciais com 10 unidades cada (90 cestas), por informação operacional de estoque físico pré-montado.
- Divergências entre esses lotes iniciais e o saldo digital foram preservadas para reconciliação no próximo balanço; não houve aumento artificial do estoque Bling.
- Teste sintético Economica Bonini passou: 10→9 na alocação, 14 componentes gravados, reserva `preassembled_only`, cancelamento 9→10, pedido de teste removido.
- `storefront-v2` v20 ACTIVE.
- `admin-products-live-v1` v83 ACTIVE.
- Detalhes: `BASKET-PREMOUNTED-LOTS-2026-09-29.md`.


## Cestas divididas em Alimentos + Limpeza/Higiene — 2026-09-29

Nova arquitetura programada:
- cesta comercial continua única para o cliente e mantém preço-base/valor oculto;
- estoque físico passa a usar lote de **Alimentos** por modelo + **Kit Limpeza e Higiene universal**;
- códigos físicos: EB/NB/NK/PB/PK/MB/MK/GB/GK/LH + 1 dígito;
- Admin permite criar pelo modelo ou **duplicar qualquer lote**, alterando livremente produto, quantidade, inclusão e remoção;
- sugestões mostram estoque solto e capacidade de montagem;
- alteração em Alimentos converte somente Alimentos para avulso;
- alteração em Limpeza/Higiene converte somente esse grupo para avulso;
- grupo não alterado continua consumindo kit pronto;
- pedido grava plano de separação e os códigos dos lotes realmente usados;
- impressão de separação destaca **PEGAR PRONTO**;
- mensagem WhatsApp leva referência interna dos kits/lotes realmente usados;
- nova estrutura só entra na vitrine quando todos os modelos ativos tiverem o estoque novo necessário;
- lotes completos antigos continuam ativos durante a transição;
- estoque antigo validado no fechamento: 90 unidades originalmente registradas = 89 disponíveis + 1 Pequena Bonini alocada legitimamente a pedido recebido ainda não confirmado.

Validação:
- criação e duplicação NB1 -> NB2 testadas e removidas;
- teste parcial Mini Bonini confirmou Alimentos avulso + LH1 pronto;
- apenas alimento alterado foi reservado avulso;
- somente LH1 foi alocado;
- `hidden_value_preserved=true`;
- dados temporários removidos;
- nenhum kit novo real ficou criado ao final do teste.

Backends publicados:
- `storefront-v2` v23 ACTIVE;
- `admin-products-live-v1` v90 ACTIVE.

Detalhes: `BASKETS-SPLIT-KITS-2026-09-29.md`.


### Migração parcial dos lotes completos — 2026-09-29
- nova ação **Migrar unidades** libera somente cestas antigas que já foram desmontadas fisicamente;
- quantidade é escolhida pelo operador; o Admin sugere preservar ao menos 1 unidade antiga durante a transição;
- funciona mesmo se outra unidade do mesmo lote estiver alocada a pedido, pois somente o saldo disponível pode ser desmontado;
- nenhum estoque físico é criado ou baixado no Bling nessa operação;
- componentes liberados voltam ao saldo solto e podem ser usados para montar os novos lotes de Alimentos/LH;
- teste da função foi executado em transação com rollback, sem alterar o estoque real.


## Orçamentos integrado ao Vitrine/Admin — 2026-09-29

- ferramenta histórica de orçamentos recuperada do Git após ter sido removida na limpeza de 25/09;
- mantida também em `/orcamento/` para acesso direto;
- nova aba **Orçamentos** incorporada ao `/vitrine/admin/`;
- abertura integrada exige a mesma sessão administrativa/PIN já usada pelo Admin;
- editor usa `admin-products-live-v1` para carregar todos os produtos ativos do Supabase;
- preço administrativo normaliza `sale_price_cents`, oferta vigente e `image_url`;
- cestas não são mais dependentes dos presets Bonini congelados: dentro do Admin, a lista vem de `baskets_admin` e a composição atual vem de `basket_admin`;
- fallback `presets-bonini.json` foi preservado apenas para contingência/acesso fora do Admin;
- busca de cliente permite consultar `vitrine_customers_list` na base oficial e preencher automaticamente o orçamento;
- rascunho local, edição completa dos itens, descontos/acréscimos/frete, modo sem valores e impressão/PDF A4 foram preservados;
- validação estática: JavaScript do Admin e do editor compila sem erro;
- base validada no momento da integração: 9 cestas ativas, 222 itens de composição, 1.610 produtos ativos e 490 clientes.

Arquivos principais:
- `vitrine/admin/index.html`;
- `orcamento/index.html`;
- `orcamento/presets-bonini.json` (somente fallback);
- `scripts/test-orcamento-modos-v2.mjs`;
- `scripts/test-orcamento-admin-integration.mjs`.


## Histórico de Orçamentos + revisão visual — 2026-09-29

- criada a tabela `public.sales_quotes` no Supabase canônico, com RLS habilitado;
- navegador não acessa a tabela diretamente: leitura e escrita passam pelo `admin-products-live-v1` autenticado;
- ações novas: `quotes`, `quote`, `quote_save` e `quote_status_set`;
- snapshot completo preserva campos, itens, preços, descontos, frete, observações e opções do PDF;
- vínculo com cliente oficial é mantido quando o cliente veio da base do Supabase;
- status suportados: rascunho, enviado, aceito, recusado, vencido e cancelado;
- editor permite salvar, atualizar, pesquisar, abrir, duplicar e alterar status;
- o ID/status do orçamento salvo também fica no rascunho local para evitar duplicação após recarregar a página;
- teste transacional de persistência executado com rollback; nenhum registro de teste permaneceu;
- revisão mobile: preview A4 deixa de forçar 210 mm na tela, controles de cliente empilham, barra do histórico reorganiza e cards ficam mais compactos;
- `admin-products-live-v1` v107 foi confirmado ACTIVE com as rotas de orçamento e consulta CNPJ preservadas.


### Consulta CNPJ e padrões comerciais do Orçamento — 2026-09-29
- campo CPF/CNPJ do cliente ganhou botão **Buscar CNPJ**;
- consulta roda no backend autenticado existente `admin-products-live-v1`, ação `cnpj_lookup`, sem nova Edge Function e sem custo adicional de infraestrutura;
- fonte externa: BrasilAPI / Minha Receita; o navegador não consulta o provedor diretamente;
- preenche razão social, CNPJ, endereço, número, complemento, bairro, CEP, cidade, UF, inscrição estadual quando disponível, telefone e e-mail;
- snapshot do orçamento preserva também os dados cadastrais retornados (situação, CNAE, natureza jurídica, porte, atividades e quadro societário normalizado);
- se o CNPJ já existir na base oficial de clientes, o orçamento mantém o vínculo `customer_id`;
- entrada de CNPJ foi adaptada ao padrão alfanumérico vigente em 2026;
- novos orçamentos usam **Boleto bancário — 7 dias** como forma de pagamento padrão, permanecendo editável;
- validade padrão é **7 dias após a emissão**; ao alterar a data de emissão, a validade acompanha +7 dias, mas continua editável;
- impressão altera temporariamente o título da página para `Orçamento - <empresa cliente> - <número>`, fazendo o navegador sugerir esse nome ao salvar em PDF;
- validação estática do JavaScript passou após as alterações.
