# CanecaFácil — Make V16 SLIM

## Objetivo

Reduzir o cenário Make ao que ainda agrega valor imediato: **OpenAI + handoffs diretamente ligados aos resultados da IA + e-mail enquanto o Resend ainda não foi cortado**.

A operação normal de Loja Integrada, categorias, SKU, produto, preço, estoque, SEO, galeria, mídia, auditoria, retries e filas fica no Firebase/GitHub Actions.

## Fonte analisada

Blueprint real usado como base:

`CANECAS - Studio IA - V15.0 - arte mestre + 2 mockups + LI quadrada.blueprint.json`

Contagem original: **66 módulos**.

Módulos OpenAI encontrados: **5**:

- `6` — gerar/editar arte;
- `12` — mockup 1;
- `14` — mockup 2;
- `18` — análise/catalogação visual;
- `34` — personalização do modelo.

## Resultado V16 SLIM

Contagem: **28 módulos**.

Redução: **38 módulos**, ou aproximadamente 57,6% do cenário original.

O V16 SLIM mantém os IDs originais dos módulos restantes para facilitar comparação e rollback.

### Módulos mantidos

Núcleo de entrada/roteamento:

`1, 2, 3, 4`

Gerar arte:

`5, 6, 7, 8`

Finalizar produto e gerar mockups:

`10, 9, 11, 12, 13, 14, 15, 16`

> O antigo módulo `120` foi removido. A nova caneca entra em `midia_fila` diretamente pelo Admin/Firebase depois que arte + mockup 1 + mockup 2 são confirmados.

Analisar arte/cadastro:

`18, 19`

Personalização pública:

`30, 31, 32, 33, 34, 37, 35, 114, 115, 116`

Os módulos `115/116` permanecem temporariamente porque `RESEND_API_KEY` ainda não está configurado/validado no GitHub Actions.

## Rotas removidas do Make

### Loja Integrada — criar produto

Removidos:

`40, 65, 41, 42, 46, 47, 66, 43, 48, 49, 44, 45`

Substituição:

- Firebase `canecas/integracoes/loja_integrada/fila`;
- `.github/workflows/sincronizar-canecafacil-loja-integrada.yml`;
- `scripts/sincronizar-loja-integrada-v4.mjs`;
- `scripts/sincronizar-loja-integrada-v3.mjs`;
- `scripts/sincronizar-loja-integrada.mjs`.

### Loja Integrada — atualizar produto

Removidos:

`50, 73, 74, 75, 76, 77, 78, 79, 80, 51, 52, 53, 56, 57, 54, 55`

A mesma fila/worker GitHub cobre produto, preço, estoque, imagens, SEO, alias, IDs e retries.

### Catálogo de marca/categorias

Removidos:

`60, 61, 62`

Substituição:

- `scripts/atualizar-catalogo-loja-integrada-v1.mjs`;
- Firebase `canecas/integracoes/loja_integrada/catalog_refs`;
- atualização automática a cada 5 minutos.

O Admin `li-payload-hardening-v1.js` agora usa somente esse catálogo Firebase/GitHub e não chama `loja_integrada_catalog_refs` no Make.

### Localizar produto por SKU

Removidos:

`63, 64`

Substituição:

O worker `scripts/sincronizar-loja-integrada.mjs` consulta `/produto?sku=...` antes de criar. Ele:

1. exige correspondência exata do SKU;
2. bloqueia resultado ambíguo;
3. reutiliza produto já existente;
4. valida eventual `produto_id` salvo;
5. só cria quando não há correspondência por SKU nem ID válido.

### Ler produto/imagens

Removidos:

`89, 90`

No caminho normal, IDs das imagens ficam persistidos no Firebase pelo GitHub. O Admin usa cache-first. A leitura via Make permanece somente em código de contingência do fluxo Make antigo, não no V16 SLIM.

### Ponte Make → GitHub para mídia

Removidos:

`120, 121, 122`

Substituição:

`Admin → Firebase midia_fila → GitHub Actions → Sharp → canecas-media → Firebase → Loja Integrada`

A finalização de uma nova caneca também grava a fila diretamente pelo Admin (`admin_finalize_github_direct`), portanto não depende mais do módulo `120`.

## Estado do e-mail

Ainda permanecem:

`115, 116`

Quando `RESEND_API_KEY` estiver configurado no GitHub Secrets e um envio canário for confirmado, esses dois módulos também poderão sair.

Contagem futura prevista:

**26 módulos**.

## Segurança do blueprint SLIM

O blueprint gerado para importação foi sanitizado:

- PAT GitHub literal removido;
- `GITHUB_TOKEN` substituído por `CONFIGURE_GITHUB_TOKEN`;
- variáveis não utilizadas `LI_BASE_URL`, `LI_AUTHORIZATION` e `SITE_BRANCH` removidas do módulo de configuração;
- nenhuma referência a módulos removidos permanece;
- nenhuma chave OpenAI literal foi adicionada.

**Importante:** o blueprint V14/V15 usado como fonte continha uma credencial GitHub literal. Ela não foi copiada para o V16 SLIM. Se essa credencial ainda estiver ativa, deve ser revogada/rotacionada.

## Rollback

Não apagar o cenário V15 imediatamente.

Procedimento recomendado:

1. importar o V16 SLIM como cenário separado;
2. configurar conexões OpenAI e o novo `GITHUB_TOKEN`;
3. manter V15 desligado, disponível apenas para rollback;
4. validar geração de arte;
5. validar finalização + 2 mockups;
6. confirmar entrada automática em `midia_fila`;
7. validar personalização pública;
8. validar e-mail atual pelo Resend/Make;
9. só depois arquivar definitivamente as rotas operacionais antigas.

## Arquitetura alvo

### Make

- OpenAI;
- recebimento imediato dos binários da IA;
- persistência/handoff diretamente ligado à geração;
- Resend temporariamente.

### GitHub/Firebase

- catálogo e categorias;
- reconciliação SKU/ID;
- Loja Integrada create/update;
- preço;
- estoque;
- SEO;
- alias;
- mídia derivada;
- galeria de 3 imagens;
- filas;
- retries;
- auditoria;
- status operacional.
