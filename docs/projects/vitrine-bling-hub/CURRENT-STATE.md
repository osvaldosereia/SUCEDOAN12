# Vitrine/Admin + Bling Hub V2 — Estado atual

Atualizado em 2026-09-23.

## Runtime atual
No Supabase canônico `ssbesxgaijknwsjbsbcz`:
- mode = `live`
- hub_enabled = `true`
- legacy_queues_frozen = `true`
- products_enabled = true
- stock_enabled = true
- customers_enabled = true
- orders_enabled = true, em rollout fail-closed
- webhooks_enabled = false
- fiscal_enabled = false

Produtos, estoque e clientes já passaram por canários reais verificados e estão ativos no Hub direto. Pedidos foi armado em 2026-09-23 para o primeiro canário automático: enquanto não existir nenhum pedido sincronizado, o worker limita a execução a 1 pedido elegível por vez. Somente pedidos gerados pela primeira separação e com estoque já tratado podem escrever. Falha não transitória ou divergência pós-write desliga `orders_enabled` automaticamente. Pedidos inválidos/não vinculados vão para revisão e não consomem o canário.

O cron `bling-hub-v2-cycle` continua a cada 2 minutos e processa somente domínios habilitados.

## Make
Make permanece intacto e preservado. Não faz parte do novo runtime direto.

## Produtos
- Reconciliação read-only mais recente: 1667 matched, 3 not_found.
- Writer PUT idempotente, com preservação dos campos não administrados.
- Canário real de atualização concluído e verificado.
- Criação controlada de produto novo também foi validada com sucesso.
- Produtos está ON no Hub V2; o worker continua protegido por idempotência, reconciliação e verificação pós-write.

## Estoque
- Snapshot absoluto de estoque enfileirado por balanço/separação/cancelamento.
- Worker com depósito "Geral" resolvido, rate limit compartilhado e verificação pós-write.
- Coalescing mantém apenas o snapshot absoluto pendente mais recente por produto.
- Estoque está ON no Hub V2 e já teve escritas reais verificadas.

## Clientes
- 486 clientes canônicos.
- 269 com `bling_contact_id` registrados como matched.
- 217 sem documento e sem vínculo ficaram review_required; não há matching por nome/telefone.
- Writer atualiza somente contato já vinculado.
- Campos desconhecidos no cadastro local são preservados no Bling.
- Canário real de cliente concluído e verificado depois da normalização do telefone brasileiro.
- Clientes está ON no Hub V2; clientes sem identidade segura continuam em review_required.

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
- Não havia job de pedido ativo no momento em que o rollout foi armado.
- `orders_enabled=true`, mas o primeiro pedido é tratado como canário único automaticamente.
- O canário só começa em uma primeira separação real; não foi criado pedido artificial para teste.
- Em falha não transitória/validação pós-write, Pedidos desliga automaticamente.
- Em sucesso, o estado `order_rollout.canary_passed` fica registrado no runtime e os próximos pedidos passam a seguir o fluxo normal.

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
Contrato existente mantido e agora ligado ao fluxo da Vitrine **somente para readiness local**:
- NF-e somente após entrega + pagamento confirmado + valor reconciliado.
- `sync_vitrine_order_fiscal_delivery_v1` projeta status entregue/cancelado/devolvido no controle fiscal canônico.
- No `vitrine/admin`, pedido entregue pode receber confirmação explícita de pagamento.
- A confirmação usa o total canônico do pedido; o navegador não informa valor arbitrário.
- Pedido não entregue não pode ter pagamento confirmado pelo fluxo fiscal.
- Entrega + pagamento exato resultam em `fiscal_status=ready`.
- A tela do pedido mostra Entrega / Pagamento / Fiscal e deixa explícito que emissão permanece desligada.
- Não existe botão `Emitir NF-e` nesta etapa.
- `fiscal_runtime_config.enabled=false`
- execution_mode=`off`
- prepare=false
- send=false
- canary=0
- 0 fiscal jobs
- 0 external side effects

Validações executadas:
- pedido real não entregue → `delivery_not_confirmed`;
- tentativa de confirmar pagamento antes da entrega → HTTP 409;
- teste transacional com rollback: entregue + pagamento exato → fiscal ready e preview elegível;
- o teste confirmou que nenhum `fiscal_issue_job` foi criado.

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

## Validações adicionais desta rodada
- dois previews reais de pedido (cesta pura e misto) continuam fechando total exato;
- preview estrutural pode estar pronto, mas escrita fica bloqueada por `first_separation_required` e `stock_not_consumed` antes da separação;
- runtime novo Vitrine/Admin/Hub foi verificado sem URLs Make;
- CI corrigido em 2026-09-23 após atualização do gate centralizado de canário; workflow `Vitrine na raiz` passou;
- GitHub Pages passou;
- inventário de limpeza seguro salvo em `SUPABASE-CLEANUP-INVENTORY.md`;
- objetos Bling V1 vazios ainda dependentes foram mantidos como DEPRECATE, não apagados.

## Próximos passos seguros
1. Aguardar a primeira separação real para observar o canário automático de Pedido.
2. Manter Webhooks OFF até a URL ser cadastrada no painel Bling.
3. Observar o novo readiness fiscal durante entregas reais; emissão continua OFF.
4. Depois que o primeiro pedido Bling passar e houver entrega/pagamento real validado, preparar o primeiro preview de NF-e sem envio.
5. Inventariar objetos legados para limpeza Supabase somente depois da estabilização de Pedidos.
6. Make permanece intacto na plataforma, conforme decisão do usuário, mas não faz parte do novo runtime direto.
