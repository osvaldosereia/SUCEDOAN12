Warning: truncated output (original token count: 37605)
Total output lines: 2615

# Dona Antônia Operations 2.0 — HANDOFF

> Atualização documental: 2026-10-22. Os checkpoints operacionais abaixo são históricos; confirme runtime e banco antes de qualquer ação operacional.

## Continuidade da reforma do site e Admin (2026-10-22)

O usuário definiu a reforma gradual do sistema e site existentes. Não criar outro site, outro Admin, outro banco ou implementação paralela. Em 2026-10-22, esclareceu que o trabalho fica no Vitrine Admin existente em `/vitrine/admin/`; migração para `/admin/` está fora do escopo agora. A estratégia canônica está em IMPLEMENTATION-ROADMAP.md, seção “REFORMA CONTÍNUA DO SISTEMA E DO SITE PÚBLICO”.

Baseline observado na primeira rodada:
- Repositório canônico osvaldosereia/SUCEDOAN12; main estava em 24719f9c57b2d362b1e7c5b197dc57fc66a6b8f5 e avançou para 9ec95df6b55e24f3964c22d4b2064d3163519de4 após a PR documental #1269.
- Supabase canônico ssbesxgaijknwsjbsbcz.
- Site público ao vivo em /. Admin existente abre em /vitrine/admin/. `/admin/` ainda volta à raiz, mas sua migração foi expressamente adiada e não faz parte do próximo lote.
- Site público testado: troca de opção de cesta recalculou o total de R$ 419,30 para R$ 425,70; nenhum pedido foi enviado.
- Nenhuma mudança de runtime, banco ou deploy foi feita nesta atualização documental.
- Rotina "Reforma Dona Antônia" programada para começar em 22/10/2026 às 12:00 (America/Cuiaba) e repetir de hora em hora. Cada rodada deve maximizar ajustes validados dentro de um domínio coerente, com branch/PR, testes e sem mutações operacionais em produção.

### Rodada executada em 2026-10-22

- O mapeamento inicial do Admin confirmou 19 áreas/entradas em `/vitrine/admin/`: Central, Atendimento, ANA, Pedidos, Expedição, Entregador, Fechamento, Produtos, Cestas, Validades, Orçamentos, Clientes, Marketing, Compras/XML, Leitura EAN, Balanço, Gôndolas, Financeiro e Bling técnico.
- A sessão Produtos foi implementada na PR #1270 (`agent/vitrine-products-hardening`, HEAD `5197aa4a8e9951a9a1a942fb0d93e9ed4425cd96`): categorias novas preservando valores legados, retomada de salvamento parcial pelo mesmo ID, cache curto de facetas invalidado após mudanças e paginação real. A PR está aberta e não foi publicada.
- CI direcionado `products-session`: passou integralmente — `python3 scripts/build-vitrine-admin-runtime.py --check`, sintaxe JS e os testes de lista, edição rápida móvel e editor completo. O CI amplo terminou com 10 de 19 checks em falha (pedidos/fiscal, checkout, marketing, ANA/Admin legado e cesta simples); por isso a PR #1270 não foi integrada nem implantada.
- Smoke do mesmo sistema em uso: `/` recalculou a cesta de R$ 419,30 para R$ 425,70 ao escolher Arroz Tio Bonini; o fluxo foi encerrado sem adicionar a cesta nem criar pedido. `/vitrine/admin/` abriu; a lista Produtos carregou 5 itens e ofereceu mais 5. Nenhuma gravação operacional foi feita.
- Supabase canônico confirmado: `ssbesxgaijknwsjbsbcz`. `admin1-products-read-v1` segue ativa (v3) e teve chamadas reais em 24 h: 56 GET products, 42 categories, 13 product, 2 matches e 1 health; origem não identificada nos logs. Não desativar. Nenhuma migration, Edge Function ou configuração foi aplicada.
- O ledger do banco tem 1.244 versões; `main` contém 180 arquivos SQL de migration (175 com prefixo timestamp, 8 timestamps duplicados), com apenas 31 timestamps compartilhados. Há 1.213 versões do banco sem arquivo correspondente e 136 timestamps únicos apenas no repositório. O banco avança até `20261022114704`; o repositório até `20261022103000`. Não aplicar DDL até reconciliar essa divergência.
- Rollback: sem efeito em produção para reverter. Antes de merge, basta reverter/remover a PR de código; não há alteração de banco ou deploy para desfazer.

Próxima tarefa concreta da primeira rodada: reproduzir os 10 checks vermelhos na base e na PR #1270, separar falhas preexistentes e ajustar os contratos obsoletos do Admin. Executada no checkpoint abaixo; o ledger do Supabase segue bloqueando DDL até a reconciliação.

### Revalidação e rodada de contratos do Admin — 2026-10-22

