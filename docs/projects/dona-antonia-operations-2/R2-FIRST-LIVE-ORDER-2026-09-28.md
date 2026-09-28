# Operations 2.0 — R2 Primeiro Pedido Real / Gate de Separação

Data: 2026-09-28

## Escopo

Continuação direta da R1 LIVE, sem reprocessar histórico pré-corte.

Pedido-canário real pós-corte:
- pedido canônico: `DA-260928-D6432EB3`;
- total: R$ 175,19;
- forma prevista: cartão de crédito na entrega;
- Bling order id: `26983249693`.

## O que aconteceu no primeiro ciclo real

1. pedido nasceu em `storefront_received`;
2. operador confirmou o pedido;
3. lista de picking 85 mm foi enfileirada e apresentada;
4. a primeira chamada de estado Bling encontrou o pedido remoto em `Em aberto` (status 6);
5. não existia transição direta `Em aberto -> Aprovado / Separar`;
6. a tentativa protegida falhou corretamente com `required_transition_missing`;
7. o retry genérico antigo sincronizou conteúdo, mas não constituía prova suficiente do estado remoto alvo.

Esse comportamento foi detectado antes da conferência EAN e corrigido em produção.

## Correções R2

### 1. Bridge seguro de situação no Bling

O Hub agora aceita, especificamente para o alvo `approved_separation`, a ponte sem ações colaterais:

`Em aberto (6) -> Aguardando confirmação (915901) -> Aprovado / Separar (915902)`

Regras:
- somente transições ativas;
- nenhuma transição do bridge pode possuir ações automáticas;
- cada passo é verificado novamente no Bling antes de seguir;
- qualquer mudança inesperada fecha com erro e não continua.

Deploy:
- `admin-service-intelligence-v1` v197 nessa correção;
- commit principal: `c1415ec2`.

### 2. Retry de confirmação com alvo explícito

Falha transitória depois da confirmação não entra mais como simples `sync_order`.

Agora:
- operação = `sync_order_status`;
- `target_key=approved_separation`;
- worker reutiliza `ops2_ensure_order_state`;
- só considera recuperado quando o alvo protegido for realmente assegurado.

Admin:
- `admin-products-live-v1` v52 na etapa;
- commit: `62624442`.

### 3. Recuperação automática EAN -> Verificado

Se a conferência EAN termina localmente mas o Bling falha ao mudar para `Verificado`:
- pedido fica `review_bling`;
- abre atenção operacional;
- recuperação automática roda junto ao ciclo existente de 2 minutos;
- somente pedidos pós-corte, `ready`, com sessão EAN realmente `verified`, são elegíveis.

Não foi criado cron adicional.

SQL versionado:
- `supabase/sql/20260928_ops2_ean_verified_recovery_v1.sql`;
- commit: `396c6216`.

### 4. Gate forte antes da separação

No modo `ops2_stock_authority=bling`:
- `confirmed -> processing` só pode ocorrer depois de comprovar `Aprovado / Separar` no Bling;
- `order_consume_stock` também comprova o estado remoto antes de consumir a reserva local de concorrência;
- falha retorna `bling_approval_required_before_separation`;
- nenhuma baixa física local é executada.

Deploy final de separação:
- `admin-products-live-v1` v53;
- commit: `357a0f17`.

## Reparação do pedido-canário

Foi criado um job corretivo explícito:
- id: `2f04f5ab-23ba-4712-944e-4f1569c0deaf`;
- operação: `sync_order_status`;
- alvo: `approved_separation`.

Resultado:
- status do job: `synced`;
- attempts: 1;
- external_write: true;
- mesmo Bling order id `26983249693`;
- sem duplicação de pedido.

Prova final do Hub:
- `ops2_target_key=approved_separation`;
- `ops2_target_status_id=915902`;
- `status_changed=true`;
- estoque virtual pré-transição: 30 linhas verificadas, 0 faltas;
- pós-transição: 30 linhas verificadas, 0 saldos negativos.

## Estado operacional atual do canário

Canônico:
- `status=confirmed`;
- `sync_status=sent_to_bling`;
- Bling vinculado e verificado;
- lista de separação já apresentada;
- nenhuma sessão de conferência EAN iniciada ainda.

Portanto o sistema está parado no ponto correto antes da ação física.

## Próximo passo humano

No Vitrine/Admin:
1. iniciar a separação do pedido `DA-260928-D6432EB3`;
2. iniciar a conferência;
3. ler os EANs reais dos produtos;
4. concluir somente quando todas as quantidades estiverem exatas.

O sistema deverá então:
- marcar localmente `ready`;
- assegurar `Verificado` no Bling;
- bloquear qualquer divergência;
- manter expedição fechada até o gate fiscal correspondente.

## Advisors

Nenhum bloqueador novo introduzido pela R2.

Continuam avisos preexistentes:
- RLS habilitado sem policies em tabelas server-only;
- leaked password protection desativada;
- FK sem índice em `ops2_bling_orphan_product_reviews`;
- índices ainda não utilizados.

Tratar em hardening separado, sem misturar com o canário operacional.


## 5. Gate fiscal pós-EAN

A revisão pós-canário encontrou um atalho potencial:
- o pedido local passa a `ready` antes da confirmação final da mudança remota para `Verificado`;
- a expedição física já exigia `Verificado` no Bling, mas a prévia fiscal não validava explicitamente o alvo Ops2 do link.

