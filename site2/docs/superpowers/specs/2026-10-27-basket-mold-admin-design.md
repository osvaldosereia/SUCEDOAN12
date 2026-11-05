# Editor simples dos moldes de cesta

## Intenção

Permitir que a equipe mantenha as alternativas de produtos de cada etapa do Flow de cesta pelo Admin, usando fotos e cadastros atuais. A tela `/cestas` deve mostrar os moldes que o Flow realmente consome, sem misturar composição comercial, preço extra interno ou a configuração antiga de tipos de produto.

## Evidência e estado atual

- O envio greenfield abre uma sessão por `basket_template_id` e `basket_mold_id`.
- `whatsapp-flow-session-open-v1` lê `basket_molds`, `basket_mold_positions` e `basket_mold_position_options`; só oferece produtos ativos e habilitados para WhatsApp, com preço e imagem válidos, e limita cada etapa a oito opções elegíveis.
- O gateway autenticado ativo `admin-basket-molds-v1` (versão remota 21, `verify_jwt=true`) oferece `list`, `editor`, `products` e `save`. O salvamento chama `admin_save_basket_mold_v3`, que grava o molde e substitui suas posições/opções dentro da transação da RPC.
- Leitura read-only da fonte SQL confirmou que `admin_basket_mold_list_v1` lista apenas templates ativos e exclui explicitamente templates marcados como legado. `admin_basket_mold_editor_v1` delega a `basket_mold_editor_v1` e acrescenta IDs de categoria/subcategoria; nomes/status visuais vêm da lista autenticada. A definição original de `basket_mold_editor_v1` expunha `is_active`, mas não `is_whatsapp_active`; a auditoria do Admin não podia então espelhar a elegibilidade do emissor. A extensão aditiva está especificada em `2026-10-27-basket-flow-eligibility-design.md`.
- A RPC de busca de produto inclui `price`, `cost`, saldos e estoque, não inclui `is_whatsapp_active` nem preço final de oferta. O Adapter descarta saldos/custo e não mostra o preço nominal; `admin-products-live-v1?action=product_detail` é a confirmação autoritativa antes de adicionar/salvar.
- O contrato do writer de posições recebe somente label, quantity, metadata e opções com product_id/metadata. Ele recria IDs de posição/opção, mas conserva o metadata passado; por isso a ordem e metadados têm de ser remontados server-side da leitura atual.
- O editor atual da aplicação usa `admin-basket-configuration-v1?action=flow_list`. Essa projeção lê `basket_admin_*`, não as posições consultadas pelo emissor greenfield; portanto ela não pode ser apresentada como a fonte efetiva do Flow novo.
- A leitura agregada atual encontrou cinco cestas ativas no WhatsApp, 118 posições, 203 alternativas elegíveis com foto e preço, nenhuma posição com mais de oito opções elegíveis e 21 posições sem produto elegível. Não registrar URLs ou credenciais.

## Objetivos

- Listar as cestas/moldes ativos retornados pelo gateway canônico.
- Exibir em cada molde suas posições reais, fotos, produtos e ajuste comercial interno.
- Permitir adicionar e remover alternativas de produto em uma posição, preservando a ordem da lista.
- Impedir que novos produtos sem cadastro ativo, habilitação para WhatsApp ou foto HTTPS sejam adicionados.
- Mostrar posição sem alternativa elegível como pendência; salvamento do molde não publica Flow nem libera o envio.
- Preservar categorias, preço adicional interno, regras condicionais, posição, quantidade e metadados não editados.

## Fora de escopo

- Publicar/atualizar Flow na Meta, validar renderização, enviar mensagem ou alterar binding por WABA.
- Alterar preço/custo dos produtos, criar produtos, editar endereço/cliente ou sincronizar Bling.
- Trocar nomes/ordem/quantidades das posições ou alterar regras de composição e preço nesta fatia.
- Criar tabelas, políticas ou RPCs; usar exclusivamente o gateway existente.

## Abordagens consideradas

1. **Manter somente leitura:** menor trabalho, mas não permite corrigir os 21 grupos sem opção e mantém a tela com uma fonte que o novo emissor não consulta.
2. **Criar migration e RPC novas:** controle total, porém repete uma operação que já existe e depende do baseline/staging ainda bloqueado.
3. **Usar `admin-basket-molds-v1`:** fonte real do molde, writer atômico já existente e sem DDL novo. É a abordagem escolhida.

## Decisões de interface e dados

- `/cestas` lista os moldes e leva a `/cestas/[basketId]`.
- A ficha exibe somente nome, categoria, status do molde, posições, alternativas, foto, status ativo, preço interno agregado e alertas.
- A busca pode retornar mais dados do que a tela precisa; o adapter server-side projeta explicitamente os campos permitidos e descarta custo, estoque detalhado, `metadata`, payload bruto e mensagens internas.
- A ficha permite apenas editar a lista ordenada de IDs de produto por posição. Rótulo, quantidade da composição, categorias, ajuste fixo/condicional e metadados são relidos no servidor no momento do salvamento e preservados.
- Cada produto novo é conferido pelo gateway de detalhes de produto no servidor: ativo, ativo para WhatsApp, foto HTTPS presente e preço comercial válido.
- Uma posição modificada é recalculada por detalhe do produto; a gravação exige no mínimo 1 e no máximo 8 alternativas Flow elegíveis naquela posição. Posições sem opções ou com opções existentes inativas podem ser corrigidas adicionando/substituindo produtos.
- O salvamento recebe uma revisão opaca do snapshot. Antes da RPC, o servidor relê o molde e rejeita a revisão se ele mudou. O contrato remoto não aceita revisão/ETag; existe uma pequena janela de concorrência entre a releitura e a RPC, registrada como limitação até uma versão de writer com controle atômico.
- Remover uma opção não remove o produto nem a foto do Storage; afeta apenas o molde.
- Ajustes de composição continuam server-side e não aparecem no resumo ou preço individual enviado ao cliente.

## Segurança e operação

- Ler e gravar somente após sessão Supabase válida; o gateway revalida `admin_users` e papel ativo. `viewer` pode consultar, mas não gravar.
- O navegador envia apenas cesta, posição, IDs dos produtos e revisão opaca. O servidor mantém os metadados atuais e os campos internos.
- Sem DDL, deploy, chamada Meta, envio de WhatsApp, Bling ou alteração de segredo nesta fatia.
- Mudanças de produto continuam usando a ficha de produtos existente; imagens no Flow só serão declaradas homologadas após validação real por WABA.

## Critérios de aceite

- A lista Admin vem de `admin-basket-molds-v1?action=list` e a ficha de `action=editor`, a mesma família de dados que o emissor greenfield usa para montar a sessão Flow.
- A tela mostra fotos existentes e marca foto ausente/inativo sem inferir que URL cadastrada significa renderização Meta.
- Adição aceita somente produto ativo, ativo no WhatsApp, com foto HTTPS e preço atual; duplicados são rejeitados.
- Remoção altera somente a lista de opções daquela posição; quantidades, ordem de posição e ajustes internos permanecem iguais.
- Uma revisão antiga é recusada; erro da API não mostra payload nem campo financeiro bruto.
- O status do projeto continua como integração local não homologada até staging e a validação nos dois WABAs.
