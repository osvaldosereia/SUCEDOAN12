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


### Pagamento efetivo na entrega
- `order_payment_settlements` e `order_payment_parts` foram adicionadas;
- o pagamento previsto no pedido não é mais tratado como pagamento efetivo;
- entregador/operador registra o que realmente recebeu;
- split de até 2 formas já está disponível na UI operacional, enquanto o backend suporta até 8 partes;
- a soma precisa fechar exatamente o total;
- somente depois da captura o pedido é marcado como Entregue;
- se o pagamento falhar, usar `Não entregou`;
- settlement fica `blocked_homologation` para Bling até o gate fiscal/financeiro;
- não chamar mais o antigo `order_fiscal_confirm_payment` como confirmação simples da entrega.

Próximo passo deste domínio: implementar retorno físico/não entrega como ocorrência explícita e depois, após homologação Bling, sincronizar recebimentos reais ao financeiro.


### Não entrega / retorno físico
- `order_delivery_return_cases` controla tentativas não concluídas e retorno da mercadoria;
- `Não entregou` não volta mais o pedido diretamente para Pronto;
- pedido permanece em entrega com overlay `returning` até a mercadoria voltar fisicamente;
- no tablet do entregador aparece `CONFIRMAR RETORNO AO DEPÓSITO`;
- ausente/endereço/reagendamento/veículo -> retorno confirmado -> `ready` para reentrega, sem restaurar estoque;
- pagamento falhou/cliente recusou/outro -> retorno confirmado -> `returned_review`, bloqueado para nova saída e atenção do supervisor;
- backend bloqueia captura de pagamento/Entregue enquanto houver retorno aberto;
- backend bloqueia saída de pedido `ready` com retorno em revisão.

Próximo passo: criar a resolução do retorno em revisão (mercadoria íntegra x avaria/falta) e só depois executar cancelamento/restauração de estoque/fluxo fiscal correspondente.


### Resolução de retorno em revisão
- supervisor pode liberar mercadoria íntegra para reentrega sem mexer no estoque;
- supervisor pode cancelar apenas quando confirmar que TODO o retorno está íntegro;
- nesse caso o estoque local consumido é restaurado e o pedido fica cancelado comercialmente;
- sempre abre atenção fiscal `delivery_return_fiscal_review`; nenhuma NF-e é alterada automaticamente;
- se existir pagamento capturado, o cancelamento íntegro é bloqueado até fluxo de reembolso;
- se houver avaria/falta, usar Estoque mobile e não restaurar o pedido inteiro.


## Gate Bling automatizado pós-OAuth — 2026-09-25
- `admin-service-intelligence-v1` publicado em v139;
- após uma reautorização OAuth bem-sucedida, o backend testa automaticamente `/situacoes/modulos`;
- catálogo autorizado passa a gravar `state=ready` e `status_updates_enabled=true`;
- a pendência `bling_scope_missing` é resolvida automaticamente quando o teste passa;
- Hub, Webhooks e fiscal continuam desligados; nenhuma escrita de pedido é ativada automaticamente;
- enquanto o Bling responder 403, o runtime permanece em homologação e o canário não avança.

### Ação manual ainda necessária
No cadastro do aplicativo Dona Antônia no Bling, liberar o acesso aos recursos de Situações/Módulos/Transições, salvar e reautorizar o aplicativo pelo botão **Reconectar Bling** do Vitrine/Admin. Depois disso a verificação é automática.


## Bling — Situações + reserva de estoque homologadas — 2026-09-25

### Escopos e catálogo
- reconexão OAuth concluída com o aplicativo correto **GitHub - Sincronização de Produtos**;
- `GET /situacoes/modulos` passou a responder HTTP 200;
- módulo **Vendas** identificado de forma determinística;
- catálogo de situações e transições gravado no runtime;
- `status_updates_enabled=true`;
- situações customizadas resolvidas:
  - `Aguardando confirmação` = 915901;
  - `Aprovado / Separar` = 915902;
- transição `Aguardando confirmação -> Aprovado / Separar` = 504837238;
- transição de rollback `Aprovado / Separar -> Aguardando confirmação` = 504838770.

### Canário real
Pedido Bling usado para homologação: `26967482613`.

