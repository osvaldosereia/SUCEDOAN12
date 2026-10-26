# Admin5 — Design

**Data:** 2026-10-26  
**Status:** primeira versão de estrutura preparada; integração direta do catálogo Meta permanece para uma rodada posterior  
**Projeto:** `osvaldosereia/SUCEDOAN12`, nova pasta `/admin5`

## Objetivo

Criar uma área operacional menor que o Vitrine Admin para trabalhar pelo WhatsApp, com uma fila de atendimento dos canais 0975 e 1018, edição rápida de produtos, acesso às telas atuais de Cestas e Pedidos e uma área de preparação do catálogo Meta.

## Decisões

- A aplicação será estática, sem dependências de build, na pasta raiz `admin5/`.
- A autenticação de API reutilizará o helper e a sessão temporária que o Vitrine Admin já usa. Não será criada outra tela de senha nem será colocada chave de serviço no navegador.
- O chat usará `admin-whatsapp-ops-v1`, com os limites de canal e janela de atendimento aplicados pelo serviço atual.
- Produtos usarão `admin-products-live-v1`. Esta primeira tela permite localizar, ativar/desativar e corrigir preço. Estoque permanece somente leitura neste atalho porque a API atual encaminha alterações ao controle oficial do Bling.
- Cestas e Pedidos serão exibidos a partir das abas atuais do Vitrine Admin. Isso preserva as regras operacionais já existentes enquanto o novo painel recebe uma interface própria.
- A preparação do catálogo consulta apenas produtos ativos. As categorias escolhidas são: CESTAS BÁSICAS, MERCEARIA, LIMPEZA, LAVANDERIA, HIGIENE, BELEZA, CASA e PET.
- A primeira versão só mostra classificação, validação e prévia local. Ela não envia alterações para a Meta.
- Nenhuma migration, Edge Function implantada, regra RLS, policy, segredo ou configuração de canal será alterada nesta rodada.

## Interfaces existentes reutilizadas

| Área | Serviço atual |
| --- | --- |
| Atendimento | `admin-whatsapp-ops-v1` |
| Produtos e Pedidos | `admin-products-live-v1` |
| Configuração de Cestas | `admin-basket-configuration-v1` |
| Autorização de chamadas | `vitrine/admin/atendimento/attendance-auth.js` |
| Dados canônicos | Projeto Supabase `ssbesxgaijknwsjbsbcz` |

## Estrutura da primeira versão

- `admin5/index.html`: navegação e tela raiz.
- `admin5/admin5.css`: layout adaptável para computador e celular.
- `admin5/api.js`: chamadas autenticadas para os serviços existentes.
- `admin5/app.js`: fila de chat, produtos, Cestas/Pedidos incorporados e análise do catálogo.
- `docs/admin5/META-WHATSAPP-ESTRATEGIA.md`: dados observados, pesquisa oficial e rodadas seguintes.

## Catálogo e atendimento pelo WhatsApp

O fluxo proposto é: escolha de seção por lista interativa; envio de uma seleção de produtos por catálogo ou mensagem de múltiplos produtos; resposta do cliente com o carrinho nativo; validação do carrinho no Supabase; confirmação humana no chat; coleta de dados estruturados por Flow quando necessário; criação do pedido pelo serviço canônico atual.

O catálogo Commerce é a fonte de itens exibidos nas mensagens de produto. As mensagens de múltiplos produtos são adequadas para seleções curadas, não para reproduzir 388 itens numa única mensagem. O catálogo completo e as mensagens curadas devem coexistir.

Uma ordem recebida da Meta deve virar um rascunho reconciliado por ID estável do catálogo. O backend precisa reler preço, ativo e saldo atual antes de confirmar o pedido. O evento recebido não confirma pagamento nem disponibilidade.

## Limites observados nos dados

- A tabela `products` tem 388 produtos ativos no snapshot de 2026-10-26.
- 42 ativos estão sem preço válido, 49 sem imagem, 60 sem marca e 209 sem descrição cadastrada.
- 331 têm nome, preço positivo e imagem; esse número não resolve a classificação em oito seções.
- A taxonomia mistura grupos. Há valores como `limpeza_lavanderia`, `higiene_beleza` e `casa_pet`; 23 produtos ativos não têm `whatsapp_category`.
- Há cinco cestas marcadas como ativas para WhatsApp, mas os preços atuais do banco diferem da lista mais recente aprovada na conversa. As cestas ficam fora de uma sincronização até reconciliar as variantes de arroz e os respectivos preços.
- Os números 0975 e 1018 pertencem a WABAs diferentes. O catálogo ligado e o direito de atualização devem ser verificados para cada uma.

## Segurança e publicação

O código novo não será publicado nesta rodada. O `admin-pin-auth-v1` existente no repositório cria uma sessão de owner passwordless para a origem do site e atualmente não valida o PIN enviado pelo front-end. O Admin5 seguirá esse fluxo existente por pedido do usuário durante o desenvolvimento, mas a branch deve passar por revisão de acesso antes de ser incorporada ao site público.

Nenhum token Meta, service role key, App Secret ou verify token será colocado em `admin5/`.
