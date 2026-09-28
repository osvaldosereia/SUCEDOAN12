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