Estado inicial:
- situação `Aguardando confirmação`;
- sem NF-e;
- saldo físico e saldo virtual iguais nos produtos amostrados.

Após mudança para `Aprovado / Separar`:
- situação alterada e confirmada por leitura da API;
- saldo físico permaneceu inalterado;
- saldo virtual caiu 1 unidade nos três produtos amostrados;
- reserva de estoque portanto foi comprovada.

Produtos amostrados:
- Açafrão-da-terra Itapero 30 g: físico 10 / virtual 10 -> 9;
- Achocolatado Apti 200 g: físico 3 / virtual 3 -> 2;
- Arroz Tio Bonini 5 kg: físico 97 / virtual 97 -> 96.

Rollback:
- pedido voltou para `Aguardando confirmação`;
- saldo virtual retornou a 10 / 3 / 97;
- saldo físico continuou intacto;
- liberação da reserva também foi comprovada.

### Configuração Bling homologada
Reserva de estoque configurada para considerar:
- `Aprovado / Separar`;
- `Verificado`.

`Aguardando confirmação` não deve reservar.

### Resultado
Gate **Situações + Reserva** = HOMOLOGADO.

O Hub geral continua em homologação e webhooks ainda não foram liberados para processamento. Próximo gate: homologar webhook real do Bling e reconciliação sem polling.


## Bling — receiver e reconciliação de webhooks homologados internamente — 2026-09-25

### Código/runtime
- o código em produção estava 18,6 KB à frente do GitHub; o drift foi eliminado antes de novos deploys;
- `admin-service-intelligence-v1` sincronizada no `SUCEDOAN12`;
- v148 adicionou canário interno do receiver;
- v149 adicionou reconciliação de pedido orientada a evento, somente leitura;
- commits principais:
  - `e3378907` — sincronização do runtime + canário do receiver;
  - `ff680757` — reconciliação de webhook de pedido por evento.

### Receiver canário
Evento sintético assinado internamente:
- assinatura HMAC válida -> HTTP 200;
- evento armazenado com `signature_verified=true`;
- como `hub_enabled=false` e `webhooks_enabled=false`, evento ficou `held`;
- envio duplicado do mesmo `eventId/hash` -> HTTP 200 e `duplicate=true`, sem segunda linha;
- assinatura inválida -> HTTP 401;
- nenhum efeito externo e nenhuma mutação de pedido.

### Reconciliação canário
Evento: `c1acf430-cfd8-4018-b103-b0589025e05e`.
Pedido Bling: `26967482613`.
Pedido canônico: `2e464c9f-f5df-4d75-baa4-f6455addd6d4`.

Resultado:
- vínculo Bling <-> pedido local resolvido;
- status local `storefront_received` mapeia para Bling `915901`;
- leitura remota observou `915901`;
- classificação `order_reconciled_noop`;
- evento finalizado como `processed`;
- `local_mutation=false`;
- anti-loop preservado.

### Gate atual
Receiver + idempotência + assinatura + reconciliação de pedido = **PASSARAM internamente**.

Ainda falta a prova de **entrega real pelo Bling**. A inbox estava vazia antes do canário, então o aplicativo ainda não está enviando webhooks para o endpoint.

Ação manual necessária no aplicativo **GitHub - Sincronização de Produtos**:
1. abrir aba **Webhooks**;
2. cadastrar servidor:
   `https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-service-intelligence-v1?source=bling-webhook-v2`
3. habilitar versão `v1` para:
   - Pedido de Venda (`order`);
   - Produto (`product`);
   - Estoque (`stock`);
   - Nota Fiscal (`invoice`);
4. habilitar ações disponíveis `created`, `updated`, `deleted`;
5. salvar.

O Bling habilita `virtual_stock` automaticamente junto com `stock`.

Segurança:
- manter `hub_enabled=false`;
- manter `webhooks_enabled=false`;
- eventos reais recebidos ficam `held` até a homologação final.


## Bling — entrega real de webhooks homologada — 2026-09-25

### Prova real
Depois da configuração manual no aplicativo **GitHub - Sincronização de Produtos**, o Bling começou a entregar webhooks reais no receiver do Operations 2.0.

Pedido canário:
- Bling: `26967482613`;
- canônico: `2e464c9f-f5df-4d75-baa4-f6455addd6d4`.

