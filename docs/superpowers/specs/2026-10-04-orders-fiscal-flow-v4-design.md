# Pedidos V4 — Fiscal antes da saída e operação simplificada

## Objetivo
Corrigir a etapa pós-separação do Pedidos V3 para que o fluxo operacional, fiscal e de entrega tenha uma única ordem coerente, simples para os funcionários e compatível com a exigência de autorização da NF-e antes da circulação da mercadoria.

Fluxo-alvo:

**RECEBIDO → CONFIRMADO → SEPARAÇÃO → SEPARADO → NF-e AUTORIZADA → SAÍDA PARA ENTREGA → ENTREGA + PAGAMENTO → ENTREGUE**

`SAÍDA PARA ENTREGA` é um evento operacional interno, não uma nova tag grande obrigatória no card. Ele existe para registrar o momento em que a mercadoria efetivamente deixou o estabelecimento e separar corretamente os cenários de cancelamento fiscal e insucesso de entrega.

A NF-e deixa de depender de `delivered` e passa a depender da conclusão da separação, total final do pedido e dados fiscais/cliente válidos. O pagamento continua sendo confirmado somente na entrega.

## Problema atual
O Pedidos V3 foi desenhado como `Confirmado → Separado → Entregue → Fiscal`. Ao mesmo tempo, o banco ainda contém gates que exigem autorização fiscal antes de `out_for_delivery`/`delivered`.

A combinação cria uma contradição:
- o gate de expedição exige NF-e autorizada antes da saída;
- `refresh_order_fiscal_readiness_v1` e `preview_bling_invoice_eligibility_v1` só consideram o pedido fiscalmente pronto quando já está `delivered` e com pagamento confirmado.

Essa ordem é impossível quando o gate estiver efetivamente ativo.

## Princípios
- Um único fluxo operacional visível para o funcionário.
- Estados técnicos internos não viram uma segunda gestão paralela.
- Separação precisa ser concluída antes da emissão fiscal para que faltas e total final já estejam consolidados.
- NF-e autorizada deve existir antes da mercadoria sair para entrega.
- Pagamento permanece ligado à confirmação de entrega, pois a venda local é paga na entrega.
- A forma de pagamento escolhida no checkout é **prevista**; a forma realmente recebida na entrega é a verdade financeira final.
- Falha de integração externa não pode repetir baixa de estoque, abatimento, pagamento ou criar duas notas.
- A UI fecha automaticamente janelas apenas após sucesso real; em erro, permanece aberta com mensagem objetiva.
- Depois da saída física, uma falha de entrega não pode provocar cancelamento automático da NF-e.

## 1. Confirmação do pedido
Ao clicar `CONFIRMADO`, o sistema mantém o comportamento atual válido:

1. valida dados operacionais mínimos;
2. reserva estoque;
3. grava `confirmed_at`;
4. registra o marco `CONFIRMADO`;
5. sincroniza o pedido com o Bling no estado de aprovado/separação;
6. mantém recuperação automática caso o Bling esteja temporariamente indisponível.

A confirmação não emite NF-e e não altera pagamento.

## 2. Separação
A Vitrine de Separação continua sendo o único lugar onde os itens confirmados são classificados como:
- `SEPARADO`;
- `FALTOU`.

### Visual
Os dois botões começam neutros/apagados. Somente o estado escolhido acende:
- `SEPARADO`: verde;
- `FALTOU`: vermelho.

A foto recebe uma etiqueta central:
- `✓ SEPARADO`;
- `× FALTOU`.

### Conclusão
`CONCLUIR SEPARAÇÃO` só fica disponível com zero pendentes.

No sucesso:
- persiste faltas;
- aplica abatimento uma única vez;
- consolida total final;
- aplica estoque de forma idempotente;
- atualiza a vitrine pública;
- marca o pedido como operacionalmente `SEPARADO`/`ready`;
- fecha o bottom sheet automaticamente;
- atualiza o card na lista sem exigir recarregar a página.

