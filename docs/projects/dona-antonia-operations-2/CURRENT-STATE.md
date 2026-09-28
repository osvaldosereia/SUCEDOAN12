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
- Backend/integrações: `admin-service-intelligence-v1` v197 ACTIVE.
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