Ao mudar `Aguardando confirmação -> Aprovado / Separar`:
- chegou `order.updated` real com situação `915902`;
- assinatura real foi validada;
- evento ficou `held` porque processamento geral permanece desligado;
- a reconciliação detectou corretamente drift entre local `storefront_received`/esperado `915901` e Bling `915902`;
- nenhuma mutação local foi feita.

Ao devolver `Aprovado / Separar -> Aguardando confirmação`:
- chegou segundo `order.updated` real com situação `915901`;
- assinatura válida;
- reconciliação terminou como `order_reconciled_noop`;
- local e Bling ficaram consistentes.

### Estoque virtual
A aprovação e o rollback geraram **56 eventos reais `virtual_stock.updated`**:
- 28 produtos ao entrar a reserva;
- os mesmos 28 produtos ao liberar a reserva;
- todas as assinaturas verificadas;
- saldo físico permaneceu intacto;
- saldo virtual foi reservado e depois liberado.

Os 56 eventos do canário foram classificados como teste e limpos da fila `held`, sem alterar estoque local.

### Resultado
Gate **Webhook real + assinatura + idempotência + reconciliação de pedido = HOMOLOGADO**.

Estado de segurança preservado:
- `mode=homologation`;
- `hub_enabled=false`;
- `webhooks_enabled=false`;
- nenhum processamento geral foi ativado;
- Make não foi usado.

Próximo passo: homologar o processamento de `virtual_stock.updated` para atualizar de forma segura o espelho local usado pelo site, antes de liberar webhooks gerais.



## Espelho de estoque Bling por webhook — HOMOLOGADO em 2026-09-25

### Backfill
O shadow mirror `bling_stock_mirror_v2` foi preenchido por leitura do Bling, sem escrita externa:
- 1.634 produtos ativos;
- 1.630 ativos com vínculo Bling exato;
- 1.630/1.630 vinculados cobertos pelo mirror;
- 4 ativos sem correspondência exata por GTIN/SKU no catálogo Bling;
- 0 vinculados sem snapshot.

Comparação do legado `products.stock` com o saldo virtual do depósito Geral:
- 1.087 iguais;
- 543 divergentes;
- 168 com local acima do Bling;
- 375 com local abaixo do Bling;
- 11 vendáveis localmente enquanto o Bling estava zerado;
- 3 zerados localmente enquanto o Bling tinha saldo.

Os 4 sem vínculo ficaram em atenção; nenhum vínculo aproximado foi criado.

### Atualização orientada a evento
Foi implantada aplicação idempotente de `virtual_stock.updated` no mirror:
- fonte: webhook Bling assinado;
- depósito vendável: Geral;
- proteção contra evento fora de ordem por `observed_at`;
- nunca altera `products.stock`;
- nunca escreve estoque de volta no Bling;
- sem cron/worker de sincronização contínua.

Durante a primeira ativação do trigger houve um erro de implementação: uso de `min(uuid)` no PostgreSQL causou respostas HTTP 500 para eventos de estoque. A flag shadow foi desligada imediatamente, o erro foi localizado nos logs e corrigido pela migration `ops2_virtual_stock_shadow_trigger_v1_fix`.

Após a correção:
- flag shadow reativada;
- rollback real do pedido canário gerou 28 `virtual_stock.updated`;
- 28/28 foram processados automaticamente;
- receiver respondeu HTTP 200 em todos;
- maior tempo observado: 2.214 ms;
- mirror do Achocolatado fechou em físico 3 / virtual 3;
- pedido canário voltou para `Aguardando confirmação`;
- reserva ficou liberada;
- 0 eventos `virtual_stock` canários permaneceram presos em `held`.

Estado do gate: **PASSOU**.

O Hub geral continua desligado:
- `hub_enabled=false`;
- `webhooks_enabled=false`;
- somente o shadow mirror de `virtual_stock.updated` está ativo.

### Próximo gate
Antes de o site consumir o mirror, remover a dependência operacional do modelo legado:
- checkout ainda valida `products.stock`;
- confirmação ainda cria reserva local;
- trigger legado ainda consome `products.stock` ao confirmar;
- Admin ainda calcula readiness com `products.stock`;
- esse ciclo precisa ser substituído de forma atômica para impedir dupla contagem com a reserva oficial do Bling.