Se uma integração externa falhar depois da aplicação local, a tela deve informar a pendência, mas o retry não pode reaplicar estoque ou abatimento.

## 3. Status visuais na lista
As tags passam a ser maiores e visualmente distintas. O objetivo é permitir leitura rápida à distância.

Paleta proposta:
- `CONFIRMADO`: azul;
- `SEPARADO`: laranja;
- `NF-e PENDENTE`: cinza/âmbar;
- `NF-e AUTORIZADA`: roxo/azulado;
- `ENTREGUE`: verde;
- `CANCELADO`: vermelho;
- `ENTREGA NÃO CONCLUÍDA`: vermelho/âmbar quando houver ocorrência.

As tags são marcos persistidos, não apenas decoração de botão.

O card continua simples: código, data, cliente, total atual, tags e ações essenciais.

`SAIU PARA ENTREGA` pode aparecer apenas como informação discreta de expedição/entregador, sem poluir o conjunto principal de tags.

## 4. Fiscal após separação
Assim que a separação for concluída, o pedido passa a ser candidato à emissão fiscal.

A prontidão fiscal deve depender de:
- pedido em `ready`/Separado;
- conclusão de separação persistida;
- zero itens pendentes;
- total final válido;
- dados do cliente/endereço necessários presentes;
- dados fiscais dos produtos válidos para emissão;
- pedido sincronizado com Bling de forma compatível com emissão.

A prontidão fiscal **não deve depender de**:
- `delivered`;
- pagamento recebido;
- `payment_status='confirmed'`.

Esses dados continuam existindo para fechamento financeiro, mas não bloqueiam a emissão da nota que acoberta a saída da mercadoria.

## 5. Emissão da NF-e
Na primeira versão V4, a emissão é humana, com um clique, após a separação.

Dentro de `ABRIR PEDIDO`, após `SEPARADO`, aparece um bloco fiscal simples:

- `NF-e: PENDENTE`;
- botão principal `EMITIR NF-e`;
- quando enviado: `NF-e: PROCESSANDO`;
- autorizado pela SEFAZ: `NF-e AUTORIZADA` + número da nota;
- rejeitado: `NF-e REJEITADA` + motivo objetivo + ação de tentar novamente depois da correção.

O botão `EMITIR NF-e` deve usar a integração canônica já existente com o Bling/SEFAZ e manter idempotência para impedir emissão duplicada em clique repetido.

Depois de autorização:
- grava `bling_invoice_id`/número quando disponíveis;
- grava `sefaz_status`;
- grava `dispatch_fiscal_status='authorized'`;
- disponibiliza `DANFE`;
- libera a saída para entrega.

Não será ativada emissão fiscal automática nesta etapa. A automação poderá ser adicionada depois, reutilizando a mesma prontidão e o mesmo idempotency key.

### 5.1 Pagamento fiscal antes do recebimento real
Como o cliente paga na entrega, a forma marcada no checkout não pode ser tratada como confirmação do recebimento.

A implementação deve manter dois conceitos distintos:
- `payment_method` previsto: intenção informada no checkout;
- settlement/forma recebida: pagamento efetivamente confirmado na entrega.

O mapeamento fiscal da NF-e para operações pagas na entrega deve ser homologado com a configuração real do Bling e da SEFAZ antes de ativar emissão live. A implementação não deve adivinhar nem congelar a forma prevista como verdade financeira final.

Se a configuração fiscal homologada exigir informação de pagamento antes da entrega, o sistema usa uma política fiscal explícita e versionada para `payment_on_delivery`; não deve alterar essa política com base apenas no checkout.

Uma troca de forma no momento da entrega não deve, por si só, cancelar ou emitir outra NF-e automaticamente. O sistema registra a forma real recebida no financeiro/Bling e, se a configuração fiscal exigir correção documental, abre uma pendência de revisão fiscal em vez de executar correção automática sem regra homologada.

