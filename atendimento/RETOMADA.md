# RETOMADA — Atendimento Dona Antônia

Atualizado em 06/09/2026.

## Decisão vigente

Este é um projeto **novo** dentro de `SUCEDOAN12/atendimento`. Não usar como base o fluxo antigo do site, Firebase nem cenários antigos do Make.

Fluxo-alvo:

PapoAI/WhatsApp → carrossel da cesta → `/atendimento` → cliente personaliza → adiciona ofertas → site calcula → botão abre WhatsApp com mensagem pronta → cliente envia → PapoAI continua → confirmação final → Make novo → Bling.

## Arquitetura

- **PapoAI:** conversa, IA, CRM, funil, templates oficiais, WhatsApp Flow, automações e handoff.
- **Site `/atendimento`:** montador visual de cesta e adicionais.
- **Admin `/atendimento/admin`:** gestão do site montador, cestas, ofertas, textos, links dos carrosséis e validações.
- **Bling:** fonte oficial de produtos, SKU, preços, estoque, contatos/clientes e pedidos.
- **Make:** somente ponte em tempo real para o fechamento do pedido.
- **Firebase:** não usar neste projeto.

## Implementado

### Site público

- página mobile-first independente;
- escolha de cesta por `?cesta=`;
- edição de quantidades e remoção;
- ofertas por categoria;
- adicionais no mesmo carrinho;
- total recalculado automaticamente;
- código único de carrinho local;
- persistência local via `localStorage`;
- mensagem completa pronta para o cliente enviar no WhatsApp;
- suporte a `?categoria=` e `?secao=ofertas` para links de carrossel;
- suporte a pré-visualização de rascunho do admin com `?preview=1`;
- configuração textual separada em `data/site-config.json`.

### Admin

Criado em `atendimento/admin/` com:

- dashboard e métricas;
- gestão de textos do site;
- gestão da mensagem de WhatsApp;
- cadastro/edição de cestas e componentes;
- cadastro/edição de ofertas e categorias;
- links prontos das cestas para carrossel/template do PapoAI;
- links prontos das categorias de ofertas;
- regras e mapa de integração Bling/PapoAI/Make;
- validação do catálogo;
- rascunho local;
- preview sem publicar;
- exportação de `catalogo.json`, `site-config.json` e pacote completo;
- sem credenciais no frontend.

### Documentação

- `admin/README.md`
- `docs/ARQUITETURA-ATENDIMENTO.md`

## Segurança

O repositório é público. Não colocar tokens, API Keys, PAT, CPF, endereços ou dados de clientes no GitHub. O admin deliberadamente ainda não grava diretamente no repositório: publicação automática deve passar por backend autenticado.

## Próximo passo recomendado

1. Criar sincronização **nova** Bling → catálogo do site, sem Firebase e sem reaproveitar automação antiga.
2. Definir a leitura segura da composição das cestas/kit no Bling.
3. Sincronizar também uma cópia adequada do catálogo Bling → PapoAI para busca semântica.
4. Criar cenário Make **novo e mínimo** somente para fechamento: CPF → localizar/criar contato → revalidar itens/preço/estoque → criar pedido de venda → devolver número do pedido.
5. Depois ligar a publicação do admin a um backend autenticado.
