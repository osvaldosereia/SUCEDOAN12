# WhatsApp 1018 — Fase 1: implantação e homologação (2026-10-14)

## Estado
**Fase 1: concluída para preparação técnica, integração canônica e homologação transacional.**
**Atendimento público: não ativado.** Não há cutover do 0975 ou 1018. Não há autorização de pedidos automáticos pelo Flow.
Branch isolada: `agent/whatsapp-1018-reversible-pilot-20261013`. PR #1092.

## Autoridade e contratos
- Vitrine/Admin > Cestas continua controlando produtos preferenciais, até seis composições, lotes, estoque, preços, valor oculto fixo e condicional. Não existe editor paralelo no WhatsApp.
- `storefront-v2?action=basket` é consultado por composição (card key `basket_id@1..6`), sem precificação por home em cache.
- `basket_mold` passa `components: [{position_id, product_id, quantity}]` para `create_vitrine_cart_order_v3_base`; o campo `items` não era interpretado pelo banco e foi corrigido.
- Pagamento mapeia códigos internos para as legendas aceitas pelo SQL: PIX, Dinheiro, Cartão de crédito, Cartão alimentação/refeição.
- Pedido inclui `checkout_registration` (nome, documento quando necessário, rua, número, bairro, cidade, CEP, complemento e referência) para o registro verificado pelo checkout oficial.
- Data de entrega vem de `delivery_options` e é novamente conferida no servidor. Restrições de Cuiabá/Várzea Grande, pedido mínimo e estoque são aplicadas pela camada canônica.
- CPF/CNPJ e valores ocultos não aparecem na resposta pública de prévia.

## Homologação realizada no banco canônico
1. Pedido real interno **DA-261014-49FD68EA**, ID `49fd68ea-f148-4e32-a64b-04d0967336ac`, origem do teste 1018.
2. Cesta Mini Completa, tipo 1, **23 componentes** e 24 linhas no pedido.
3. Preço final **R$ 184,87**, subtotal fiscal **R$ 172,87**, outras despesas / oculto fixo **R$ 12,00**.
4. Pedido cancelado **na mesma transação** da criação; não entrou no fluxo de separação nem fez disparo de WhatsApp pela função do checkout.
5. Conferência pós-commit: `status=cancelled`, **0 reservas abertas**, **23 reservas liberadas**, marcador `ANA1018_FASE1_20261014`.
6. Um segundo cenário de cesta tipo 2 exercitou o valor oculto **condicional** (somado apenas quando seu produto gatilho integra a composição). Executado em transação explicitamente revertida (ROLLBACK); nenhum outro pedido de teste persistiu.

## Deploy e testes
- Função isolada no Supabase canônico `admin-whatsapp-1018-pilot-v1`: **versão 6 ACTIVE**.
- Conta 1018: consultas, prévias, orçamento e preparação do pedido isoladas e restritas a proprietário autenticado.
- Painel `vitrine/admin/atendimento/piloto-1018.html` na branch adiciona formulário de prévia/validação do checkout e acionamento explícito de pedido de teste, com trava adicional.
- GitHub Actions, commit `bd8dec7b8bfbfe2e6c2a83bf4a348bf18264d7e3`: **5 de 5 workflows success**.
- Controle de duplicidade: `whatsapp_1018_checkout_attempts_v1`, RLS ativo, sem acesso público; timeouts não reenviam automaticamente.

## Fora da fase 1 / aguardando fase 2
- `WHATSAPP_1018_PILOT_ORDER_WRITES_ENABLED` permanece desligado; o botão de teste não autoriza compras em produção por si só.
- O teste da camada SQL não substitui teste manual do painel com sessão de owner e entrada efetiva de pedido via rota HTTP. Esse caminho requer habilitação deliberada e uma identidade de teste legitimamente cadastrada.
- O Flow Meta publicado continua como menu de intenção, **não** checkout completo pelo WhatsApp.
- Ativação dos números, envio de templates/Flows aos clientes, homologação da mensagem real, atendimento humano, recuperação de falhas e aprovação do cutover pertencem à etapa posterior.
- Não fazer outro pedido persistente sem nova autorização. Não reabrir indevidamente correções já validadas na fase 1.

## Política de preservação
Não alterar a seção Cestas do Vitrine/Admin que já funciona bem. Não reintroduzir PapoAI. Manter todos os writes do WhatsApp sob feature gate até fase 2.
