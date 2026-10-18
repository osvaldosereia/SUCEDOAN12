# Rodada 05/20 — Criação manual de pedidos

Branch: refactor/admin-print-queue-panel-20261018. PR #1121.

## Fluxo auditado

- O Admin usa createManualSale para validar nome, telefone, rua, número, cidade, UF com dois caracteres, carrinho não vazio e mínimo de R$ 75.
- O payload envia itens, dados de cliente e endereço, forma de pagamento e operador à ação manual_order_create via POST.
- O backend createManualWhatsappOrder exige papel de edição, telefone, itens e delega a operação à RPC create_vitrine_cart_order_v3 ou create_canonical_cart_order_v2 conforme configuração das cestas.
- A resposta declara reserva apenas na confirmação; o backend trata erros de mínimo, disponibilidade e lotes.

## Achados

1. A validação do Admin confere a presença do telefone, mas não sua normalização nem o comprimento. A verificação do backend também usa presença. Validação canônica da RPC não foi comprovada.
2. O campo UF exige dois caracteres, mas não restringe letras. Revisar juntamente com cadastro/endereço na rodada 06.
3. O carrinho pode receber valores de quantidade que não são revalidados em createManualSale. O comportamento dos botões limita de 1 a 30 na interface, mas não substitui validação canônica.
4. O botão é desabilitado no início da requisição, porém createManualSale não tem trava síncrona de reentrada. Uma segunda invocação programática ou evento já enfileirado pode duplicar o envio. A idempotência da RPC não foi demonstrada.
5. O backend cria evento operacional após a RPC. Revisar efeitos de falha de evento e retomada antes de alterar semântica.
6. A escolha entre duas RPCs de criação exige teste de paridade, principalmente cestas com lotes e reserva na confirmação.

## Mudanças executadas

- Corrigido teste de carregamento de módulos que comparava scripts posteriores ao último fechamento de script, produzindo falsos negativos em vários workflows.
- Adicionado contrato de regressão para criação manual e reserva na confirmação.
- Integrado novo teste ao workflow Admin print queue panel.

## Não alterado

- Não foi possível aplicar com segurança uma alteração no index.html nesta rodada: a ferramenta de atualização bloqueou a operação.
- Nenhuma mudança em banco, Edge Functions, autenticação, pagamento, estoque real ou produção.
- Não afirmar que duplicação ou validação de quantidade estejam corrigidas; são riscos pendentes.

## Encaminhamento

Os riscos de integridade na criação manual devem permanecer explícitos no relatório final e ser abordados nas rodadas de dados de cliente (06), fluxo de confirmação (07) e consolidação (19–20), sem ampliação automática das 20 rodadas.
