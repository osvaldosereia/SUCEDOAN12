# Dona Antônia Operations 2.0 — HANDOFF

> Documento canônico de continuidade. Atualizar ao final de cada rodada relevante.
> Última atualização: 2026-09-25.

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
- Projeto legado Chat Commerce OS qxstkwshuvplmmftrctj está inativo.
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
O usuário determinou que não deve haver programação nem alteração de produção até toda a análise estar concluída, revisada e consolidada no Projeto Final detalhado. Documentação de análise pode ser atualizada para preservar continuidade.

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
- site deve espelhar saldo virtual do depósito Geral, atualizado por webhooks;
- Geral + Quarentena são suficientes;
- pós-venda precisa tratar arrependimento, vício, troca, refund e devolução sem apagar a venda original;
- recall por lote entra como fluxo simples de bloqueio + Quarentena + rastreabilidade;
- operação custom fica limitada a cinco superfícies: Central, Pedidos/Nova venda WhatsApp, Tablet Separação, Balanço/Avaria/Retorno e Entregador;
- compras/check-in/checkout/fiscal/financeiro ficam preferencialmente no Bling;
- análise marcada como pronta para consolidação do PROJECT-MASTER; ainda não implementar.

Novos documentos:
- `POSTSALE-CONSUMER-RECALL-DRAFT.md`
- `RECEIVING-SUPPLIER-RETURNS-DRAFT.md`
- `STOCK-RECONCILIATION-DRAFT.md`
- `MINIMAL-PROFESSIONAL-OPERATION-DRAFT.md`
- `PROJECT-FINAL-READINESS.md`

## Projeto Final Consolidado — 2026-09-25
A fase de análise foi consolidada em documentos canônicos:

1. `PROJECT-MASTER.md` — arquitetura e operação final;
2. `SOURCE-OF-TRUTH.md` — autoridade final por domínio;
3. `IMPLEMENTATION-ROADMAP.md` — ordem de homologação e implantação.

Os arquivos `*-DRAFT.md` permanecem como evidência e pesquisa de apoio, mas decisões novas devem partir do PROJECT-MASTER e SOURCE-OF-TRUTH final.

**Importante:** ainda não houve implementação de produção desta nova arquitetura. Próximo passo só deve começar após aprovação explícita do Projeto Final.

## Como retomar em qualquer novo chat
Dizer:
"Retome Dona Antônia Operations 2.0. Leia docs/projects/dona-antonia-operations-2/HANDOFF.md no SUCEDOAN12, confirme o estado real no GitHub/Supabase antes de agir e continue do Próximo passo. Não altere produção sem homologação."

## Regra de continuidade
Ao terminar cada rodada importante:
1. atualizar este HANDOFF;
2. registrar o que foi realmente concluído;
3. registrar pendências/bloqueios;
4. atualizar Próximo passo;
5. nunca depender apenas do histórico do chat.


## Implantação em andamento — 2026-09-25
A análise foi aprovada e a implantação segura já começou. A frase antiga de "não implementar" neste HANDOFF ficou histórica e não deve bloquear o trabalho atual.

Concluído na onda atual:
- fundação Control Tower/ledger/attention/approvals;
- polling ocioso pausado;
- Bling em modo homologação com Hub/Webhooks ainda OFF;
- OAuth de reautorização Bling preparado;
- reserva do checkout movida para a confirmação;
- shadow readiness de early-order;
- fila de impressão de picking;
- motor canônico multicanal;
- Nova venda WhatsApp;
- PapoAI receiver capture-only no lugar do 410.

Versões atuais:
- admin-products-live-v1 v22;
- storefront-v2 v16;
- admin-service-intelligence-v1 v137;
- papo-external-agent-v1 v105.

Próximos gates:
- capturar payload real do PapoAI e normalizar eventos;
- reautorizar escopos de Situações no Bling e provar reserva/webhook;
- depois canário de early-order no Bling;
- POC de impressora física.


### Ponte PapoAI de conversa operacional
- payload real já é normalizado pelo adapter v2;
- `papoai_ensure_conversation_v2` faz o vínculo do inbound com `conversations`;
- receiver PapoAI v107 chama normalização + ponte inline, sem cron;
- conversa local é espelho operacional, não fonte do canal;
- cliente não é criado automaticamente;
- texto livre não cria pedido;
- rascunho versionado só deve receber eventos estruturados e determinísticos.

Próximo passo PapoAI: observar eventos de botões/flows/ações estruturadas e mapear somente os que permitirem montar/revisar o draft com segurança.


### Estado de implantação — separação/PapoAI
- PapoAI receiver v107 + normalizer v2 + conversation bridge v2 estão recebendo tráfego real;
- 9/9 eventos observados em 24h ficaram vinculados a conversas, sem revisão pendente;
- nova aba Separação atende tablet vertical com fluxo mínimo;
- picking 85 mm agora inclui foto, nome, EAN, quantidade e localização;
- impressão silenciosa ainda depende da POC física;
- próximo grande bloqueio externo continua sendo reautorizar o Bling para Situações/Módulos/Transições.


### Estoque mobile auditável
- `ops_inventory_counts` registra contagem física, saldo anterior, diferença, operador e estado de reconciliação;
- `ops_inventory_incidents` registra avaria, vencido, perda, retorno e outras ocorrências;
- Balanço não perde mais a causa/auditoria da diferença;
- durante a transição, a contagem atualiza o espelho local para manter o site coerente, mas diferença segue aberta para reconciliação no Bling/fiscal;
- avaria/vencido/perda saem imediatamente do estoque vendável local;
- retorno fica fora do vendável até inspeção;
- tela `Estoque mobile` no Admin usa leitor EAN + teclado na tela;
- próximo passo deste domínio: após homologar estoque/depósitos no Bling, trocar o efeito local por movimento oficial Geral -> Quarentena / reconciliação de Balanço.