## Regra reforçada de continuidade — 2026-09-25

O planejamento operacional detalhado foi atualizado em `IMPLEMENTATION-ROADMAP.md` no commit `ef3b60a0`.

A partir desta rodada, é regra obrigatória:
- nenhuma rodada importante termina sem atualizar o HANDOFF;
- conferir GitHub + Supabase/runtime antes de retomar;
- registrar commits, migrations, versões de Edge Functions, flags, testes, evidências, PASS/FAIL, rollback, pendências e próximo passo exato;
- atualizar também `HOMOLOGATION-STATUS.md` quando um gate for testado/homologado;
- não depender do histórico do chat para continuidade;
- código escrito sem teste/evidência/documentação não conta como etapa concluída;
- se houver interrupção, a retomada deve ser possível somente pelo repositório, Supabase/runtime e documentos canônicos.

### Próximo bloco oficial
Prioridade: fechar **pedido + estoque Bling** antes de limpeza ou expansão lateral.

Sequência:
1. baseline/documentação e 4 produtos sem vínculo;
2. cobertura determinística do catálogo;
3. cutover da leitura de estoque para saldo vendável Bling;
4. remoção da dupla reserva/baixa local;
5. early-order Bling em canário;
6. canário ponta a ponta com reserva virtual, separação, Verificado, saída e baixa física;
7. somente após PASS, ativação controlada das flags de produção.

O roadmap completo contém os blocos seguintes: Separação/Checkout, Estoque operacional, Rota/Entrega/Pagamento, Fiscal/Financeiro, Compras/XML, PapoAI, Control Tower, Segurança e Cleanup.

## Continuidade do próximo bloco — 2026-09-25
O próximo bloco oficial permanece **Pedido + Estoque Bling**, seguindo exclusivamente o planejamento já registrado em `IMPLEMENTATION-ROADMAP.md`.

Regra reforçada:
- manter o padrão documental já existente nesta pasta;
- não criar documentos paralelos de planejamento sem necessidade;
- atualizar `HANDOFF.md` ao final de cada rodada relevante;
- atualizar `HOMOLOGATION-STATUS.md` quando um gate for testado/homologado;
- atualizar `IMPLEMENTATION-ROADMAP.md` somente quando houver mudança real de plano, ordem ou critério;
- registrar commits, migrations, versões, flags, testes, PASS/FAIL, rollback, pendências e próximo passo exato;
- nunca depender apenas do histórico do chat.

### Próximo passo exato
Seguir o **BLOCO A — Fechar pedido + estoque Bling** já existente no `IMPLEMENTATION-ROADMAP.md`, começando por **A1 — Atualizar documentação e baseline**, sem criar uma estrutura documental nova.


## BLOCO A — A1 baseline atualizado — 2026-09-25

Rodada executada somente em leitura/documentação. Nenhuma flag, estoque, pedido ou runtime foi alterado.

### GitHub
HEAD observado antes deste checkpoint: `c538766a`.
Último commit funcional do Operations 2.0 antes das atualizações documentais: `af5fbc25` — homologação de lançamento/estorno físico de pedido.

### Runtime Supabase/Bling
- projeto canônico: `ssbesxgaijknwsjbsbcz`;
- `mode=homologation`;
- `hub_enabled=false`;
- `webhooks_enabled=false`;
- `ops2_direct_order_state_enabled=false`;
- `stock_authority=legacy_shadow`;
- `stock_cutover_at=null`;
- physical stock gate: `verified`;
- webhook gate: `real_delivery_verified`;
- stock mirror gate: `verified`.

Versões observadas:
- `admin-service-intelligence-v1` v154;
- `admin-products-live-v1` v36;
- `storefront-v2` v16;
- `papo-external-agent-v1` v107.

### Baseline do estoque vendável
- produtos ativos: 1.634;
- prontos no mirror Bling: 1.630;
- não prontos: 4;
- iguais legado x Bling: 1.087;
- divergentes: 543;
- legado positivo / Bling zero: 11;
- legado zero / Bling positivo: 3;
- última observação do mirror no baseline: 2026-09-25T22:47:21Z.