- `main` revalidada em `9ec95df6b55e24f3964c22d4b2064d3163519de4`; #1269 está merged. A PR de Produtos #1270 (`5197aa4a8e9951a9a1a942fb0d93e9ed4425cd96`) segue aberta. Seu CI amplo tem 19 workflows: 9 success, 10 failure; o gate `products-session` passa. Os 10 scripts vermelhos foram reproduzidos também na base anterior `24719f9`, logo não são regressões do lote Produtos.
- Implementada na PR #1271 (`agent/admin-runtime-contract-tests`, revisão de código `4544862784812ce91b074c829e059b5255ba98ee`) uma correção apenas dos contratos de teste. Além do helper `scripts/helpers/admin-ui-source.mjs`, foram atualizados 15 testes: `scripts/test-order-separation-completion-feedback-v4.mjs`, `scripts/test-admin-orders-clean-flow-v3.mjs`, `scripts/test-order-manual-queue-v1.mjs`, `scripts/test-separator-assignment-repair-v1.mjs`, `scripts/test-montar-picking-v1.mjs`, `scripts/test-order-customer-notifications-v1.mjs`, `scripts/test-admin-attendance-native-v1.mjs`, `scripts/test-admin-attendance-offers-tab-v1.mjs`, `scripts/test-admin-ana-section-v1.mjs`, `scripts/test-fiscal-nfe-autorecovery-v1.mjs`, `scripts/test-basket-simple-tabs-v1.mjs`, `scripts/test-basket-lot-ops-rules.mjs`, `scripts/test-customer-postorder-flow-v1.mjs`, `scripts/test-order-public-summary.mjs` e `scripts/test-admin-order-public-vitrine.mjs`. Os contratos leem a composição modular real do Admin; o harness pós-pedido remove `export` antes de compilar o módulo de UI com `vm.Script`. Nenhum runtime ou comportamento operacional foi alterado. Commits remotos desta atualização: `65938f4`, `15ec7d2`, `4544862`.
- Validação local: 24/24 testes do lote Pedidos/Admin passaram; `python3 scripts/build-vitrine-admin-runtime.py --check`, `node --check vitrine/admin/admin-runtime.js` e `git diff --check` passaram. Na revisão de código `4544862`, cinco dos sete workflows passaram; ANA terminou o job com sucesso, embora o run ainda reporte `in_progress`, e Basket kit editor continua instalando Chromium. Não houve falha nos sete workflows; consultar estado final antes de integrar.
- Smoke somente leitura em 2026-10-22 no site publicado: `/` exibiu cinco cestas e carrinho em 0 itens / R$ 0,00; `/vitrine/admin/` abriu a Central com 19 áreas. Nenhum pedido, mensagem ou gravação operacional foi criado. A rota do Admin continua `/vitrine/admin/`.
- Revalidação do Supabase alvo `ssbesxgaijknwsjbsbcz`: `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.166, 1.244 migrations no ledger (última `20261022114704 basket_mold_zero_quantity_v1`), 142 Edge Functions. `admin-products-live-v1` v183 e `admin1-products-read-v1` v3 estão ativas. Advisors: security — 228 RLS sem policy, 3 search_path mutáveis, 43 SECURITY DEFINER executáveis por authenticated, 1 proteção de senha vazada; performance — 77 FKs sem índice, 97 índices sem uso e 1 aviso de conexões. Nenhuma migration, função, configuração, grant/policy ou dado foi alterado.
- O bloqueio de DDL permanece: 1.244 versões no banco contra 180 migrations no repositório, só 31 timestamps coincidentes. Não aplicar migration até reconciliar histórico. Não foi feito deploy; site publicado não mudou.
- Rollback desta PR: fechar/reverter #1271; os arquivos alterados são testes/helper, sem efeito em runtime. Próxima tarefa exata: corrigir a jornada pública já existente em `/pedido/` para consumir `channel_origin` retornado por `order-public-view-v1` ao montar o contato WhatsApp, com teste de ambos os canais 0975/1018, sem enviar mensagem; revisar na mesma verificação os testes que ainda tratam `/vitrine/` como cópia do `index.html` da raiz. Manter `/` como vitrine e `/vitrine/admin/` como Admin.


> Documento canônico de continuidade. Atualizar ao final de cada rodada relevante.


## Objetivo
Simplificar a operação da Dona Antônia usando:
- donaantonia.com.br como canal de venda;
- Vitrine/Admin como interface operacional simples para funcionários;
- Bling como ERP oficial (produtos, estoque operacional, compras, fornecedores, vendas, fiscal e financeiro);
- ChatGPT como camada de gestão, análise, automações e acompanhamento;
- Supabase apenas para regras e integrações específicas que o Bling não resolve adequadamente.

## Princípios
1. Não substituir nem apagar fluxo de produção antes de homologar o substituto.
2. Não reconstruir no Admin funções que o Bling já execute bem.
3. Funcionários não devem depender do painel completo do Bling para a rotina.
4. Regras críticas e determinísticas não ficam a critério da IA.
5. Preferir eventos/webhooks a polling periódico.
6. Bling será a fonte oficial do ERP; Admin será a interface operacional da Dona Antônia.
7. ChatGPT será a interface gerencial do proprietário sempre que tecnicamente possível.

## Escopo da auditoria
Classificar cada função atual como:
- BLING
- ADMIN DONA ANTÔNIA
- CHATGPT
- INTEGRAÇÃO MÍNIMA
- REMOVER APÓS HOMOLOGAÇÃO

Domínios:
- site e checkout;
- pedidos;
- clientes;
- produtos e cadastro;
- estoque;
- cestas;
- ofertas;
- validade;
- gôndola/prateleira;
- compras e fornecedores;
- XML/NF-e de entrada;
- conversão caixa -> unidade;
- fiscal;
- contas a pagar;
- contas a receber;
- separação/picking;
- conferência;
- impressão automática;
- expedição;
- entrega/rotas;
- relatórios e gestão;
- automações ChatGPT.

## Regras já aprovadas
### XML / compras
- NF/XML do CNPJ: usar o máximo possível do fluxo nativo do Bling.
- XML de compra no CPF: pode cadastrar/atualizar produtos, fornecedor, custo e estoque conforme regras aprovadas, mas NÃO deve criar conta a pagar/vínculo financeiro empresarial.
- Compras em caixa com venda por unidade exigem conversão determinística para unidades, custo unitário e estoque correto.

### Pedidos / operação
Fluxo-alvo:
cliente -> donaantonia.com.br -> validação mínima -> Bling -> separação -> conferência -> fiscal -> expedição -> entrega.

- Ao entrar pedido, objetivo é imprimir automaticamente uma lista de separação organizada por gôndola/prateleira.
- Interface do funcionário deve ser simples: Montar -> Conferir -> Expedir.
- Folha do entregador é diferente da folha de separação: cliente, endereço, telefone, localização/mapa, volumes, pagamento/valor a receber e observações.
- Avaliar aproveitamento de Picking/Packing, Checkout de Pedidos, DANFE simplificado, etiquetas e impressão nativa do Bling.
- Para impressão personalizada imediata, avaliar ponte/agente local de impressão sem recriar ERP.

## Arquitetura-alvo
CLIENTE
  -> donaantonia.com.br
  -> camada mínima Dona Antônia
  -> Bling (ERP)
  -> fiscal/financeiro/estoque/compras

FUNCIONÁRIO
  -> Admin Operacional Dona Antônia
  -> Montagem / Conferência / Expedição / Entrega

PROPRIETÁRIO
  -> ChatGPT
  -> gestão do Bling + exceções + relatórios + automações

BLING
  -> webhooks/eventos
  -> sincronização mínima com Supabase/Admin quando necessário

## Estado técnico conhecido
- Repositório principal: osvaldosereia/SUCEDOAN12.
- Supabase canônico ativo: ssbesxgaijknwsjbsbcz.
- Projeto legado Chat Commerce OS está inativo e retirado do runtime; não deve voltar a ser usado.
- Há diversas Edge Functions históricas/duplicadas relacionadas a Bling e operação; NÃO remover até auditoria e homologação.
- A documentação existente registra runtimes antigos de Bling Hub/fiscal desativados, embora jobs pg_cron tenham existido.
- O Vitrine/Admin atual possui ações intermediárias de Bling/fiscal/financeiro que precisam ser confrontadas com capacidades nativas do Bling/MCP.

## Fases
### Fase 1 — Auditoria e matriz
Inventariar GitHub + Supabase + Admin + integração Bling e produzir matriz de destino.

### Fase 2 — Bling como ERP
Validar conexão, permissões, módulos e configurações; definir fonte oficial por domínio.

### Fase 3 — Pedido até expedição
Simplificar pedido do site -> Bling; impressão automática; separação; conferência; NF-e; expedição.

### Fase 4 — Compras / XML / estoque
NF-e recebida, XML manual CPF/CNPJ, fornecedores, caixa->unidade, custos, estoque e pedidos de compra.

### Fase 5 — Financeiro
Contas a pagar/receber, vencimentos, conciliação operacional e relatórios.

### Fase 6 — ChatGPT gestor
Rotinas agendadas, alertas por exceção, panorama diário, estoque crítico, compras, fiscal, financeiro e pedidos parados.

### Fase 7 — Limpeza
Remover somente componentes comprovadamente substituídos e sem dependências de produção.

## Próximo passo
Fechar a Fase 1 com a matriz de fonte de verdade por entidade e o desenho TO-BE do fluxo pedido -> Bling -> impressão -> separação -> conferência -> fiscal -> expedição -> entrega. Depois definir o gateway mínimo e auditável para gestão via ChatGPT.

## Progresso da auditoria em 2026-09-25
- Confirmado que o pedido hoje só é enfileirado ao Bling no início da separação, após consumo do estoque local.
- Confirmado que o Hub automático está desabilitado globalmente, embora o cron físico exista.
- Confirmado que XML diário está ativo às 06:00 Cuiabá e passa pelo monólito admin-service-intelligence-v1.
- Confirmado gate CPF: XML pessoal nunca cria financeiro empresarial.
- Confirmada confirmação humana obrigatória para entrada física de estoque de XML.
- Confirmada lógica determinística de personalização de cesta e diferença comercial/fiscal.
- Confirmada ausência, nesta sessão, de plugin Bling direto no diretório de plugins do ChatGPT.
- Detalhes em CURRENT-STATE.md e AUDIT-MATRIX.md.


## Regra adicional de continuidade
Regra histórica de 2026-09-25: aguardava conclusão e revisão do Projeto Final antes de programação/produção. Em 2026-10-22, o usuário autorizou explicitamente a implementação progressiva de correções seguras, inclusive no sistema em uso e no Supabase canônico, seguindo as validações, limites operacionais e gates descritos na seção “REFORMA CONTÍNUA DO SISTEMA E DO SITE PÚBLICO”. Esta autorização atual prevalece; mudanças de alto impacto continuam sujeitas à homologação e rollback específicos.

## Novo requisito multicanal
Clientes podem comprar diretamente pelo WhatsApp/PapoAI sem usar o site. O projeto final deve incluir venda manual e rascunho assistido pelo PapoAI, ambos convergindo para o mesmo motor canônico de pedido do site. Ver `ANALYSIS-NOTES.md` e `SOURCE-OF-TRUTH-DRAFT.md`.


## Nova frente de análise — Control Tower
Foi aprovada para análise uma Central de Controle no Vitrine/Admin com dashboard, fila "Precisa de você", supervisão de automações, timeline operacional e copiloto OpenAI. Não é implementação ainda.

Direção registrada em:
- `CONTROL-TOWER-DRAFT.md`
- `AI-OBSERVABILITY-CONTINUITY-DRAFT.md`

Princípio: dashboard responde proativamente o que precisa de atenção; chat é camada de investigação/comando. Estado real vem de Bling/Supabase/PapoAI e ledger, nunca da memória de uma conversa.


## Achado crítico — pagamento/fiscal
A análise detectou um ciclo impossível no fluxo atual: o readiness fiscal exige pedido entregue + pagamento confirmado, enquanto o gate de expedição exige autorização fiscal antes da saída. Isso deve ser redesenhado antes de qualquer implementação. Também foi confirmado que o Bling suporta dinheiro, crédito, vale alimentação, vale refeição, PIX e múltiplas formas, mas o Admin atual só confirma um meio único pelo total. Ver `FINANCE-PAYMENT-DELIVERY-DRAFT.md`.


## Achado — compras/XML/estoque
O Bling deve ser o único consumidor da distribuição SEFAZ/NSU do CNPJ. A rotina custom atual lê NF-e já registradas no Bling; não consulta a SEFAZ diretamente. O projeto final deve preferir busca automática SEFAZ nativa + Check-in + DUN + lotes no Bling e reduzir o custom a XML CPF, conversão caixa->unidade, fila de revisão e auditoria. Ver `PURCHASES-XML-INVENTORY-DRAFT.md`.


## Achado — separação/expedição
Bling Checkout cobre grande parte de Picking/Packing, leitura EAN, checkout parcial, usuário em separação, geração fiscal/documentos e impressão QZ. O Admin deve manter principalmente fila simplificada, rota/entregador, venda manual/WhatsApp e fechamento de pagamento. Ver `OPERATIONS-EXPEDITION-DRAFT.md`.


## Fluxo máximo de automação
O usuário reforçou que o projeto deve reduzir ao mínimo a interação humana. A direção agora é: pedido nasce em `Aguardando confirmação`; cliente confirma preferencialmente pelo PapoAI/WhatsApp; aprovação muda automaticamente para `Aprovado / Separar`, ativa reserva no Bling e dispara impressão térmica custom 85 mm com foto/EAN/quantidade/localização; separador só marca `SEPARADO`; conferência usa preferencialmente Bling Checkout; após Verificado, estoque/documentos seguem automações homologadas; entregador só registra entrega e pagamento efetivo. Ver `WORKFLOW-MAX-AUTOMATION-DRAFT.md`.

Achado de dados: 1.634 produtos ativos, ~99,8% com imagem, ~98,6% com GTIN, mas apenas ~38,2% com gôndola+prateleira; localização física é o principal gate para picking automático ordenado.

## Revisão de acesso operacional — 2026-09-25
Foi concluída uma revisão do modelo de acesso para proprietário, supervisão, operação, entrega e automação. O desenho está documentado em `SECURITY-PERMISSIONS-AUTOMATION-DRAFT.md`. O modelo final não deve usar um único perfil compartilhado nos tablets.

## Fluxo de exceções — 2026-09-25
Foi concluído um primeiro desenho de exceções e recuperação. A regra é que falhas previsíveis virem filas claras na Control Tower, com retries idempotentes e escalonamento por papel. Foram documentados cancelamento, falta de estoque, impressão, conferência, webhook, Bling, NF-e, PapoAI, entrega, pagamento, XML e IA. Ver `EXCEPTION-RECOVERY-DRAFT.md` e `ORDER-STATE-MACHINE-DRAFT.md`.

## Confiabilidade e webhooks — 2026-09-25
O Bling está acessível em leitura nos principais domínios, mas o runtime global do Hub e webhooks estão desligados. A leitura de `situacoes/modulos` retorna 403 e `status_updates_enabled=false`, portanto automação por situações ainda não está homologada. Webhooks Bling precisam ser tratados com idempotência, entrega fora de ordem, resposta rápida e reconciliação. Ver `RELIABILITY-WEBHOOKS-DRAFT.md`.

## Balanço de estoque — 2026-09-25
A ferramenta de Balanço é requisito crítico. O frontend atual tem boa UX para leitor EAN + teclado numérico, mas o backend atual grava `products.stock` diretamente e não é compatível com Bling como fonte oficial. O Bling possui módulo nativo `Estoque > Conferência de estoque` com leitura de código, imagem, localização, saldo atual, diferença, log, sessão em nuvem e geração de Balanço. Direção: POC nativa primeiro; se os leitores/tablets não entregarem a UX necessária, manter a tela Dona Antônia como frontend fino escrevendo operação B no Bling. Ver `INVENTORY-COUNT-BALANCE-DRAFT.md`.

## Rota e eficiência — 2026-09-25
Roteirização própria e tela do entregador permanecem como função Dona Antônia; o Bling cobre logística documental/transportadoras, mas não foi encontrado recurso nativo oficial equivalente à rota local com pins WhatsApp + pagamento na porta. Também foi formalizada a regra arquitetural "se nada aconteceu, nada deve rodar": webhooks/eventos, read models pequenos, IA sob demanda e crons apenas como rede de segurança. Ver `DELIVERY-ROUTES-DRAFT.md` e `ARCHITECTURE-EFFICIENCY-DRAFT.md`.

## Cliente e cobertura da análise — 2026-09-25
Foi consolidada a estratégia de identidade: telefone identifica canal; CPF/CNPJ é identidade forte fiscal/ERP; Bling é o cadastro ERP consolidado; pedido mantém snapshot do endereço usado. Estado observado: 490 clientes, 227 sem documento e 57 sem telefone principal. Também foi criado `ANALYSIS-COVERAGE-DRAFT.md` para impedir que o Projeto Final seja escrito antes de fechar os bloqueadores restantes.

## Cestas e representação fiscal — 2026-09-25
Para cestas personalizadas, a direção preferida é enviar ao Bling os componentes reais do pedido, não depender de uma composição fixa. O uso atual de `other_expenses` para a diferença comercial deve ser reavaliado fiscalmente: foi aberto um candidato de rateio determinístico do preço comercial entre os componentes para que a soma dos itens coincida com a cesta, mantendo NCM/tributação individual. Não implementar sem homologação fiscal. Ver `BASKETS-COMMERCIAL-FISCAL-DRAFT.md`.

## Validade e ofertas por lote — 2026-09-25
Foi identificado que desconto por validade não pode continuar baseado em uma única data do produto quando existirem vários lotes. Bling deve ser fonte de lote/saldo/validade; Dona Antônia mantém a regra comercial por faixa e um pool promocional limitado à quantidade dos lotes elegíveis. Vencimento de um lote não implica desativar o produto inteiro se houver outro lote vendável. Ver `VALIDITY-OFFERS-DRAFT.md`.

## Rodada ampla pré-final — 2026-09-25
A análise arquitetural foi cruzada ponta a ponta. Principal descoberta fiscal: a Consulta 008/2026 da SEFAZ/MT conclui que venda não presencial com entrega e pagamento no domicílio pode ficar dispensada da vinculação tecnológica do comprovante ao documento fiscal quando cumpridas as condições da Portaria 262/2023. Isso permite desenhar NF-e antes da saída e fechamento do pagamento após a entrega, sujeito à homologação do contador sobre CNAE, XML e campos de pagamento.

Também foram fechados em draft:
- ponte PapoAI mínima e event-driven;
- modelo mínimo de ledger/attention/approvals;
- política anti-sobrecarga/custos;
- sequência de POCs/cutover;
- revisão cruzada de 14 contradições atuais.

Novos documentos:
- `FISCAL-HOME-DELIVERY-RESOLUTION-DRAFT.md`
- `PAPOAI-BRIDGE-FINAL-DRAFT.md`
- `CONTROL-TOWER-DATA-MODEL-DRAFT.md`
- `COST-CAPACITY-DRAFT.md`
- `POC-CUTOVER-PLAN-DRAFT.md`
- `FINAL-CROSS-REVIEW-DRAFT.md`

Nenhuma programação/produção deve ser alterada até o Projeto Final aprovado.

## Variantes reais, perdas e devoluções — 2026-09-25
Foi feita uma última análise ampla das exceções físicas/fiscais.

Achados críticos:
- NF-e autorizada + mercadoria já saiu + cliente recusa/não paga => não tratar como cancelamento simples; no retorno ao estabelecimento há NF-e de entrada/retorno referenciando a original.
- avarias, vencimentos, extravios e diferenças negativas reais de estoque exigem tratamento fiscal de baixa; consultas SEFAZ/MT 148/2026 e 151/2026 apontam CFOP 5.927, sem destaque, com estorno de crédito quando apropriado.
- sobra de balanço sem origem NÃO deve virar entrada automática; deve ser investigada.
- isso corrige o desenho do Balanço: a contagem continua rápida, mas divergências passam por reconciliação antes de regularizar estoque.
- usar somente dois depósitos lógicos: Geral + Quarentena (desconsiderada do saldo vendável).
- compra em CPF NÃO pode ser presumida como "fora da SEFAZ". XML CPF continua sem gerar conta a pagar empresarial, mas entrada/estoque fiscal precisam de política do contador antes da automação.

Documentos:
- `SALES-CANCELLATIONS-RETURNS-DRAFT.md`
- `STOCK-LOSS-DISCARD-FISCAL-ORIGIN-DRAFT.md`
- `OPERATIONAL-VARIANT-MATRIX-DRAFT.md`

Nenhuma implementação foi feita.

## Rodada máxima final de análise — 2026-09-25
A análise foi ampliada para pós-venda, CDC/e-commerce, recall de alimentos, recebimento profissional, devolução ao fornecedor, saldo virtual/reserva e reconciliação de estoque.

Principais decisões:
- usar Check-in de Recebimentos Bling antes de lançar estoque;
- danificado/faltante/incorreto no recebimento vira pendência/crédito/devolução no próprio Bling;
- site deve espelhar saldo virtual do …25605 tokens truncated…o: ignorados pelo novo fluxo automático.

### Runtime
- Hub: `mode=live`, `hub_enabled=true`;
- products/stock/customers/orders/webhooks: ativos;
- `fiscal_enabled=false`;
- `ops2_stock_authority=bling`;
- `ops2_direct_order_state_enabled=true`;
- `ops2_ean_verified_sync_enabled=true`;
- cron `bling-hub-v2-cycle`: ativo a cada 2 minutos;
- Edge `admin-products-live-v1`: v50 ACTIVE;
- Edge `admin-service-intelligence-v1`: v196 ACTIVE.

### Fluxo novo
- checkout continua local até confirmação;
- confirmar pedido novo pós-corte:
  - reserva local transitória;
  - criação/atualização imediata no Bling;
  - situação `Aprovado / Separar`;
  - Bling passa a carregar a reserva virtual;
- falha transitória:
  - `review_bling`;
  - atenção operacional;
  - fallback `sync_order` na fila;
  - worker atualiza `bling_order_id/bling_synced_at` ao recuperar;
- separação não baixa estoque local sob autoridade Bling;
- conferência EAN mantém caminho `Verificado`;
- baixa física permanece no gate de expedição já homologado.

### Estoque
Refresh integral executado no corte:
- 1.668 vínculos de produto percorridos;
- 1.610 produtos ativos;
- 1.610/1.610 ativos prontos;
- 1.610/1.610 ativos com leitura fresca;
- 0 ativos sem cobertura;
- 0 ativos com espelho >24h.

O storefront foi testado contra o espelho recém-atualizado e retornou o mesmo saldo virtual do Bling.

### Histórico
- 2.723 webhooks antigos pendentes foram marcados `ignored`;
- consumidor R1 live aceita apenas `order`, `stock`, `virtual_stock`;
- teste com pedido antigo:
  - HTTP 409;
  - `pre_cutover_order_ignored`;
  - `external_write=false`.

### Pedido real pós-corte
Foi observado 1 pedido novo real ainda aguardando confirmação.

Preview somente leitura:
- `ready=true`;
- `write_eligible=true`;
- 30 itens resolvidos;
- 0 unresolved;
- cliente vinculado;
- R$ 171,28 em produtos;
- R$ 3,91 em outras despesas;
- R$ 175,19 total;
- `balances=true`.

Nenhuma escrita foi antecipada.

### Logs
Desde o corte:
- único HTTP >=400 nos serviços R1 foi o 409 deliberado do teste de pedido pré-corte;
- nenhum outro 4xx/5xx observado.

### Referências
- checkpoint: `R1-LIVE-CUTOVER-2026-09-28.md`;
- current state atualizado: `CURRENT-STATE.md`;
- commits principais: `0acd5d81`, `afb8921a`, `3c6811e8`, `eb236d91`, `a48dd4dc`, `90c8077a`, `d074a69a`, `77362ef2`, `42264ecf`, `7f25a3e7`.

### Próximo passo
Não reabrir histórico. Observar o primeiro pedido pós-corte quando houver confirmação humana e validar ponta a ponta:
`Confirmado -> Aprovado/Separar -> Verificado -> Expedição/baixa física`.


## R2 live — fechamento programável 2026-09-28

A cadeia pós-cutover está programada de ponta a ponta e fail-closed:
`confirmed/Aprovado-Separar -> processing -> EAN/Verificado -> NF-e autorizada -> baixa física -> out_for_delivery -> settlement real -> delivered -> Atendido`.

Novos reforços:
- NF-e autorizada manualmente no Bling é reconciliada passivamente pelo ciclo;
- captura de pagamento gera plano Bling shadow automaticamente;
- settlement real alimenta `order_fiscal_controls`;
- entrega concluída fecha `Verificado -> Atendido` somente após pagamento + fiscal + baixa física comprovados;
- falhas finais entram em `review_bling` e recuperação automática, sem desfazer entrega nem repetir estoque.

Deploy:
- Hub v201;
- Admin Edge v56.

Único gate restante desta R2 é humano/físico: separar e bipar o pedido canário real `DA-260928-D6432EB3`, depois emitir a NF-e com confirmação humana e seguir a entrega real.


## R2 live — revalidação pós-fechamento programável — 2026-09-28

Revalidação executada após commits paralelos do Admin (gôndolas), sem alteração do fluxo R2.

Estado real confirmado no Supabase:
- pedido-canário `DA-260928-D6432EB3`: `status=confirmed`, `sync_status=sent_to_bling`;
- Bling order id: `26983249693`;
- total: R$ 175,19;
- job corretivo `sync_order_status -> approved_separation`: `synced`, 1 tentativa, HTTP 200, sem erro;
- controle fiscal permanece corretamente bloqueado antes da entrega: `delivery_status=pending`, `payment_status=pending`, `dispatch_fiscal_status=pending`;
- nenhum `dispatch_fiscal_job` foi criado antecipadamente para o canário;
- Edge `admin-service-intelligence-v1`: v201 ACTIVE;
- Edge `admin-products-live-v1`: v56 ACTIVE.

Conclusão desta revalidação:
- nenhuma regressão observada nos gates R2;
- nenhum efeito externo adicional foi disparado;
- o canário continua parado no ponto correto, antes da separação física;
- não simular EAN, NF-e, pagamento ou entrega.

Próximo gate exato:
`confirmed/Aprovado-Separar -> iniciar separação real -> bipagem EAN real -> ready/Verificado`.
Depois desse gate, validar fiscal/baixa física/entrega no mesmo pedido real.


## R3 — fechamento programável sem etapa física — 2026-09-28

O usuário optou por adiar separação/EAN e demais provas físicas da R2. A R3 avançou somente em lógica segura, sem simular operação real.

### Estado
Fluxo protegido:
`out_for_delivery -> falha -> returning -> retorno físico -> redelivery OU returned_review`.

Reentrega:
- volta a `ready`;
- estoque permanece alocado;
- não há estorno físico;
- nova saída reutiliza o controle Bling já `launched`, evitando dupla baixa.

Cancelamento íntegro após retorno:
- exige ausência de pagamento capturado;
- sob autoridade Bling, exige estorno físico oficial comprovado antes do cancelamento;
- DB rejeita `cancel_intact` se `bling_order_stock_controls_v2.state <> 'reversed'`;
- Admin v57 chama o worker de estorno antes da RPC de resolução;
- o worker usa claim/finish idempotentes e endpoint Bling `estornar-estoque`;
- resultado incerto/falha -> `review_required`/atenção crítica; não repetir automaticamente;
- após reversão comprovada, o pedido pode ser cancelado comercialmente e abre atenção fiscal para tratar eventual NF-e de retorno/devolução sem apagar a venda original.

Avaria/falta:
- não usa cancelamento íntegro;
- permanece em revisão;
- tratar via Estoque Mobile/incidente, sem restaurar pedido inteiro.

### Teste
Teste sintético em transação confirmou que cancelamento sem reversão Bling é bloqueado. Rollback: 0 resíduos.

### Runtime
- `admin-products-live-v1`: v57 ACTIVE;
- worker interno temporário `shopping-room-reset-v1`: v3 ACTIVE;
- stock authority: Bling.

### Commits
- `483e4834` — guard DB da reversão;
- `38b486c1` — Admin exige reversão antes do cancelamento;
- `7d5396b5` — worker interno de estorno versionado.

### Limitação conhecida
O projeto atingiu o limite de Edge Functions. Em vez de aumentar custo, foi reaproveitado um Edge legado sem referências para o worker R3. Consolidar/renomear durante o cleanup técnico.

### Próximo passo
R3 programável pode ser considerada fechada sem executar etapa física agora. Próxima rodada do plano: **R4 — fiscal operacional NF-e/DANFE**, reforçando gate de expedição, autorização SEFAZ, DANFE, erros/retry, vínculo pedido/NF, pagamento efetivo e representação de cesta/diferença, mantendo emissão automática OFF até homologação.


## R4 — fechamento programável sem emissão real — 2026-09-28

R4 fiscal operacional concluída no limite seguro.

Fluxo protegido:
`ready + Bling Verificado + total fiscal consistente -> confirmação humana EMITIR_NFE -> gerar no máximo uma vez -> autorizar no máximo uma vez -> reconciliar -> authorized -> DANFE -> baixa física -> expedição`.

Regras consolidadas:
- fiscal automático OFF;
- emissão humana continua protegida por confirmação explícita;
- preflight DB impede armar o runtime se pedido/valores/vínculo/Verificado não estiverem corretos;
- diferença da cesta vai para `other_expenses`;
- job autorizado exige chave NF-e válida de 44 dígitos;
- retry de operações fiscais irreversíveis é somente reconciliação;
- ação antiga de “confirmar pagamento fiscal” foi desativada; settlement real da entrega permanece a fonte de pagamento.

Canário `DA-260928-D6432EB3` continua sem qualquer mutação fiscal e bloqueado corretamente até a etapa física EAN/Verificado.

Runtime:
- Admin v59 ACTIVE;
- fiscal generation OFF;
- fiscal authorization OFF;
- fiscal canary OFF;
- dispatch gate enforce.

Próxima rodada do plano: **R5 — estoque Bling/cutover readiness e escritores**, agora revisando o estado pós-cutover já ativo, writers, triggers, read models, baixa/reversão idempotente, blockers antigos e SQL canônico/reprodutível, sem reabrir histórico.


## R5 — fechamento pós-cutover — 2026-09-28

R5 adaptada ao estado real: o estoque já está oficialmente no Bling desde a R1.

Resultado:
- `stock_authority=bling`;
- 1.610/1.610 ativos prontos;
- mirror fresco;
- physical/mirror/writer gates verified;
- nenhuma revisão física crítica aberta;
- preflight corrigido para `post_cutover_live ready=true`.

Os 14 blockers de recontagem antigos e as reservas locais de proteção continuam registrados para auditoria, mas não são mais tratados como blockers de um cutover que já ocorreu.

Teste em rollback confirmou que reserve/consume/release não alteram `products.stock` sob autoridade Bling.

Commit:
- `13ec5c66`.

Próxima rodada: **R6 — lotes/validade/FEFO/ofertas**, revisando a regra atual 10%/20%/40%, produto vencido, saldo por lote e evitando desativar produto inteiro quando existir outro lote vendável.


## R6 — fechamento programável — 2026-09-28

R6 concluída com adoção gradual e sem conversão automática dos produtos atuais.

Estado:
- novo modelo de lotes pronto;
- FEFO pronto;
- ofertas 40/20/10 validadas nas bordas;
- produto não desativa se houver outro lote vendável;
- tracking completo exige soma dos lotes = estoque físico Bling;
- Admin v60 ACTIVE;
- nenhum lote real criado nesta rodada.

Fluxo futuro por produto:
`cadastrar/receber lotes -> conferir quantidades -> soma = físico Bling -> marcar lot_tracking_complete -> validade/oferta passa para FEFO`.

Até essa confirmação, cada produto continua usando sua validade atual de forma compatível.

Commits:
- `00f5414d`;
- `6e34c20e`;
- `8bfe6ced`.

Próxima rodada: **R7 — compras/XML/fornecedores/caixa→unidade**, conectando entrada XML ao cadastro, conversão de embalagem, custo unitário, fornecedor, lotes/validade quando houver evidência, estoque e regras CPF/CNPJ sem duplicidade.


## Balanço A4 por foto — 2026-09-28

Nova operação implantada no Vitrine/Admin:
- Produtos → **Imprimir balanço A4** cria um lote rastreável;
- impressão em **A4 vertical**, 5 colunas × 4 linhas, até 20 produtos por página;
- cada página traz lote `BAL-...`, página X/Y e cada card traz `REF`, foto, nome, EAN, validade, caixas 0–10 e campo largo para quantidade acima de 10;
- a foto enviada deve mostrar **a folha A4 inteira**;
- Balanço → **Fotografar folha A4 inteira** envia a página à OpenAI Vision;
- a leitura cruza lote + página + posição + REF + EAN;
- leituras confiáveis ficam prontas; qualquer ambiguidade exige confirmação humana;
- alteração manual de uma quantidade lida pela IA também exige confirmação explícita;
- aplicação ocorre em blocos de no máximo 5 itens, registra `ops_record_inventory_count_v1` e, como Bling é a autoridade de estoque, enfileira `set_stock` no Hub;
- o worker lê o saldo do depósito, grava o saldo contado no Bling, relê e só considera concluído quando o valor remoto confere;
- retry é idempotente: a mesma contagem e o mesmo job são reaproveitados após falha/conexão interrompida.

Persistência:
- `inventory_sheet_batches`;
- `inventory_sheet_items`;
- `inventory_sheet_page_scans`;
- `inventory_sheet_item_results`.

Backend:
- `admin-products-live-v1` v64 ACTIVE;
- ações `inventory_sheet_create`, `inventory_sheet_analyze`, `inventory_sheet_apply`;
- `admin-service-intelligence-v1` v206 ACTIVE atualiza o espelho Supabase logo após verificar a escrita de estoque no Bling;\n- não foi criada nova Edge Function porque o projeto atingiu o limite de funções; o módulo foi incorporado ao gateway canônico existente, sem upgrade de plano.

Validação pendente exclusivamente física:
1. imprimir uma página real;
2. marcar contagens;
3. fotografar a folha inteira;
4. conferir a leitura no Admin;
5. aplicar uma página real e confirmar os saldos resultantes no Bling.


## R7 — fechamento programável — 2026-09-28

R7 concluída no limite seguro.

### Fluxo canônico de compra/entrada
`Bling/Upload XML -> parse -> vínculo produto -> conversão caixa→UN -> revisão humana quando necessário -> custo/fornecedor -> preflight -> baseline estoque Bling -> recebimento/check-in no Bling -> mirror novo + delta comprovado -> received`.

Sob `stock_authority=bling`:
- XML não soma `products.stock`;
- confirmar entrada no Admin não movimenta estoque;
- o Admin apenas prepara e depois verifica a entrada;
- confirmação final exige prova física no mirror Bling posterior ao plano.

### Lote
NF-e `rastro` agora é capturado como evidência.
Os 33 XMLs antigos foram relidos com segurança e nenhum contém `rastro`, portanto não houve criação automática de lote.

### Conversão
Erro real encontrado e isolado:
`ARROZ DUBOM FT 6X5` tinha fator 30 derivado de peso tributável. Agora está em revisão, sem quantidade/custo derivados. Fator 6 é somente sugestão até confirmação humana.

Os 11 demais fatores inferidos atuais têm evidência explícita de embalagem compatível.

### Estado de saúde
- 33 documentos;
- 65 itens;
- 23 processados / 10 documentos em revisão;
- 31 itens em revisão;
- 0 violações CPF-financeiro;
- 0 recebimentos locais aplicados;
- stock authority Bling;
- rotina diária 06:00 Cuiabá.

### Runtime
- Hub v207 ACTIVE no checkpoint;
- Admin Edge observado v64 por trabalho paralelo;
- frontend de Compras corrigido no commit `39247fa6`.

### Próxima rodada
**R8 — PapoAI/WhatsApp operacional**:
identidade, link personalizado, Flow, cliente, associação com pedido, histórico, eventos estruturados, idempotência e painel simples de ponte — sem reintroduzir inteligência de atendimento no Admin.


## R8 — PapoAI/WhatsApp operacional — fechamento programável — 2026-09-28

A programação da ponte operacional está fechada no limite seguro.

Implementado:
- emissão idempotente de `catalogo_####`;
- token ligado a conversa/cliente;
- Storefront vincula pedido somente após token resgatado;
- Flow estruturado `customer_flow_v1` cadastra/vincula cliente idempotentemente;
- Flow pode atualizar pedidos pós-cutover sem cliente, nunca pedidos de outro cliente;
- texto livre permanece capture-only;
- painel simples PapoAI/WhatsApp na Central;
- pedido estruturado automático permanece bloqueado por runtime flag.