Correção:
- para pedidos pós-corte, `fiscal_dispatch_preview` agora exige:
  - `ops2_target_key=verified`;
  - `ops2_target_status_id` igual ao status `Verificado` configurado no runtime;
- se não cumprir, retorna blocker `bling_order_not_verified`;
- histórico pré-corte não é afetado.

Deploy:
- `admin-service-intelligence-v1` v198;
- commit: `30a90ccb`.

## Smoke/observabilidade após R2

Logs recentes:
- ciclo do Hub: HTTP 200;
- recuperação EAN: HTTP 200 em ciclos sucessivos;
- webhooks Bling do pedido-canário: HTTP 200;
- único 409 observado foi a primeira tentativa real que revelou a ausência do bridge de status, antes da correção.

Estado final seguro:
`confirmed + Bling Aprovado/Separar -> ação física humana -> processing -> EAN -> ready + Bling Verificado -> emissão fiscal humana -> baixa física/expedição -> pagamento real -> delivered`.


## 6. Fechamento programável da R2 — fiscal, pagamento e entrega

A continuação da R2 fechou os elos que podiam ser programados sem forçar a operação humana do canário.

### 6.1 Reconciliação fiscal passiva

O ciclo normal do Hub passou a verificar pedidos pós-corte em `ready` e procurar, por `numeroLoja`, NF-e já existente no Bling.

Quando encontra uma NF-e já autorizada:
- não gera nova NF-e;
- não reenvia à SEFAZ;
- marca localmente o gate de expedição como autorizado;
- atualiza `dispatch_fiscal_jobs`;
- registra auditoria `dispatch_nfe_authorized_passive_reconcile`.

Isso cobre inclusive emissão/autorização manual feita diretamente no Bling.

Commit:
- `6e3a3b5f` — `ops2: passively reconcile authorized NF-e for dispatch`.

Hub:
- `admin-service-intelligence-v1` v200 nessa etapa.

### 6.2 Pagamento real/split -> plano Bling shadow

`ops_record_delivery_payment_v1` agora prepara automaticamente o plano financeiro shadow após captura de pagamento real.

Regras:
- valor das partes continua obrigado a fechar exatamente o total do pedido;
- repetição idempotente reutiliza o settlement;
- split é preservado por partes;
- mapeamentos Bling continuam em shadow;
- nenhuma baixa financeira externa acontece sem homologação.

SQL:
- `supabase/sql/20260928_ops2_delivery_payment_shadow_prepare_v1.sql`.

Commit:
- `14b6814e`.

### 6.3 Settlement do entregador vira fonte fiscal do pagamento

Criado sincronismo local automático:
- settlement `source=delivery`;
- total exato -> `order_fiscal_controls.payment_status=confirmed`;
- forma única preserva o método;
- múltiplas formas -> `payment_method=split`;
- `settled_amount` vem do settlement real;
- `payment_source=delivery_settlement`;
- após a entrega, o readiness fiscal é recalculado automaticamente.

Não existe efeito externo no Bling nesta etapa.

SQL:
- `supabase/sql/20260928_ops2_delivery_payment_fiscal_sync_v1.sql`.

Commit:
- `388703e3`.

### 6.4 Entrega concluída -> Atendido no Bling

Foi fechado o último estado operacional da R2.

Após `delivered`, o sistema só tenta mudar o pedido remoto de `Verificado (24)` para `Atendido (9)` quando comprova:
- pedido local realmente entregue;
- settlement real da entrega com total exato;
- autorização fiscal válida;
- baixa física Bling já em estado `launched`;
- vínculo do mesmo pedido Bling;
- transição `24 -> 9` ativa e sem ações automáticas.

Se o Bling falhar:
- a entrega local não é revertida;
- nenhuma baixa de estoque é repetida;
- `sync_status=review_bling`;
- abre atenção operacional;
- o ciclo normal de 2 minutos tenta recuperar depois.

A transição atual do Bling foi confirmada:
- origem: `Verificado (24)`;
- destino: `Atendido (9)`;
- `acoes=[]`.

Commits:
- Hub: `e00c53d4`;
- Admin: `18e115ad`.

Deploy final desta etapa:
- `admin-service-intelligence-v1` v201 ACTIVE;
- `admin-products-live-v1` v56 ACTIVE.

## 7. Estado da R2 agora

Parte autônoma/programável: **CONCLUÍDA**.

O pedido-canário real permanece deliberadamente em:
- local: `confirmed`;
- Bling: `Aprovado / Separar`;
- sem sessão EAN iniciada.

Próxima prova é física/humana e não deve ser simulada:

`processing -> bipagem EAN real -> ready/Verificado -> emitir NF-e -> autorização SEFAZ -> DANFE -> saída/baixa física -> pagamento real/split -> delivered -> Atendido`.

## 8. Advisors após as mudanças

Nenhum bloqueador novo da R2.

Permanecem avisos preexistentes:
- RLS habilitado sem policies em tabelas internas/server-only;
- leaked-password protection desativada;
- uma FK sem índice em `ops2_bling_orphan_product_reviews`;
- índices ainda não utilizados.

Esses itens ficam para hardening/cleanup e não devem ser misturados com o canário operacional.