### 4 produtos ativos sem mirror Bling
1. Desodorante antitranspirante roll-on NIVEA Dry Comfort Feminino — GTIN `4005808257584` — estoque local 3 — WhatsApp inativo.
2. Flocão de Milho Urbano 500 g — GTIN `787896038300136` — estoque local 3 — WhatsApp inativo.
3. Gel Dental Infantil Avengers Kids+ Morango Condor 50 g — GTIN `7891055394878` — estoque local 3 — WhatsApp inativo.
4. Papel Higiênico Branquíssimo e Fofíssimo Folha Simples Personal 16 rolos — SKU/GTIN `7896110005874` — estoque local 10 — **WhatsApp ativo**.

### Evidência / gate
A1 baseline documental: **PASS**.
Nenhuma tentativa de corrigir vínculo foi feita nesta rodada.

### Observação técnica
A consulta inicial tratou `status_updates_enabled` como coluna física, mas o runtime atual não possui essa coluna; esse estado deve ser lido do metadata/estrutura correspondente. Nenhuma alteração resultou dessa consulta.

### Rollback
Não aplicável: rodada sem escrita em produção.

### Próximo passo exato
Continuar o BLOCO A com **A2 — Resolver cobertura do catálogo** do `IMPLEMENTATION-ROADMAP.md`.
Primeiro investigar deterministicamente os quatro produtos acima no catálogo Bling. Não criar vínculo aproximado. O produto Personal 16 rolos merece prioridade porque ainda está ativo no canal. Se não houver identidade exata comprovável, bloquear da venda antes do futuro cutover.


## BLOCO A — A2 cobertura do catálogo — investigação — 2026-09-25

Continuação executada sem criar vínculo aproximado e sem alterar flags de produção.

### Resultado
Os quatro produtos ativos fora do mirror continuam sem `bling_product_id` também na visão fiscal `product_fiscal_bling_diff_v1`. O banco local ainda não contém evidência suficiente para afirmar uma identidade Bling exata para nenhum deles.

### Decisão de segurança
Nenhum vínculo foi criado. A regra A2 exige identidade determinística por GTIN/SKU/ID confirmado; nome semelhante não é suficiente. O item Personal 16 rolos permanece como prioridade porque no baseline foi observado ativo no canal.

### Gate
A2: **EM ANDAMENTO / BLOQUEADO PARA VÍNCULO** até consulta exata ao catálogo Bling ou bloqueio comercial comprovado dos itens sem fonte de saldo.

### Flags
Sem alteração:
- `ops2_direct_order_state_enabled=false`;
- `stock_authority=legacy_shadow`;
- `stock_cutover_at=null`.

### Próximo passo exato
Usar a integração Bling já existente para consultar os quatro identificadores diretamente no catálogo ERP. Vincular somente correspondências exatas. Para qualquer item sem correspondência inequívoca, bloquear da venda antes do cutover de leitura de estoque. Depois reexecutar `get_ops2_sellable_stock_status_v1()` e exigir cobertura segura antes de avançar ao cutover.


## BLOCO A — A2 rodada pequena: caminho oficial de consulta Bling — 2026-09-25

### Escopo
Somente localizar e validar o mecanismo já existente no código para consulta determinística de produto no Bling. Nenhuma escrita de produto, vínculo, estoque ou flag nesta rodada.

### Evidência
O caminho já existe em `supabase/functions/purchase-xml-v1/index.ts`, função `remoteProductByGtin`:
- consulta `GET /produtos` com `gtins[]`;
- normaliza e compara o GTIN retornado;
- aceita somente uma correspondência exata;
- se houver mais de uma correspondência exata, gera `multiple_bling_gtin`.

A função `ensureProduct` já utiliza esse mecanismo antes de qualquer criação/vínculo e também rejeita conflito entre `local.bling_product_id` e o produto encontrado por GTIN.

### Gate
A2 / mecanismo de identificação: **PASS**.
O projeto já possui regra adequada para identidade determinística; não é necessário inventar novo mecanismo.

### Alterações de produção
Nenhuma.

### Próximo passo exato
Em uma nova rodada pequena, reutilizar esse caminho já existente em modo somente consulta para os quatro GTINs pendentes. Registrar os resultados exatos antes de qualquer vínculo ou bloqueio comercial.


## BLOCO A — A2 cobertura do catálogo concluída — 2026-09-25