Runtimes no fechamento:
- `papo-external-agent-v1` v108 ACTIVE;
- `storefront-v2` v18 ACTIVE;
- `admin-products-live-v1` v69 ACTIVE.

Saúde observada:
- 411 eventos totais;
- 223/24h;
- 411 conversas vinculadas;
- 112 reconhecimentos de cliente;
- 0 review;
- 0 erro;
- 0 Flow real ainda;
- 0 token real ainda;
- 0 draft;
- 0 pedido criado pela ponte.

Teste sintético completo de Flow/link/order foi aprovado em transação e rollback limpo.

### Gate humano externo
Configurar no PapoAI o webhook do Flow usando `mode=customer_flow_v1` e homologar 1 caso real.
Não habilitar `structured_order_commit_enabled` antes disso.

Detalhes: `R8-PAPOAI-WHATSAPP-CHECKPOINT.md`.


## Auditoria Bling — empresa fiscal x canais de venda — 2026-09-29
Auditoria read-only feita pela API oficial do Bling, incorporada ao `probe_readonly` do `admin-service-intelligence-v1`.

Estado confirmado:
- empresa fiscal conectada: **SUPER CESTAS DONA ANTONIA LTDA**, CNPJ **51.385.335/0001-06**;
- depósito ativo/padrão: **Geral**;
- canais de venda cadastrados:
  - `Loja Nuvem` — Nuvemshop — **habilitado**;
  - `Super Cestas Dona Antonia` — Google Shopping — **desabilitado**;
  - `Dona Antonia Google Shopping` — Google Shopping — **habilitado**;
  - `Loja Mercado Livre - 01` — Mercado Livre — **habilitado**;
  - `Bling Loja Virtual` — Bling Loja Virtual — **habilitado**;
