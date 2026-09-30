# Dona Antônia — Correção de identidade Cliente / PapoAI / Site

Data operacional: 2026-09-29 (America/Cuiaba)

## Objetivo
Garantir que pedido feito no site não permaneça órfão de cliente e que os dois números PapoAI (finais 1018 e 0975) sejam tratados como canais distintos, preservando identidade do cliente e enriquecendo cadastro automaticamente com o Flow real.

## Diagnóstico encontrado
- PapoAI estava recebendo tráfego dos dois números.
- O banco conhecia apenas a conta 1018; tráfego do 0975 era espelhado como se viesse do 1018.
- PapoAI entrega a grande maioria dos celulares brasileiros no formato sem o nono dígito, enquanto a Vitrine grava o formato atual com o nono dígito.
- O Flow real não chega como `mode=customer_flow_v1`; chega em uma mensagem `message.received` com `flow_token`, `data_sharing_consent` e campos `custom_1..custom_5`.
- Havia pedidos recentes da Vitrine sem `customer_id`; vários possuíam conversa PapoAI correspondente, mas a equivalência telefônica falhava.

## Arquitetura implantada
1. **Pedido do site não depende do Flow.**
   - `storefront-v2` garante a identidade do cliente antes de criar o pedido.
   - trigger de banco funciona como segunda barreira: pedido `vitrine/storefront_v2` com telefone nunca deve ser inserido sem `customer_id`.
   - cliente ainda não conhecido nasce como identidade provisória, sem inventar CPF/endereço.

2. **Checkout mínimo profissional.**
   - cliente novo informa nome + WhatsApp.
   - cliente existente tem nome recuperado.
   - normalização do nono dígito ocorre também no navegador.

3. **Telefone canônico brasileiro.**
   - criada `canonical_whatsapp_e164_br_v2`.
   - `phone_variants_br` passou a reconhecer variante com/sem nono dígito de forma conservadora.
   - não existe merge global automático de cadastros legados ambíguos.

4. **Dois números PapoAI reais.**
   - `dona-antonia-1018` = `+5565984491018`.
   - `dona-antonia-0975` = `+5565998150975`.
   - a conversa agora resolve `whatsapp_account_id` pelo número de destino recebido em `phone_to`, não pela hipótese de existir uma única conta ativa.

5. **Flow real automático.**
   - mensagens contendo `flow_token:` e consentimento são processadas automaticamente.
   - `custom_5`: nome.
   - `custom_3`: CPF/CNPJ candidato, gravado somente após validação dos dígitos verificadores.
   - `custom_4`: endereço informado.
   - `custom_1`: bairro; há proteção para caso o usuário tenha colocado o endereço completo nesse campo.
   - `custom_2`: cidade.
   - Flow associa cliente, conversa, endereço e pedido determinístico quando possível.
   - cliente provisório só é fundido automaticamente com cadastro forte quando a identidade provisória foi criada pelo checkout e um CPF/CNPJ válido aponta de forma determinística para outro cliente.

6. **Observabilidade no Admin.**
   - Central/PapoAI mostra cadastros provisórios, quantos ainda não têm nome, quantos foram verificados pelo Flow e pedidos recentes sem cliente.
   - pedido sem cliente mas com telefone passa a colocar a ponte em atenção.

## Backfill executado
- eventos PapoAI históricos foram reprocessados pela ponte multicanal.
- Flows reais históricos foram processados.
- pedidos da Vitrine com telefone e sem cliente foram reconciliados.
- dados de Flow inválidos não foram promovidos a CPF/CNPJ.

## Validação final desta rodada
- 807 eventos PapoAI observados.
- 627 eventos corretamente classificados no 0975.
- 180 eventos corretamente classificados no 1018.
- 7 Flows reais processados.
- 0 Flow em revisão.
- 5 clientes verificados por Flow (há repetições de Flow para o mesmo cliente).
- 43 pedidos de site na janela de 31 dias.
- 42 com cliente.
- 1 legado sem cliente porque foi originalmente gravado sem telefone e sem identidade recuperável.
- 0 pedido com telefone disponível e sem cliente.
- 0 erro de captura PapoAI.
- smoke tests: criação automática de cliente em pedido do site PASS; auto-processamento de Flow no 0975 PASS; separação do canal PASS; nenhum resíduo de teste.
- JavaScript de `index.html`, `vitrine/index.html` e `vitrine/admin/index.html`: sintaxe PASS.
- `storefront-v2` publicado v27.
- `admin-products-live-v1` publicado v116.
- advisors: avisos novos de EXECUTE público nas funções-trigger foram corrigidos; tabela nova permanece RLS/service-role only.

## Resíduos deliberados
- existem cadastros provisórios históricos anteriores à exigência de nome no checkout. Não há fonte confiável para inventar esses nomes; o Admin os mostra como pendência e um Flow futuro pode enriquecê-los.
- existe 1 pedido legado de 22/09 sem telefone e sem cliente. Não vincular automaticamente por aproximação.
- `structured_order_commit_enabled` continua `false`: esta correção trata identidade/cadastro e não libera criação automática de pedidos livres pelo PapoAI.

## Migrations aplicadas
- `20260930021738_ops2_customer_identity_multichannel_v2`
- `20260930022205_ops2_papoai_flow_text_v2`
- `20260930022320_ops2_customer_identity_phone_source_fix`
- `20260930022906_ops2_papoai_flow_address_guard_v1`
- `20260930023147_ops2_customer_identity_observability_v1`
- `20260930023355_ops2_customer_identity_trigger_security_fix`

## Commits principais
- Site/Vitrine checkout: `6326faf4`, `429fb99e`.
- Storefront Edge: `6ded6cfe`.
- Admin backend: `025f1eb0`.
- Admin frontend: `fbc530cd`.
- SQL canônico gravado em `supabase/sql/` nos arquivos correspondentes às migrations acima.
