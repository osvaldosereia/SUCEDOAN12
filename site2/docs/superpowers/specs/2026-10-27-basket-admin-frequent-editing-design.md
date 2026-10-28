# Edição frequente de cestas no Admin

## Intenção

Permitir que a equipe ajuste pelo Admin a cesta que o Flow consome, sem depender de SQL ou edição de código a cada troca de produto.

## Estado confirmado

- `/cestas/[basketId]` já lista etapas e fotos, adiciona/remove alternativas e salva por sessão autenticada.
- O gateway ativo `admin-basket-molds-v1` v21 aceita `name`, `hidden_adjustment` e `positions` com `label`, `quantity`, ordem e opções. O writer `admin_save_basket_mold_v3` exige usuário autenticado e chama a gravação transacional existente.
- O Flow greenfield lê `label`, `sort_order` e opções; a escolha de quantidade do cliente é `0..6`. A coluna antiga `basket_mold_positions.quantity` não é consumida pelo Flow atual. Não expor essa coluna como controle que promete mudar o pedido.
- O acréscimo fixo oculto altera a cotação server-side e não aparece como item/valor individual na confirmação enviada ao cliente.

## Abordagens e decisão

1. Criar novo cadastro/tabelas e writer: recusado, pois duplica configuração já existente e exige DDL em produção.
2. Ampliar o editor/Admin e o adapter server-side usando o writer autenticado atual: escolhido; atende a edição frequente sem schema novo.

## Comportamento

- Editar nome da cesta, título e ordem das etapas, ordem das alternativas e acréscimo fixo interno.
- Incluir ou remover etapas da composição, respeitando no Admin o limite de 80 posições (o contrato atual do Flow aceita até 100). A cesta precisa manter ao menos uma etapa; uma etapa nova ou com opções alteradas precisa conter uma alternativa elegível.
- Adicionar/remover alternativas com validação atual de produto WhatsApp ativo, foto HTTPS e preço comercial vigente.
- O browser envia só valores permitidos e IDs; o servidor relê o molde, valida revisão, mantém categoria, subcategoria, regras condicionais, `quantity` legado e metadados, e usa o writer autenticado.
- Valores individuais de produto continuam exclusivamente no cadastro do produto. O cliente seleciona quantidade de 0 a 6 dentro do Flow.
- Mostrar aviso de que mudanças afetam novas sessões; Flow já iniciado pode exigir reinício. Pedidos já confirmados conservam o snapshot registrado.
- Produtos desabilitados para WhatsApp continuam sem ativação automática; a tela oferece acesso ao cadastro do produto para a equipe ajustar a disponibilidade conscientemente.

## Segurança e limites

- Sem migration, DDL, escrita direta no banco, alteração do catálogo Meta, publicação de Flow, envio de mensagens, estoque, Bling ou NF-e nesta fatia.
- A alteração usa `admin_save_basket_mold_v3` com sessão do usuário; o snapshot evita edição a partir de tela desatualizada. O writer existente recria as linhas de posição, portanto Flow em andamento deve ser reiniciado/revalidado.
- Sem testes automatizados nesta tarefa; validar tipos, lint focalizado e diff.