- amostra dos 100 pedidos de venda mais recentes no Bling: todos vieram sem `loja.id`; exemplos de `numeroLoja` são `VITRINE-...` e `SITE-...`. Portanto os canais acima **não fazem parte do fluxo atual de pedidos Dona Antônia**;
- a importação de XML/NF-e de entrada continua usando `/nfe?tipo=0`, sem filtro de canal de venda, e valida o CNPJ da empresa. Esses canais antigos não são a causa direta de NF-e recebidas não aparecerem no Admin;
- porém canais habilitados podem manter automações próprias de pedidos/estoque/preço no Bling e são ruído/risko desnecessário para a arquitetura de operação única.

Decisão:
- desativar no Bling os quatro canais sem uso: `Loja Nuvem`, `Dona Antonia Google Shopping`, `Loja Mercado Livre - 01` e `Bling Loja Virtual`;
- manter `Super Cestas Dona Antonia` desabilitado;
- **não excluir** histórico/vínculos nesta etapa; apenas desativar;
- a API pública do Bling expõe esses canais somente para leitura (`GET /canais-venda` e `GET /canais-venda/{id}`), então a desativação deve ser feita em **Central de Extensões > Minhas instalações > ⋮ > Desativar**;
- após a desativação, repetir o `probe_readonly` e confirmar que todos os cinco canais estão com situação 2/desabilitado.
- sincronização `purchase-xml-daily-v1` ajustada para **06:00 e 18:00 de Cuiabá** (cron `0 10,22 * * *` em UTC);
- `purchase_xml_settings.auto_create_payables=false` enquanto o financeiro automático de compras permanecer suspenso.


