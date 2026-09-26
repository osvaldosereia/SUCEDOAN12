# Operations 2.0 — R10 · Hardening técnico

Data: 2026-09-26
Status: hardening seguro aplicado no Supabase canônico.

## Performance
O advisor apontava 7 foreign keys sem índice de cobertura. Foram criados índices para:
- ops_inventory_incidents(source_order_id)
- ops_order_check_items(product_id)
- ops_stock_reconciliation_reviews(count_id)
- ops_stock_reconciliation_reviews(product_id)
- papoai_draft_events_v2(draft_id)
- papoai_order_drafts_v2(canonical_order_id), parcial quando não nulo
- papoai_order_drafts_v2(customer_id), parcial quando não nulo

Após aplicação, o advisor não reporta mais unindexed_foreign_keys.

Não foram removidos índices classificados como unused. Índice recém-criado começa com idx_scan=0 e o projeto ainda está em homologação; remover agora seria otimização prematura.

## Triggers
Auditoria encontrou duplicação concreta de set_updated_at em:
- basket_templates
- carts
- orders
- products
- customers
- whatsapp_accounts

Os pares chamavam exatamente a mesma função set_updated_at no mesmo UPDATE. Migration ops2_r10_remove_duplicate_updated_at_triggers_v1 removeu apenas o trigger redundante trg_*_updated_at, preservando set_*_updated_at.

Validação pós-migration: todas as tabelas auditadas ficaram com exatamente 1 trigger set_updated_at.

Triggers críticos de negócio foram preservados:
- pagamento antes de delivered;
- fiscal antes de dispatch;
- conferência antes de ready;
- sincronização de rota;
- reserva de estoque;
- snapshots de ajuste oculto.

## Jobs / custos
pg_cron observado:
- dispatch_bling_hub_cycle_v2: INATIVO;
- run_fiscal_ai_worker_tick_v1: INATIVO;
- dispatch_purchase_xml_daily_v1: ATIVO, diário às 10:00 UTC.

Não foi criado polling novo. Não foi reativado worker antigo. O único cron ativo está ligado ao módulo XML R7.

## Edge Functions
A auditoria confirmou muitas Edge Functions históricas ainda implantadas, incluindo whatsapp-ingest-make-v1 e módulos antigos de IA/marketing/conversation workers.
Não foram deletadas cegamente na R10: presença implantada não prova tráfego/dependência zero. A regra é remover somente com evidência de não uso e mapa de chamadas, para não derrubar produção.
Make continua proibido na arquitetura nova; nenhuma R7–R10 depende dele.

## Segurança
Advisor continua reportando RLS enabled/no policy em tabelas internas. Este padrão mantém acesso direto anon/authenticated fechado e o runtime usa camada server-side/service-role.
Não foram criadas policies permissivas apenas para silenciar lint.
Proteção de senha vazada permanece ação de configuração humana pós-R12.

## Reprodutibilidade
Migrations aplicadas:
- ops2_r10_covering_fk_indexes_v1
- ops2_r10_remove_duplicate_updated_at_triggers_v1

## Ações humanas acumuladas — pós-R12
- Habilitar proteção contra senhas vazadas no Auth, após revisão de impacto.
- Validar fisicamente os testes acumulados R6–R9.
- Só remover Edge Functions históricas após inventário de chamadas/logs e confirmação de ausência de dependências externas.

## Gate R10
PASS:
- 7/7 foreign keys críticas cobertas;
- duplicação set_updated_at removida;
- gates críticos preservados;
- workers antigos continuam desligados;
- nenhum polling/custo recorrente novo;
- nenhuma abertura de RLS.

## Próximo passo
R11: ensaio integrado amplo site -> checkout -> pedido -> Bling -> EAN -> fiscal -> estoque -> expedição -> rota -> entregador -> pagamento -> entrega/retorno, corrigindo somente gaps seguros e registrando evidências.
