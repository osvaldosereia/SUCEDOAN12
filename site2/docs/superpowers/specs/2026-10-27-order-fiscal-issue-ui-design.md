# Emissão de NF-e no painel do pedido — design

## Intenção

Quando a equipe conclui a produção/separação, o pedido passa a **Expedição** e o gateway existente tenta sincronizar o estado no Bling e emitir a NF-e conforme as regras fiscais configuradas. Se o gateway liberar a emissão manual, o Admin precisa oferecer um comando claro para solicitar a NF-e e mostrar que a saída para entrega permanece bloqueada até a autorização.

## Decisão técnica

Usar `admin-products-live-v1?action=order_fiscal_issue_v4`, já existente no Supabase original. A Server Action revalida sessão, UUID do pedido, estado `ready` e `can_issue=true`; a tela pede confirmação explícita e só exibe o botão quando o gateway considerar o pedido elegível. A solicitação envia o marcador exato `confirmation: "EMITIR_NFE"`. O gateway continua responsável por preflight, idempotência, Bling e reconciliação.

## Abordagens consideradas

1. **Somente emissão em segundo plano:** não adiciona ação ao Admin; deixa a operação sem recuperação visível quando a configuração permite emissão humana e a tentativa automática não conclui.
2. **Comando manual condicionado ao gateway — escolhida:** reaproveita o endpoint já protegido e só oferece a ação quando `can_issue` for verdadeiro. Mantém a confirmação fiscal e a autorização como responsabilidade do gateway.
3. **Criar RPC/Edge Function paralela:** duplicaria preflight e regras de idempotência já existentes, aumentando o risco de o painel divergir do Bling.

## Regras visíveis no Admin

- Concluir separação mantém o pedido em Expedição e inicia as integrações do gateway em segundo plano.
- O painel mostra estado, número da NF-e e situação Sefaz disponíveis.
- A emissão manual só aparece quando `can_issue=true`, a NF-e ainda não estiver autorizada e não houver recuperação de geração pendente.
- Antes do POST, a pessoa confirma que deseja solicitar a emissão da NF-e daquele pedido no Bling.
- A mensagem após a solicitação não afirma autorização fiscal; informa processamento ou resultado observado.
- Iniciar entrega continua bloqueado até `authorized=true` e `can_dispatch=true`.

## Limites

- Esta mudança é somente de código e documentação local. Não solicita NF-e, não ativa configuração fiscal, não altera Bling nem grava no Supabase.
- Valores de token, secret e credenciais nunca passam pelo browser nem aparecem em logs ou texto de retorno.
- Fiscal segue desabilitado até a configuração e o gate contábil autorizarem a ação no gateway.

## Verificação

Verificar tipos, formatação dos arquivos afetados e limpeza do diff. Não executar teste automatizado nesta fatia; a emissão e o fluxo fiscal real continuam dependentes de homologação isolada e autorização operacional.