## Compras/XML — fila profissional de catálogo 31 dias — 2026-09-29
Implementado o modelo de automação por confiança para produtos vindos de NF-e:
- backend `catalog_queue` agrupa por produto/GTIN os itens das NF-e emitidas nos últimos 31 dias;
- fila única no Vitrine/Admin mostra produto novo ou existente, EAN, NCM, fornecedor, NF mais recente, conversão embalagem→UN, custo atual x novo, preço atual x sugerido e status;
- filtros: Pendentes, Novos, Já cadastrados, Revisar, Prontos, Aprovados e Todos;
- busca por produto, EAN, fornecedor, NF e NCM;
- botão **Autorizar seguros** aprova em lote somente itens com vínculo/custo/conversão determinísticos;
- itens ambíguos ficam fora do lote e exigem revisão humana;
- aprovação em lote atualiza custo unitário; preço só é elevado automaticamente quando está abaixo da sugestão mínima de 40%; estoque permanece inalterado;
- cadastro automático de produto novo continua habilitado; produto novo local nasce inativo e entra na fila para revisão comercial;
- janela automática operacional permanece em 31 dias.

Validação no runtime após implantação:
- 26 produtos únicos na janela de 31 dias;
- 11 novos;
- 15 já existentes;
- 22 prontos para aprovação segura;
- 2 exigindo revisão;
- 2 já aprovados.


