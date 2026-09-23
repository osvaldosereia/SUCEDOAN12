# Vitrine/Admin + Bling Hub V2 — Estado atual

Atualizado em 2026-09-23.

## Runtime seguro
No Supabase canônico `ssbesxgaijknwsjbsbcz`:
- mode = `observe`
- hub_enabled = `false`
- legacy_queues_frozen = `true`
- products_enabled = false
- stock_enabled = false
- customers_enabled = false
- orders_enabled = false
- webhooks_enabled = false
- fiscal_enabled = false

O cron `bling-hub-v2-cycle` existe a cada 2 minutos, mas `dispatch_bling_hub_cycle_v2()` retorna NULL enquanto o Hub estiver OFF.

## Make
Make permanece intacto e preservado. Não faz parte do novo runtime direto.

## Produtos
- Reconciliação read-only concluída: 1667 matched, 3 not_found.
- Writer PUT idempotente, com preservação dos campos não administrados.
- Canário real de 1 produto concluído e verificado.
- Criação automática de produto não vinculado continua bloqueada.

## Estoque
- Snapshot absoluto de estoque enfileirado por balanço/separação/cancelamento.
- Worker com depósito resolvido, rate limit compartilhado e verificação pós-write.
- Domínio permanece OFF fora de homologação.

## Clientes
- 486 clientes canônicos.
- 269 com `bling_contact_id` registrados como matched.
- 217 sem documento e sem vínculo ficaram review_required; não há matching por nome/telefone.
- Writer atualiza somente contato já vinculado.
- Campos desconhecidos no cadastro local são preservados no Bling.
- Canário real de cliente concluído e verificado depois da normalização do telefone brasileiro.

## Pedidos
- Pedido só é elegível para escrita depois da primeira separação.
- Cestas são desmembradas em componentes.
- Preços dos componentes são congelados no snapshot; fallback seguro para preço atual do catálogo no momento da separação.
- Diferença comercial vira outras despesas ou desconto para manter o total exato.
- Cliente é resolvido antes de enfileirar.
- Worker busca por `numeroLoja` antes de POST para prevenir duplicação.
- Criação ambígua não recebe retry cego; reconcilia por chave externa.
- Verificação pós-write obrigatória.
- Dois previews reais passaram (cesta pura e pedido misto), sem escrita externa.
- Nenhum job de pedido existe neste checkpoint e domínio Pedidos permanece OFF.
- O próximo canário de pedido deve usar um pedido real somente quando a separação efetivamente começar.

## Webhooks
Migration: `20260923153000_bling_hub_v2_webhook_inbox.sql`.

Implementado:
- endpoint: `admin-service-intelligence-v1?source=bling-webhook-v2`
- assinatura `X-Bling-Signature-256` HMAC-SHA256 sobre o raw body com o client secret do Bling
- inbox idempotente por `event_id`
- eventos fora de ordem tratados por processamento assíncrono
- detecção de possível evento gerado pelo próprio Hub
- nenhuma mutação de produto/estoque/pedido no processamento inicial; mudança externa vira revisão

Teste real controlado:
- assinatura inválida → 401
- assinatura válida → 200 e status held porque Webhooks está OFF
- mesmo eventId repetido → 200 duplicate
- evento falso removido após o teste

Ainda depende de ação humana no painel do aplicativo Bling para cadastrar/ativar a URL de webhook. Não ativar antes de revisão final dos recursos desejados.

## Fiscal / NF-e
Contrato existente mantido:
- NF-e somente após entrega + pagamento confirmado + valor reconciliado.
- `fiscal_runtime_config.enabled=false`
- execution_mode=`off`
- prepare=false
- send=false
- canary=0
- 0 fiscal jobs
- 0 external side effects

O painel Bling mostra readiness fiscal, mas nenhuma emissão/preparação foi ativada.

## Admin
`vitrine/admin/index.html`:
- aba Bling
- Make explicitamente mostrado como preservado
- cards Produtos / Clientes / Pedidos / Webhooks / Fiscal
- prévia Bling dentro de cada pedido
- sem botão manual “Enviar ao Bling”
- prévia separa “dados prontos” de “escrita elegível”

## CI
Teste principal:
`scripts/test-vitrine-bling-hub-v2.mjs`

Workflow:
`.github/workflows/comprar-root-home.yml`

Cobertura:
- UI sem botão de envio manual
- snapshot de cestas
- ordem de resolução do cliente
- gate de primeira separação
- idempotência do pedido
- canary gate
- cron fail-closed
- assinatura/inbox de webhook
- readiness fiscal sem emissão

## Próximos passos seguros
1. Confirmar CI/Pages verde do HEAD.
2. Configurar webhook no painel Bling quando for conveniente, mantendo processing OFF inicialmente.
3. Fazer o primeiro canário de Pedido apenas em uma separação real.
4. Depois do canário de pedido, habilitar Pedidos gradualmente.
5. Fiscal: somente após fluxo operacional de entrega/pagamento estar realmente em uso; primeiro preview, depois canário manual.
6. Só então inventariar objetos legados para limpeza Supabase.
7. Make só será removido se o usuário pedir explicitamente no futuro.
