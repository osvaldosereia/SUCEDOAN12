# Operations 2.0 — R8 · PapoAI / WhatsApp operacional

Data: 2026-09-26
Status: programação segura concluída nesta rodada.

## Objetivo
Fechar observabilidade e integridade do elo PapoAI/WhatsApp -> identidade -> cliente -> draft estruturado -> pedido canônico, sem reintroduzir inteligência de atendimento no Admin e sem permitir que texto livre crie pedido automaticamente.

## Baseline observado
- papoai_webhook_runtime_v2.capture_enabled=true.
- 47 eventos capturados.
- 0 eventos com last_error.
- 0 eventos sem phone_candidate.
- 0 drafts persistidos.
- 0 pedidos ligados a drafts.
- 0 storefront_identity_tokens persistidos.
- last_seen_at confirmou tráfego recente durante a R8.

## Implementado no Supabase canônico
Migration ops2_r8_papoai_operational_readiness_v1:
- view interna ops2_papoai_operational_readiness_v1;
- correlaciona inbox com draft por conversation_ref/event_key;
- estados operacionais: technical_error, identity_missing, captured_no_draft, customer_missing, confirmed_without_order, order_linked, draft_active;
- função interna ops2_papoai_operational_summary_v1();
- resumo de captura, processamento, erros, identidade, drafts e vínculo de pedido;
- sem grants para public/anon/authenticated.

## Decisões/gates preservados
1. Texto livre não cria pedido automaticamente.
2. Pedido só converge ao motor canônico a partir de evento/draft estruturado e confirmação válida.
3. Telefone/identidade é dado operacional; não inferir vínculo de cliente por aproximação.
4. Duplicatas/retries devem convergir por event_key/message identity, nunca gerar segundo pedido.
5. Admin permanece ponte operacional/monitoramento; IA de atendimento não volta ao Admin.
6. PapoAI permanece canal oficial da conversa; sem Make.
7. Pedidos legados não são mutados.

## Evidência
Após migration:
- capture_enabled=true;
- events_total=47;
- events_processed=0;
- events_with_error=0;
- events_without_phone=0;
- drafts_total=0;
- orders_linked=0;
- identity_tokens_total=0.

Isso indica que captura está funcional, mas a etapa estruturada de adaptação/processamento ainda não está materializando drafts/tokens nesta camada. Não ativar criação automática de pedido para compensar essa lacuna.

## Ações humanas acumuladas — pós-R12
- Executar teste real controlado do Flow/cadastro com um contato de teste.
- Executar teste real do link personalizado catalogo_#### e confirmar reconhecimento no checkout.
- Executar conversa real com evento estruturado de pedido e confirmar draft -> confirmação -> pedido único.
- Validar no PapoAI/Meta quais eventos/campos estruturados estão efetivamente habilitados no ambiente produtivo.

## Gate R8
PASS para observabilidade/readiness e proteção arquitetural.
PENDENTE de homologação real do Flow/link/evento estruturado, acumulada para pós-R12.

## Próximo passo
R9: UX operacional das cinco superfícies — Central, Pedidos/Nova Venda WhatsApp, Tablet Separação, Estoque Mobile e Entregador — reduzindo cliques, padronizando estados/mensagens e preservando os gates backend.