## Produtos em cestas/kits + regra de lote/validade — 2026-09-29
### Filtro de produtos
- Vitrine/Admin > Produtos recebeu filtro **Somente produtos de cestas/kits**.
- O backend considera componentes dos templates ativos de cesta, componentes dos kits ativos e alternativas ativas.
- Estado validado na implantação: **30 produtos únicos** participam de cesta/kit ativo.
- `admin-products-live-v1` publicada como v113.

### Regra profissional de entrada por validade
Decisão arquitetural: cadastro comercial e recebimento físico são etapas distintas.
- atualizar produto existente nunca deve sobrescrever a validade do estoque anterior;
- cada recebimento/validade deve ser registrado em `product_inventory_lots` como lote separado;
- FEFO usa a validade mais próxima primeiro;
- XML pode fornecer rastreabilidade em `purchase_xml_item_lot_evidence`; quando não fornecer, a validade deve ser coletada no recebimento;
- uma mesma linha de NF-e pode ser dividida em vários lotes/validades;
- Bling permanece autoridade do saldo físico; o ledger de lotes no Admin deve reconciliar com o saldo físico antes de `lot_tracking_complete=true`.

Achado atual:
- estrutura FEFO e lotes já existe;
- porém ainda existem **0 lotes materializados** e **0 produtos com lot_tracking_complete=true** no banco;
- portanto o FEFO ainda não deve ser tratado como operacional até o fluxo de recebimento materializar/reconciliar lotes e a separação consumir/sugerir lotes de forma consistente.