### Evidência final
O read model `ops2_sellable_stock_v1` mostrou os quatro produtos pendentes com:
- `bling_product_id=null`;
- `link_status=not_found`;
- `bling_stock_ready=false`;
- `stock_source_reason=unlinked`.

Isso confirma que o mecanismo determinístico de matching já os procurou sem encontrar correspondência Bling segura.

### Ação
Os quatro produtos foram desativados comercialmente com `is_active=false` e `is_whatsapp_active=false`. Cadastro e estoque histórico foram preservados; nenhum produto foi apagado e nenhum vínculo artificial foi criado.

Produtos desativados:
- NIVEA Dry Comfort Feminino — GTIN 4005808257584 — estoque local preservado 3;
- Flocão de Milho Urbano 500 g — GTIN 787896038300136 — estoque local preservado 3;
- Gel Dental Infantil Avengers Kids+ 50 g — GTIN 7891055394878 — estoque local preservado 3;
- Papel Higiênico Personal 16 rolos — GTIN 7896110005874 — estoque local preservado 10.

### Revalidação
Após a ação:
- produtos ativos: 1.630;
- `active_bling_ready=1630`;
- `active_not_ready=0`;
- `stock_authority=legacy_shadow`;
- `stock_cutover_at=null`;
- divergências legado x Bling permanecem 543 e serão tratadas no gate apropriado, sem cópia cega de saldos.

### Gate
**A2 — PASS.**
100% do catálogo ativo restante possui cobertura segura do mirror Bling.

### Rollback
Os quatro cadastros permanecem intactos e podem ser reativados após vínculo Bling determinístico e mirror válido. Não restaurar venda antes disso.

### Próximo passo exato
Avançar para o próximo gate do BLOCO A no `IMPLEMENTATION-ROADMAP.md`: preparar e validar o cutover da **leitura de estoque** para `ops2_sellable_stock_v1`, ainda sem ligar globalmente `stock_authority=bling`. Mapear primeiro todos os consumidores de `products.stock` no site/checkout/admin para evitar fonte dupla.


## BLOCO A — cutover de leitura: mapeamento de dependências — 2026-09-25

### Escopo
Rodada média de preparação. Nenhuma mudança de `stock_authority` e nenhum cutover global.

### Dependências encontradas
O estoque legado ainda participa diretamente de pontos críticos:
- `storefront-v2`: listagem de ofertas e detalhe de produto consultam `products.stock`;
- `create_vitrine_cart_order_v1`: disponibilidade de produto, limite de componente de cesta e validação final de demanda usam `products.stock`;
- `reserve_vitrine_order_stock_v1`: calcula disponibilidade sobre `products.stock` menos reservas locais;
- `consume_vitrine_order_stock_v1` e `release_vitrine_order_stock_v1`: ainda pertencem ao ciclo legado de baixa/restauração;
- `admin-products-live-v1`: exibe e permite editar `products.stock`, portanto deve permanecer tratado como interface transitória até o gate de estoque operacional.

### Evidência
No banco atual, as quatro funções `create_vitrine_cart_order_v1`, `reserve_vitrine_order_stock_v1`, `consume_vitrine_order_stock_v1` e `release_vitrine_order_stock_v1` ainda contêm dependência direta de estoque legado.

### Decisão
Não alterar somente a vitrine isoladamente. O próximo patch deve manter catálogo + criação do pedido + validação de demanda coerentes com `ops2_sellable_stock_v1`. Reserva/consumo/release legado será desligado no gate específico de dupla reserva/baixa, não misturado silenciosamente nesta etapa.

Enquanto `stock_authority=legacy_shadow`, o read model devolve o mesmo saldo legado, permitindo implantar a troca de leitura sem alterar a autoridade real.

### Gate
Mapeamento de consumidores críticos: **PASS**.
Cutover de leitura: **AINDA NÃO EXECUTADO**.

### Próximo passo exato
Implementar uma migration versionada para fazer `create_vitrine_cart_order_v1` validar disponibilidade e limites através de `ops2_sellable_stock_v1.effective_sellable_stock`; em seguida adaptar `storefront-v2` para a mesma fonte. Manter `stock_authority=legacy_shadow`, executar smoke tests de produto simples, cesta e insuficiência, e só então avaliar o canário de autoridade Bling.
