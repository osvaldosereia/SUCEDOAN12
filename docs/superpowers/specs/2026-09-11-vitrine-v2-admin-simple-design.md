# Vitrine V2 + Admin Simplificado — Design

Data: 2026-09-11

## Objetivo

Substituir a vitrine atual por uma versão pública ultra leve, rápida e simples, centrada em cestas básicas e compra assistida por catálogo, mantendo o Admin apenas para Produtos, Cestas básicas e Clientes. Todo atendimento próprio por WhatsApp/Meta/IA fica fora do sistema.

## Escopo do Admin

O menu do Admin terá somente:

- Produtos
- Cestas básicas
- Clientes

Remover:

- Contagens
- Abrir contagem
- Fila Bling da navegação principal, caso não seja necessária para a operação básica
- qualquer filtro, coluna, perfil, botão, texto ou módulo relacionado a WhatsApp/Meta/IA de atendimento

### Produtos

Campos funcionais para a vitrine:

- nome
- EAN/SKU
- preço
- estoque/disponibilidade
- categoria/seção
- marca
- imagem
- oferta
- ordem/posição
- ativo/inativo

O Admin não deve mais ter filtro ou coluna “WhatsApp”.

### Cestas básicas

O cadastro da cesta controla a vitrine pública. Deve permitir:

- nome
- foto
- preço base
- ativo/inativo
- ordem de exibição
- composição padrão
- quantidade padrão de cada item
- regra de edição/remoção quando aplicável

### Clientes

Clientes será apenas cadastro e edição. Não haverá:

- inteligência de atendimento
- perfis “Somente WhatsApp”, “Híbrido” etc.
- recomendação automática
- catálogo personalizado por IA
- métricas de habilidade digital

Campos mínimos: nome, telefone, CPF quando disponível, endereço e demais dados comerciais já usados pela operação.

## Vitrine pública

### Princípios

- HTML/CSS/JS simples, sem framework pesado
- carregar somente o necessário
- mobile-first e responsivo
- sem animações ou bibliotecas desnecessárias
- sem dependência de Meta API
- sem IA no navegador
- sem carregar o catálogo inteiro na abertura

### Fluxo principal

1. Página inicial mostra as cestas básicas ativas com foto, nome e preço.
2. Ao abrir uma cesta, exibir a composição.
3. O cliente pode aumentar, diminuir ou retirar itens permitidos.
4. Botão “Adicionar outros produtos”.
5. Mostrar seções/categorias em botões grandes e simples.
6. O cliente seleciona as seções que deseja navegar.
7. Carregar produtos apenas das seções selecionadas, em blocos/paginação incremental.
8. Busca por nome/EAN quando necessário.
9. Carrinho sempre acessível.
10. Permitir alterar quantidade e limpar carrinho.
11. Checkout básico pede apenas telefone com DDD para identificação inicial.
12. O pedido é salvo no banco antes de abrir o WhatsApp.
13. Depois do salvamento, exibir botão “Enviar pedido no WhatsApp”.
14. O WhatsApp abre com uma mensagem de texto contendo número do pedido, itens, quantidades, alterações da cesta e total.
15. A conversa/cadastro posterior é responsabilidade do PapoAI, fora desta aplicação.

## Identificação por telefone

O telefone será normalizado para um formato canônico (`phone_e164`).

Ao finalizar:

- se existir cliente com o mesmo telefone, salvar `customer_id` no pedido;
- se não existir, salvar `customer_id = null` e manter `phone_e164` no pedido;
- o pedido deve continuar normalmente mesmo sem cadastro.

Quando um cliente for cadastrado posteriormente com esse telefone, o backend deve ligar automaticamente os pedidos pendentes daquele `phone_e164` ao novo `customer_id`.

A associação deve ser idempotente e nunca trocar um pedido já ligado a outro cliente sem ação administrativa explícita.

## Modelo de dados

### customers

Usar cadastro existente quando possível. Garantir índice eficiente para telefone normalizado.

Campos relevantes:

- `id`
- `name`
- `phone_e164`
- demais dados cadastrais

### orders

Campos mínimos novos/garantidos:

