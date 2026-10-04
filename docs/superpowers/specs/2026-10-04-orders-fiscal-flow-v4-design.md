# Pedidos V4 — Fiscal antes da saída e operação simplificada

## Objetivo
Corrigir a etapa pós-separação do Pedidos V3 para que o fluxo operacional, fiscal e de entrega tenha uma única ordem coerente, simples para os funcionários e compatível com a exigência de autorização da NF-e antes da circulação da mercadoria.

Fluxo-alvo:

**RECEBIDO → CONFIRMADO → SEPARAÇÃO → SEPARADO → NF-e AUTORIZADA → ENTREGA + PAGAMENTO → ENTREGUE**

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
- Falha de integração externa não pode repetir baixa de estoque, abatimento ou criar duas notas.
- A UI fecha automaticamente janelas apenas após sucesso real; em erro, permanece aberta com mensagem objetiva.

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
- `CANCELADO`: vermelho.

As tags são marcos persistidos, não apenas decoração de botão.

O card continua simples: código, data, cliente, total atual, tags e ações essenciais.

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
- libera a ação de entrega.

Não será ativada emissão fiscal automática nesta etapa. A automação poderá ser adicionada depois, reutilizando a mesma prontidão e o mesmo idempotency key.

## 6. Entrega e pagamento
A ação `ENTREGUE` só fica disponível quando:
- separação está concluída;
- NF-e está autorizada ou explicitamente classificada como `not_required` por regra fiscal válida.

Ao clicar, abre apenas o diálogo compacto já definido:
- forma prevista;
- forma recebida;
- valor recebido = total final;
- `CONFIRMAR ENTREGA`.

No sucesso, em uma operação idempotente:
1. grava o settlement real de pagamento;
2. sincroniza controles financeiros/fiscais de pagamento;
3. grava `delivered_at` e status `delivered`;
4. sincroniza o fechamento `Atendido` no Bling;
5. fecha automaticamente o diálogo;
6. atualiza a lista e mostra a tag `ENTREGUE`.

Falha posterior do Bling não desfaz a entrega; gera atenção/retry.

## 7. Falha de entrega após NF-e autorizada
Uma NF-e autorizada não pode ser simplesmente apagada porque a entrega falhou.

Se o entregador não conseguir concluir a entrega:
- pedido não recebe `ENTREGUE`;
- abre ocorrência de retorno;
- mantém a NF-e e o histórico fiscal intactos;
- encaminha para revisão da operação fiscal/retorno conforme o caso real;
- nenhuma rotina automática cancela NF-e sem regra fiscal explícita.

## 8. Pedido aberto simplificado
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
- ação contextual de separação ou entrega;
- cancelamento/reabertura somente quando permitido.

### Fiscal
Aparece a partir de `SEPARADO`, não só depois de `ENTREGUE`:
- status da NF-e;
- `EMITIR NF-e` quando pronto;
- erro objetivo quando bloqueado/rejeitado;
- DANFE após autorização.

Diagnósticos técnicos extensos de Bling não aparecem no fluxo normal.

## 9. Máquina de estados operacional
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
- não pode entregar enquanto NF-e não estiver autorizada.

### NF-e autorizada
- DANFE disponível;
- pode iniciar/confirmar entrega;
- pagamento ainda pode estar pendente.

### Entregue
- pagamento confirmado;
- fechamento operacional concluído;
- Bling deve ficar como Atendido ou em retry de fechamento.

## 10. Compatibilidade técnica
Estados internos atuais podem permanecer enquanto consumidores antigos existirem, mas precisam ter uma única tradução:
- `storefront_received` → RECEBIDO;
- `confirmed`/`processing` → CONFIRMADO;
- `ready` → SEPARADO;
- `out_for_delivery` legado → SEPARADO/EM ENTREGA apenas para histórico;
- `delivered` → ENTREGUE.

A autorização fiscal será um marco em `order_fiscal_controls`, não um novo `orders.status` obrigatório.

Isso evita migrar todo o enum de pedidos somente para representar NF-e.

## 11. Alterações necessárias no backend
Revisar e alinhar as seguintes regras:

- `refresh_order_fiscal_readiness_v1`: prontidão fiscal passa a depender de separação concluída, não de entrega/pagamento;
- `preview_bling_invoice_eligibility_v1`: elegibilidade passa a aceitar pedido Separado fiscalmente pronto;
- `ops2_fiscal_dispatch_preflight_v1`: deve refletir o novo conceito de prontidão;
- `check_order_dispatch_fiscal_gate_v1`: continua protegendo saída quando configurado para `enforce`;
- `ops3_complete_delivery_v1`: deve validar autorização fiscal antes de concluir `delivered`, além de pagamento;
- triggers fiscais legados devem ser consolidados para não haver dois gates contraditórios;
- emissão deve usar idempotency key por pedido + versão fiscal.

O `fiscal_runtime_config` atualmente está com emissão desativada (`enabled=false`, `execution_mode='off'`, `bling_invoice_prepare_enabled=false`). A implementação deve primeiro validar emissão em modo controlado/homologação/canário e só depois habilitar o fluxo de produção. Não alterar esse runtime cegamente.

## 12. Alterações de UX
- tags do card maiores e com cores distintas;
- bottom sheet fecha automaticamente após conclusão real da separação;
- diálogo de entrega fecha automaticamente após conclusão real;
- enquanto a NF-e estiver pendente, a UI mostra claramente `EMITIR NF-e` em vez de um botão `ENTREGUE` que vai falhar;
- após autorização, `ENTREGUE` fica visível/habilitado;
- erros mostram ação prática, não mensagens técnicas do backend.

## 13. Testes obrigatórios
1. confirmar pedido reserva estoque e sincroniza Bling sem emitir NF-e;
2. concluir separação fecha o bottom sheet e atualiza tag/total;
3. retry da separação não duplica abatimento ou estoque;
4. pedido Separado fica fiscalmente elegível sem estar entregue/pago;
5. emissão repetida não cria NF-e duplicada;
6. entrega é bloqueada sem NF-e autorizada quando gate está em enforce;
7. entrega autorizada registra pagamento e fecha diálogo;
8. falha de fechamento Bling pós-entrega não desfaz pagamento/entrega;
9. pedido com item FALTOU emite pelo total final correto;
10. DANFE só aparece após autorização fiscal;
11. pedidos legados continuam abrindo sem erro;
12. fluxos de cestas, checkout, WhatsApp e atendimento continuam passando na CI.

## 14. Implantação segura
A mudança será feita por branch/PR pequeno e em etapas:

1. contratos de regressão para a nova ordem;
2. prontidão fiscal pós-separação;
3. UI fiscal e tags;
4. gate de entrega;
5. emissão controlada no Bling/SEFAZ;
6. teste ponta a ponta com um pedido controlado;
7. somente então habilitar o runtime fiscal em produção.

Não usar pedidos reais de clientes para o primeiro disparo fiscal.

## Critérios de aceite
- Funcionário entende o estado do pedido apenas olhando o card.
- Concluir separação fecha a aba e mostra `SEPARADO` imediatamente.
- NF-e aparece como próxima ação natural depois da separação.
- Nenhum pedido pode ser marcado como entregue sem pagamento e autorização fiscal quando exigida.
- Fiscal não depende mais de `delivered` para ficar pronto.
- DANFE acompanha a mercadoria somente depois da autorização.
- Nenhum clique repetido duplica estoque, abatimento, pagamento ou NF-e.
- Não existe segunda lógica operacional paralela escondida no código/UI.