## Recebimento por lote/validade + FEFO seguro — 2026-09-29
Implementado no Vitrine/Admin > Compras/XML:
- cada item de NF-e agora possui seção **Lotes e validades desta entrada**;
- XML com rastro pré-preenche lote/validade; sem rastro, operador informa;
- uma linha pode ser dividida em várias validades;
- soma dos lotes deve fechar exatamente com a quantidade convertida em UN;
- opção explícita **Sem controle de validade** para itens em que realmente não se aplica;
- entrada não pode ser preparada/verificada enquanto o plano de lotes estiver incompleto;
- salvar lotes/validade não altera estoque físico;
- após o aumento de estoque ser verificado no Bling, os lotes da compra são materializados em `product_inventory_lots` de forma idempotente;
- o Admin mostra lotes já cadastrados do produto ao lado da nova entrada;
- com `lot_tracking_complete=true`, o menor vencimento é marcado **FEFO: sair primeiro**;
- sem tracking completo, a menor validade é apenas referência provisória, com aviso de que o estoque legado ainda não foi reconciliado;
- FEFO de separação não será tratado como autoritativo até o levantamento inicial de lotes/validades do estoque antigo fechar com o físico do Bling.

Runtime:
- `admin-service-intelligence-v1` publicado como v214;
- teste read-only de documento retornou `receipt_lot_plan` e `current_inventory_lots` corretamente;
- no estado atual ainda não há lotes históricos materializados; a primeira entrada validada passará a criar o ledger de lotes novos.