- `id`
- `customer_id` nullable
- `phone_e164`
- `status`
- `source = 'storefront_v2'`
- `subtotal`
- `total`
- `created_at`

### order_items

Salvar fotografia comercial do item no momento do pedido:

- `order_id`
- `product_id`
- `name_snapshot`
- `quantity`
- `unit_price`
- `line_total`
- metadados mínimos da cesta quando necessário

### baskets / basket_items

Reutilizar estruturas existentes quando compatíveis; evitar duplicação de tabelas se o modelo atual já atender com segurança.

## API pública da vitrine

O navegador não terá permissão direta para criar pedidos nas tabelas.

Criar uma Edge Function pública dedicada à Vitrine V2 com operações limitadas, por exemplo:

- `list_baskets`
- `get_basket`
- `list_sections`
- `list_products`
- `lookup_customer_by_phone` retornando apenas o mínimo necessário
- `create_order`

`create_order` deve:

1. normalizar telefone;
2. validar itens solicitados;
3. buscar preços e disponibilidade no servidor;
4. recalcular total no servidor;
5. procurar cliente pelo telefone;
6. criar pedido e itens de forma atômica;
7. retornar número do pedido e texto pronto para o WhatsApp.

Nenhum preço enviado pelo navegador será confiado como fonte de verdade.

## Imagens

Toda imagem de produto usada pela vitrine deve ter uma variante otimizada:

- formato WebP
- quadrada
- alvo 320×320 px
- tamanho máximo 15 KB por imagem
- qualidade ajustada automaticamente até respeitar o limite

No Admin, ao cadastrar ou trocar imagem, gerar/atualizar automaticamente a variante da vitrine.

Na vitrine:

- `loading="lazy"`
- `decoding="async"`
- carregar apenas imagens próximas da viewport
- fallback leve para produto sem imagem

## Desempenho

Metas de arquitetura:

- página inicial não baixa os 1000+ produtos;
- produtos carregados por seção e em lotes pequenos;
- scripts próprios pequenos e focados;
- um CSS principal da vitrine, evitando a cadeia atual de vários estilos legados;
- remover dependências antigas de checkout/Firebase/Make da Vitrine V2;
- preservar cache HTTP de assets estáticos com versionamento de arquivo.

## WhatsApp

A aplicação pode apenas abrir o link padrão de WhatsApp com texto preenchido. Não haverá:

- Meta API
- webhook da Meta
- Flow
- Inbox
- agente de atendimento
- automação de resposta
- inteligência própria de WhatsApp

O botão de WhatsApp só aparece depois que o pedido foi persistido com sucesso.

## Segurança

- chave `service_role` nunca vai para o navegador;
- tabelas expostas mantêm RLS;
- criação do pedido passa pela Edge Function;
- preços, estoque e disponibilidade são validados no servidor;
- respostas públicas não expõem dados privados de outros clientes;
- lookup por telefone não devolve cadastro completo sem necessidade.

## Migração e compatibilidade

A implementação será feita em etapas para não interromper produção:

1. simplificar o Admin;
2. criar backend seguro da Vitrine V2 e vínculo por telefone;
3. criar nova vitrine pública em paralelo;
4. testar com dados reais não sensíveis;
5. apontar a produção para a Vitrine V2;
6. remover módulos legados que deixarem de ser usados.

## Critérios de aceite

- Admin mostra somente Produtos, Cestas básicas e Clientes;
- não existe UI ativa de WhatsApp/Meta/IA no Admin;
- cliente consegue escolher cesta, personalizar, escolher seções, adicionar outros produtos, editar e limpar carrinho;
- checkout exige apenas telefone para continuidade inicial;
- pedido é salvo antes da abertura do WhatsApp;
- pedido de cliente existente fica ligado ao cadastro;
- pedido de telefone não cadastrado fica salvo e é ligado automaticamente quando o cliente for cadastrado depois;
- imagem pública de produto otimizada respeita 15 KB;
- vitrine não carrega catálogo completo na inicialização;
- totais do pedido são recalculados no servidor;
- desktop e mobile funcionam sem dependências pesadas.