# Elegibilidade real de produto no Flow de cesta

## Intenção

Fazer o Admin sinalizar as posições de cesta conforme os critérios que o emissor do Flow realmente exige: produto ativo, habilitado para WhatsApp e com foto HTTPS válida. A equipe deve conseguir identificar o motivo da pendência e abrir a edição da cesta diretamente pelo painel inicial.

## Evidência

- O emissor `whatsapp-flow-session-open-v1` usa somente produtos com `is_active`, `is_whatsapp_active`, imagem HTTPS e preço válido; cada posição aceita no máximo 8 opções.
- O editor ativo usa `admin-basket-molds-v1` e recebe o JSON de `admin_basket_mold_editor_v1`, que delega a `basket_mold_editor_v1`.
- A definição remota atual de `basket_mold_editor_v1` inclui `products.is_active`, mas omite `products.is_whatsapp_active`. Por isso o Admin não consegue reproduzir a elegibilidade do emissor apenas com o payload atual.
- Leitura somente leitura do Supabase identificou 5 cestas ativas para WhatsApp, 118 posições, 203 opções elegíveis distribuídas por 48 produtos com fotos HTTPS. Vinte e uma posições não têm produto elegível: Econômica (2), Grande Completa (5), Média Completa (5), Mini Completa (4), Pequena Completa (5). Dezoito dessas posições têm ao menos um produto ativo no cadastro, porém desabilitado para WhatsApp; três não têm produto ativo.
- A migration permanece local. O Supabase canônico tem apenas a branch `main`; a tentativa anterior de branch isolada falhou durante replay e não revelou causa raiz.

## Objetivos

- Acrescentar `is_whatsapp_active` ao objeto de cada opção retornado por `basket_mold_editor_v1`, sem remover ou renomear campos existentes.
- Mapear o estado de atividade geral e o estado WhatsApp separadamente no servidor do Admin.
- Calcular pendências usando `active && whatsappActive && imageUrl HTTPS` e distingui-las de posições sem nenhum produto ativo.
- Manter o atalho do painel inicial para `/cestas` quando houver posição vazia ou alternativa sem foto.
- Alinhar o limite defensivo da validação do snapshot no banco com o limite efetivo do emissor: 8 opções por etapa.

## Fora de escopo

- Ativar produtos, preencher posições, alterar preços ou gravar mudanças nos dados reais.
- Publicar Flow, validar a renderização na Meta, enviar mensagens, mudar webhooks ou habilitar emissão fiscal.
- Acessar ou revelar segredos e tokens.

## Abordagens consideradas

1. **Acrescentar o campo na RPC existente (escolhida):** mantém o gateway autenticado e a fonte já usada pelo editor; é aditivo e evita uma chamada por produto ou uma nova Edge Function.
2. **Criar endpoint de readiness separado:** isola a projeção, mas duplica leitura, autenticação e contratos de Admin que já existem.
3. **Consultar detalhes de produto individualmente:** reutiliza validação atual, mas gera dezenas de chamadas por carga do painel e piora latência.

## Decisões de implementação

- Alterar localmente `public.basket_mold_editor_v1(uuid)` para incluir somente a nova chave JSON `is_whatsapp_active` junto aos campos do produto; manter linguagem SQL, estabilidade, search path, owner e grants do contrato existente.
- O wrapper autenticado `admin_basket_mold_editor_v1` continua responsável por validar `admin_users` e repassar o JSON. Não criar permissão direta nova para `authenticated` na função interna.
- O Admin mostra os rótulos de cadastro e WhatsApp separados. Uma opção só conta como Flow elegível quando ambos estão ativos e a imagem passa pela validação HTTPS local.
- A flag WhatsApp tem três estados no adapter: `true` habilitado, `false` desabilitado e `null` não retornado pela RPC. `null` falha fechado para elegibilidade, aparece como “Status WhatsApp não verificado” e deixa explícito no painel que a leitura do Admin precisa ser atualizada.
- A validação de snapshot recusa mais de 8 opções, em acordo com o emissor e o writer existente.
- Não aplicar migration, atualizar options, implantar Edge Functions ou alterar a branch `main` enquanto não houver baseline de staging reproduzível.

## Limites da evidência

URLs bem formadas não provam disponibilidade pública nem renderização Meta. O Validator oficial, preview/dispositivo e a verificação por WABA continuam gates de homologação.
