# Estúdio Criativo — fronteiras do projeto

Este diretório pertence ao projeto **Estúdio Criativo / Reels da Dona Antônia**.

## Não confundir com Admin Comprar

**Admin Comprar** administra `/comprar/`: catálogo, produtos, cestas, categorias, clientes, pedidos, atendimento e configurações operacionais.

**Estúdio Criativo** cria conteúdo audiovisual: Creative Mining, Diretor Criativo, biblioteca de elementos, Asset Resolver, Asset Hunter, motion/behavior, áudio, timeline, jobs e renderização de Reels.

## Regra de integração

O Estúdio Criativo pode **ler** do cadastro operacional apenas os dados comerciais necessários (produto ativo, nome, imagem, preço, oferta, marca, categoria e subcategoria). Ele não altera regras, navegação, performance, checkout, categorias, pedidos ou atendimento do `/comprar/`.

A página `admin/creative-studio.html` é somente uma **porta de acesso independente** ao Estúdio. A presença de um atalho dentro do Admin não torna os dois projetos o mesmo sistema.

## Prefixos reservados

- Código de domínio: `marketing/creative-studio/`
- Edge Functions: `creative-studio-*`
- Banco: `creative_studio_*` e catálogo legado de assets progressivamente generalizado
- Storage: `creative-studio-assets` e `creative-studio-renders`
- UI: `admin/creative-studio.*`

Ao trabalhar em outro projeto, não modificar esses arquivos sem uma solicitação explícita sobre o Estúdio Criativo. Ao trabalhar no Estúdio Criativo, não modificar lógica do Admin Comprar além de um atalho claramente identificado.
