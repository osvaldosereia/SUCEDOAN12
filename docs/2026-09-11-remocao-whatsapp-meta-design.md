# Remoção de WhatsApp e Meta

Data: 2026-09-11

## Objetivo
Remover do sistema toda integração, automação, inteligência, atendimento, Flow, Inbox, webhook, worker, tela e configuração específicos de WhatsApp/Meta.

O módulo Clientes permanece apenas para cadastro e edição. Telefone continua como dado cadastral comum.

## Manter
- Produtos, estoque, validade, categorias, gôndola e prateleira.
- Cestas básicas.
- Cadastro e edição de clientes.
- Pedidos e histórico comercial independente do atendimento.
- Contagens.
- Bling e fila Bling.
- Segurança do Admin.

## Remover do Admin
- Filtro e coluna WhatsApp em Produtos.
- Flags exclusivas de publicação no WhatsApp.
- Modos de compra e perfis ligados ao canal no cadastro de Clientes.
- Recomendações e criação de conteúdo para atendimento conversacional.
- Inbox, central humana, copiloto, IA de atendimento, WhatsApp Ops e telas de Flow.

## Remover do backend
- Funções específicas de WhatsApp/Meta/Flow/Inbox.
- Webhooks do canal.
- Workers de conversa.
- Estruturas de banco exclusivas desse subsistema.
- Configurações usadas somente pela integração Meta.

## Remover dos fluxos antigos
- Retornos e bridges específicos para WhatsApp.
- WhatsApp Flow de cestas e transporte desses Flows.
- Adapters de canais Meta sem outra função ativa.

## Clientes depois da limpeza
O Admin de Clientes terá somente:
- lista;
- busca;
- abrir cadastro;
- editar dados cadastrais;
- salvar;
- histórico comercial simples quando já existir e não depender de inteligência de canal.

Não haverá score, modo de compra, recomendação de canal, geração de mensagem, sugestão de áudio, IA ou automação.

## Implementação
1. Mapear referências restantes no código ativo.
2. Ajustar testes para a arquitetura sem WhatsApp/Meta.
3. Simplificar o Admin e substituir o módulo atual de inteligência de clientes por cadastro/edição simples.
4. Excluir frontend e backend específicos do subsistema.
5. Aplicar uma migration de limpeza apenas aos objetos de banco exclusivos do subsistema.
6. Limpar configuração do Supabase, workflows e testes antigos.
7. Fazer busca global final por referências operacionais remanescentes.
8. Testar Produtos, Cestas, Clientes, Contagens e Bling antes do merge.

## Critérios de aceite
- O Admin não mostra opções de WhatsApp ou Meta.
- Produtos não têm filtro, coluna ou botão de WhatsApp.
- Clientes é cadastro/edição sem inteligência de atendimento.
- Não há webhook ou worker ativo de WhatsApp/Meta.
- Não há Flow ativo no sistema.
- Estruturas exclusivas do subsistema são removidas sem apagar clientes, pedidos, produtos ou histórico comercial legítimo.
- Produtos, cestas, clientes, pedidos, contagens e Bling continuam funcionando.