## 6. Saída para entrega
Depois da NF-e autorizada e do DANFE disponível, o sistema registra o momento em que a mercadoria efetivamente sai do estabelecimento.

A ação pode existir na tela de Expedição/Entregador como `SAIU PARA ENTREGA` ou ser registrada pela ação equivalente já usada operacionalmente.

O sistema grava um evento/horário de saída (`dispatch_started_at` ou equivalente canônico).

Esse marco serve para decidir o tratamento fiscal de uma entrega que falhar:
- antes da saída física, ainda pode existir hipótese de cancelamento da NF-e conforme regra/prazo aplicável;
- depois da saída física, a NF-e não é cancelada automaticamente e o fluxo passa a ser de insucesso/retorno.

## 7. Entrega e pagamento
A ação `ENTREGUE` só fica disponível quando:
- separação está concluída;
- NF-e está autorizada ou explicitamente classificada como `not_required` por regra fiscal válida;
- a saída para entrega foi registrada quando esse controle estiver ativo.

Ao clicar, abre apenas o diálogo compacto já definido:
- forma prevista;
- forma recebida;
- valor recebido = total final;
- `CONFIRMAR ENTREGA`.

A forma recebida é editável e pode ser diferente da forma prevista. Exemplos:
- previsto cartão → recebeu PIX;
- previsto PIX → recebeu dinheiro;
- previsto alimentação → recebeu crédito.

No sucesso, em uma operação idempotente:
1. grava o settlement real com a forma efetivamente recebida;
2. sincroniza o financeiro/Bling usando a forma real;
3. sincroniza controles fiscais de pagamento sem reemitir nota automaticamente;
4. grava `delivered_at` e status `delivered`;
5. sincroniza o fechamento `Atendido` no Bling;
6. fecha automaticamente o diálogo;
7. atualiza a lista e mostra a tag `ENTREGUE`.

Falha posterior do Bling não desfaz a entrega; gera atenção/retry.

## 8. Entrega não concluída / retorno
Uma NF-e autorizada não pode ser simplesmente apagada porque a entrega falhou.

### 8.1 Falha antes da saída física
Se a NF-e foi autorizada, mas a mercadoria ainda não saiu do estabelecimento:
- pedido não recebe `ENTREGUE`;
- o operador pode reprogramar ou cancelar o pedido;
- quando o caso exigir cancelamento da NF-e, isso só pode ocorrer mediante ação fiscal explícita e se as condições/prazos legais ainda permitirem;
- nunca cancelar automaticamente apenas porque a entrega foi desmarcada.

### 8.2 Falha depois da saída física
Se a mercadoria já saiu e não foi entregue:
- pedido não recebe `ENTREGUE`;
- nenhum pagamento é presumido;
- registra `ENTREGA NÃO CONCLUÍDA` com motivo;
- abre ocorrência de retorno;
- preserva NF-e, XML, DANFE e histórico fiscal;
- quando disponível na integração, registra o evento fiscal `Insucesso na Entrega da NF-e` (tpEvento 110192) de forma idempotente;
- mercadoria devolvida ao estabelecimento entra no fluxo de retorno/revisão fiscal;
- nenhuma rotina automática cancela a NF-e depois da circulação.

Motivos mínimos:
- cliente ausente/não localizado;
- cliente recusou;
- endereço incorreto/inacessível;
- problema operacional/veículo;
- outro, com observação.

### 8.3 Nova tentativa de entrega
Uma nova tentativa não deve criar automaticamente outra venda ou outra NF-e.

O pedido fica em retorno/revisão até o operador escolher uma ação válida:
- reprogramar entrega mantendo a operação quando fiscalmente permitido;
- regularizar retorno/devolução e encerrar;
- outro tratamento fiscal homologado.

Qualquer cancelamento de evento de insucesso, nota de entrada/devolução ou outro documento fiscal deve ser tratado por regra explícita e homologada; não será inferido automaticamente pela interface.

