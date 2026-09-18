# Checkpoint — Histórico de Compras — Etapas 8 a 11

Data: 17/09/2026

## Etapa 8 — Histórico antigo do Bling

Status: **EM BACKFILL CONTROLADO**

Arquitetura atual:

- Supabase é a fonte de verdade.
- Credenciais Bling foram migradas para o Vault.
- Importação é idempotente por `bling_order_id`.
- Pedidos passam por staging e reconciliação antes de entrar em `orders + order_items`.
- `bling_contact_id` é a chave prioritária de cliente.
- CPF/telefone só são usados como fallback controlado.
- Cliente genérico sem identidade não recebe histórico de outra pessoa.
- Situações do Bling são mapeadas para estados canônicos.
- Promoção global permanece desativada; apenas lotes verificados são promovidos.
- Backfill por cliente está agendado no Supabase Cron.

Situação observada neste checkpoint:

- clientes com `bling_contact_id`: 269;
- processados pelo backfill: 122;
- pendentes: 147;
- erros na fila: 0;
- pedidos Bling já promovidos ao histórico canônico: 27;
- pedidos genéricos ignorados com segurança: 72.

## Etapa 9 — Segmentação comercial

Status: **CONCLUÍDA**

Segmentos derivados já disponíveis no Admin e no Comprar:

- primeiro comprador;
- recorrente;
- mensal;
- inativo;
- alto valor;
- comprador de cesta;
- cesta favorita;
- demais segmentos previstos quando os dados existirem.

As regras são determinísticas e derivadas do histórico real.

## Etapa 10 — Métricas

Status: **CONCLUÍDA**

Foram criadas métricas para:

- cobertura do histórico;
- histórico recuperado pelo Bling;
- uso e conversão da recompra;
- compras frequentes;
- ofertas personalizadas;
- tempo de checkout;
- ticket da recompra;
- indisponibilidades/ajustes;
- série diária.

No momento deste checkpoint:

- clientes totais: 504;
- clientes com histórico: 30;
- cobertura atual: 5,95%;
- pedidos válidos: 44;
- pedidos históricos importados do Bling: 27;
- clientes recuperados pelo Bling: 21.

A cobertura deve crescer automaticamente conforme o backfill terminar.

## Etapa 11 — Robustez, privacidade e manutenção

Status: **CONCLUÍDA**

Migration:

`supabase/migrations/20260918040500_purchase_history_hardening_v1.sql`

Criados:

- `purchase_history_integrity_v1`;
- `get_purchase_history_integrity_v1()`;
- `rebuild_customer_purchase_profiles_batch_v1(...)`;
- `reconcile_nonpromoted_bling_history_batch_v1(...)`;
- índices para histórico, eventos, rankings e staging.

A auditoria atual confirmou:

- itens órfãos: 0;
- duplicidade de `bling_order_id`: 0;
- pedidos importados sem cliente: 0;
- pedidos importados sem ID Bling: 0;
- divergências nos resumos dos clientes: 0;
- staging promovido sem pedido local: 0;
- vínculo staging ↔ pedido divergente: 0;
- questões bloqueantes de reconciliação: 0;
- grupos duplicados por telefone: 0;
- grupos duplicados por CPF/CNPJ: 0.

Existe 1 pedido local antigo sem `customer_id`, já identificado na Etapa 0 e mantido sem associação automática.

## CI / qualidade

Foi corrigido um teste antigo que exigia uma versão fixa de `products.js`.

Também foram removidas quebras de linha literais do `comprar/index.html`.

Novo teste:

`scripts/test-purchase-history-hardening-v1.mjs`

O workflow principal passou a incluir o hardening do histórico.

## Estado do projeto

A parte funcional do projeto de histórico está pronta.

A única etapa ainda em execução é o enriquecimento gradual do histórico antigo do Bling. Ele já está automatizado no Supabase e não depende de Make.

Após o backfill chegar a zero pendentes, executar auditoria final de integridade e registrar o fechamento definitivo da Etapa 8.

## Finalização automática do backfill

Foi adicionada `finalize_bling_history_backfill_v1()`.

Quando a fila chegar a zero pendentes/erros/em execução/pausados, o próprio Supabase:

- recalcula os perfis de compra de todos os clientes;
- gera uma auditoria final de integridade;
- salva o snapshot em `purchase_history_integrity_snapshots`;
- desliga `enabled`, `fetch_enabled` e `promotion_enabled` do importador;
- remove o Cron do backfill.

Teste de segurança executado enquanto a fila ainda estava em andamento: a função recusou finalizar e retornou `backfill_not_finished`, sem desligar a automação.