## Migração progressiva de lotes/FEFO por produto — 2026-09-29
Decisão operacional: não exigir inventário geral de validades antes de usar o módulo.

Modelo híbrido por produto:
- enquanto `lot_tracking_complete=false`, o produto continua usando a validade legada e os lotes cadastrados são referência parcial;
- novas compras já podem registrar lotes/validades normalmente;
- o operador pode abrir **Produtos > Lotes** e distribuir o estoque daquele produto por validade aos poucos;
- o Admin mostra estoque físico Bling, quantidade já distribuída em lotes e quantidade ainda faltante;
- o botão **Ativar FEFO neste produto** somente conclui quando os lotes quantificados fecham com o estoque físico do Bling;
- depois de concluído, o produto usa validade efetiva por lotes e FEFO;
- não existe ativação global: cada produto migra no seu próprio ritmo.

UX adicionada em Produtos:
- badge por produto: **Lotes pendentes** ou **FEFO completo**;
- ação rápida **Lotes**;
- filtro: **Lotes/FEFO pendente** / **Lotes/FEFO completo**;
- dentro do editor, botão **Lotes/validades**;
- formulário simples para lote, validade e quantidade.

Runtime: `admin-products-live-v1` publicado como v114. JavaScript do Admin validado sem erro de sintaxe.


## Identidade cliente / PapoAI multicanal — 2026-09-29
Correção estrutural implantada para impedir pedidos do site órfãos de cliente. O checkout cria/resolve identidade antes do pedido e há trigger de defesa no banco; telefone brasileiro é canonizado com equivalência segura do nono dígito; 1018 e 0975 são contas distintas; o Flow real do PapoAI (mensagem com `flow_token` + `custom_1..custom_5`) é processado automaticamente e enriquece cliente/endereço/documento válido. Backfill deixou 0 pedidos recentes com telefone e sem cliente. Restou somente 1 pedido legado de 22/09 sem telefone, que não deve ser vinculado por aproximação. Detalhes e evidências em `PAPOAI-CUSTOMER-IDENTITY-FIX-2026-09-29.md`.