## 9. Pedido aberto simplificado
O pedido aberto deve mostrar somente o necessário para operar:

### Cabeçalho
- número do pedido;
- data;
- cliente;
- total final;
- tags grandes de status.

### Cliente e entrega
- nome;
- telefone;
- endereço/referência;
- pagamento previsto;
- edição enquanto permitido pelo estágio.

### Itens
- uma linha/card por produto;
- itens `FALTOU` destacados;
- total original, abatimento e total final quando houver falta.

### Atendimento
- `VITRINE CLIENTE`;
- `ABRIR VITRINE`.

### Operação
- ação contextual de separação, emissão, saída ou entrega;
- cancelamento/reabertura somente quando permitido;
- `ENTREGA NÃO CONCLUÍDA` disponível quando houver saída registrada e a entrega falhar.

### Fiscal
Aparece a partir de `SEPARADO`, não só depois de `ENTREGUE`:
- status da NF-e;
- `EMITIR NF-e` quando pronto;
- erro objetivo quando bloqueado/rejeitado;
- DANFE após autorização;
- revisão fiscal quando houver retorno/insucesso.

Diagnósticos técnicos extensos de Bling não aparecem no fluxo normal.

## 10. Máquina de estados operacional
### Recebido
- pode confirmar;
- não pode separar;
- não pode emitir NF-e;
- não pode entregar.

### Confirmado
- estoque reservado;
- sincronização Bling iniciada/concluída;
- pode iniciar separação;
- não pode emitir NF-e;
- não pode entregar.

### Separado
- total final fechado;
- faltas persistidas;
- estoque aplicado;
- pode emitir NF-e;
- não pode sair para entrega enquanto NF-e não estiver autorizada.

### NF-e autorizada
- DANFE disponível;
- pode registrar saída para entrega;
- pagamento ainda pode estar pendente.

### Em entrega
- mercadoria já saiu fisicamente;
- NF-e original fica preservada;
- pode confirmar entrega + pagamento;
- pode registrar entrega não concluída/retorno.

### Entregue
- pagamento real confirmado;
- fechamento operacional concluído;
- Bling deve ficar como Atendido ou em retry de fechamento.

### Entrega não concluída
- pagamento não é confirmado automaticamente;
- NF-e fica preservada;
- pedido entra em retorno/revisão operacional e fiscal.

## 11. Compatibilidade técnica
Estados internos atuais podem permanecer enquanto consumidores antigos existirem, mas precisam ter uma única tradução:
- `storefront_received` → RECEBIDO;
- `confirmed`/`processing` → CONFIRMADO;
- `ready` → SEPARADO;
- `out_for_delivery` → EM ENTREGA quando representar saída física real;
- `delivered` → ENTREGUE.

A autorização fiscal será um marco em `order_fiscal_controls`, não um novo `orders.status` obrigatório.

Isso evita migrar todo o enum de pedidos somente para representar NF-e.

## 12. Alterações necessárias no backend
Revisar e alinhar as seguintes regras:

- `refresh_order_fiscal_readiness_v1`: prontidão fiscal passa a depender de separação concluída, não de entrega/pagamento;
- `preview_bling_invoice_eligibility_v1`: elegibilidade passa a aceitar pedido Separado fiscalmente pronto;
- `ops2_fiscal_dispatch_preflight_v1`: deve refletir o novo conceito de prontidão;
- `check_order_dispatch_fiscal_gate_v1`: continua protegendo saída quando configurado para `enforce`;
- `ops3_complete_delivery_v1`: deve validar autorização fiscal antes de concluir `delivered`, além de pagamento;
- consolidar `out_for_delivery` como o evento técnico de saída física, sem voltar a expor uma segunda gestão paralela;
- criar/usar operação canônica de `delivery_failed`/retorno que não marque `delivered` e não presuma pagamento;
- integração do evento `Insucesso na Entrega` deve ser idempotente e só ser ativada depois de homologação;
- triggers fiscais legados devem ser consolidados para não haver dois gates contraditórios;
- emissão deve usar idempotency key por pedido + versão fiscal;
- checkout `payment_method` e settlement real devem permanecer semanticamente separados.

