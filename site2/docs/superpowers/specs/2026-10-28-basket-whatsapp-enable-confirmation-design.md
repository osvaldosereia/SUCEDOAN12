# Confirmação ao habilitar produto no WhatsApp

## Intenção

Evitar que um clique acidental habilite um produto em todas as opções de Flow às quais ele já está associado. A pessoa operadora deve ver o alcance da mudança antes de confirmar.

## Estado atual

`BasketProductWhatsappEnableAction` chama imediatamente o gateway autenticado ao clicar em “Habilitar no WhatsApp”. O próprio cartão informa que o produto poderá aparecer em todas as cestas associadas, mas a mudança já ocorreu antes de uma confirmação explícita desse alcance. O gateway e a Edge Function permanecem responsáveis por sessão, papel, disponibilidade esperada, nome, foto HTTPS e preço.

## Abordagens consideradas

- Confirmação nativa (`window.confirm`): poucas linhas, mas aparência e acessibilidade variam por navegador e não seguem os cartões do Admin.
- Confirmação inline no cartão (escolhida): primeiro clique revela o alcance e os botões “Cancelar” e “Habilitar produto”; só a confirmação chama o gateway. Mantém o desenho atual, não adiciona dependências e não requer fluxo novo.

## Escopo e limites

- Alterar somente `product-whatsapp-enable-action.tsx` e os estilos necessários em `globals.css`.
- Preservar a função autenticada existente, as validações do servidor e o estado de carregamento/resultado.
- Não ligar produtos, alterar dados, habilitar em lote, mudar permissões, Edge Functions ou contrato Supabase.
- Não criar nem executar testes automatizados, conforme instrução vigente; fazer apenas lint/typecheck e verificação de diff essenciais.

## Critério de aceite

O primeiro clique não envia requisição e mostra uma confirmação clara de que o produto poderá ser exibido em todas as cestas onde está associado. Cancelar fecha a confirmação sem alteração. Confirmar chama uma única vez o gateway atual; enquanto aguarda, as ações ficam desabilitadas. O sucesso e erros existentes continuam visíveis.