O `fiscal_runtime_config` atualmente está com emissão desativada (`enabled=false`, `execution_mode='off'`, `bling_invoice_prepare_enabled=false`). A implementação deve primeiro validar emissão em modo controlado/homologação/canário e só depois habilitar o fluxo de produção. Não alterar esse runtime cegamente.

## 13. Alterações de UX
- tags do card maiores e com cores distintas;
- bottom sheet fecha automaticamente após conclusão real da separação;
- diálogo de entrega fecha automaticamente após conclusão real;
- enquanto a NF-e estiver pendente, a UI mostra claramente `EMITIR NF-e` em vez de um botão `ENTREGUE` que vai falhar;
- após autorização, a saída para entrega fica disponível;
- no diálogo de entrega, forma recebida pode ser diferente da prevista;
- quando a entrega falhar, ação simples `ENTREGA NÃO CONCLUÍDA` com motivo;
- erros mostram ação prática, não mensagens técnicas do backend.

## 14. Testes obrigatórios
1. confirmar pedido reserva estoque e sincroniza Bling sem emitir NF-e;
2. concluir separação fecha o bottom sheet e atualiza tag/total;
3. retry da separação não duplica abatimento ou estoque;
4. pedido Separado fica fiscalmente elegível sem estar entregue/pago;
5. emissão repetida não cria NF-e duplicada;
6. saída é bloqueada sem NF-e autorizada quando gate está em enforce;
7. saída física fica registrada antes da confirmação final da entrega;
8. entrega autorizada registra pagamento real e fecha diálogo;
9. troca da forma prevista para outra forma recebida grava o settlement correto sem duplicar/reemitir NF-e automaticamente;
10. falha de entrega após saída não marca `delivered` nem pagamento confirmado;
11. falha pós-saída preserva NF-e e abre retorno/revisão;
12. evento de insucesso, quando habilitado, é idempotente;
13. falha de fechamento Bling pós-entrega não desfaz pagamento/entrega;
14. pedido com item FALTOU emite pelo total final correto;
15. DANFE só aparece após autorização fiscal;
16. pedidos legados continuam abrindo sem erro;
17. fluxos de cestas, checkout, WhatsApp e atendimento continuam passando na CI.

## 15. Implantação segura
A mudança será feita por branch/PR pequeno e em etapas:

1. contratos de regressão para a nova ordem;
2. prontidão fiscal pós-separação;
3. UI fiscal e tags;
4. gate de saída para entrega;
5. diálogo de entrega com forma recebida independente da prevista;
6. fluxo de insucesso/retorno;
7. emissão controlada no Bling/SEFAZ;
8. teste ponta a ponta com um pedido controlado;
9. somente então habilitar o runtime fiscal em produção.

Não usar pedidos reais de clientes para o primeiro disparo fiscal.

## Critérios de aceite
- Funcionário entende o estado do pedido apenas olhando o card.
- Concluir separação fecha a aba e mostra `SEPARADO` imediatamente.
- NF-e aparece como próxima ação natural depois da separação.
- Nenhuma mercadoria sai sem NF-e autorizada quando exigida.
- Nenhum pedido pode ser marcado como entregue sem pagamento real confirmado.
- Forma de pagamento recebida pode ser diferente da prevista sem quebrar o fluxo.
- Entrega frustrada depois da saída não cancela NF-e nem confirma pagamento automaticamente.
- Fiscal não depende mais de `delivered` para ficar pronto.
- DANFE acompanha a mercadoria somente depois da autorização.
- Nenhum clique repetido duplica estoque, abatimento, pagamento, evento fiscal ou NF-e.
- Não existe segunda lógica operacional paralela escondida no código/UI.
