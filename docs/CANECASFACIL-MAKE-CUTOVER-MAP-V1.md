# CanecaFácil — mapa de corte Make → GitHub Actions V1

> Estado: preparação concluída no lado GitHub. **Nenhum módulo do cenário Make deve ser removido antes do corte controlado.**

## Regra de arquitetura

- **GitHub Actions**: motor operacional padrão para Loja Integrada, catálogo, categorias, SKU, produto, preço, estoque, SEO, galeria, mídia, auditoria, fila e retries.
- **Make**: motor de IA e contingência.
- **OpenAI no Make**: permanece.
- O corte deve ser feito por grupos, nunca desligando tudo de uma vez.

## Evidências de prontidão

- Sincronização real V4: produto criado/atualizado pelo GitHub, categoria específica preservada, preço/estoque/SEO/alias e auditoria concluídos.
- Produto canário operacional: `CANP-WTM83S` → Loja Integrada `403584796`.
- Galeria canário operacional: 3/3 imagens oficiais confirmadas e IDs Firebase ↔ Loja Integrada correspondentes.
- E2E específico da mídia sem Make: `CANP-4J4SCE` / Firebase `mug-1788067216093-4j4sce` / Loja Integrada `403584611`.
- Nesse E2E, a arte mestre `2400×960` gerou a derivada `1200×1200`, o Firebase confirmou vitrine com 3 imagens e a Loja Integrada removeu 3 imagens antigas e criou 3 novas, com 0 erros.
- Fila de mídia validada nos estados `pendente → processando → concluido` e `via=github_actions`.
- Busca por SKU e leitura por ID: canários somente leitura concluídos com sucesso.
- Check objetivo do núcleo GitHub: 11/11 funções prontas, 0 bloqueios de núcleo.
- Make não participou desses testes operacionais.

## Grupo A — Loja Integrada operacional — PRONTO PARA CORTE CONTROLADO

Módulos Make candidatos a desativação após o início formal do cutover:

`40, 41, 42, 43, 44, 46, 47, 48, 49, 50, 51, 52, 53, 54, 56, 57, 65, 66, 73, 74, 75, 76, 77, 78, 79, 80`

Substitutos GitHub:

- `.github/workflows/sincronizar-canecafacil-loja-integrada.yml`
- `scripts/sincronizar-loja-integrada-v4.mjs`
- `scripts/sincronizar-loja-integrada-v3.mjs`
- `scripts/sincronizar-loja-integrada.mjs`

Cobertura:

- criar produto;
- atualizar produto;
- preço;
- estoque;
- SEO;
- alias/URL amigável;
- categoria;
- imagens;
- vínculo de IDs no Firebase;
- retry e classificação de erros;
- auditoria posterior.

### Critério para desligar

1. Manter Make disponível como reserva.
2. Desativar somente as rotas normais desse grupo.
3. Publicar 1 produto novo e atualizar 1 existente pelo Admin/GitHub.
4. Confirmar `sync_status=sincronizado`, categoria, preço, estoque, SEO e 3 imagens.
5. Se falhar, reativar o grupo Make sem perder a fila Firebase.

## Grupo B — Catálogo e consultas — PRONTO PARA CORTE CONTROLADO

Módulos Make candidatos:

`60, 61, 62, 63, 64, 89, 90`

Substitutos:

- `scripts/atualizar-catalogo-loja-integrada-v1.mjs`
- `scripts/reconciliar-categorias-produtos-li-v1.mjs`
- `scripts/processar-operacoes-github-canecas-v1.mjs`

Cobertura comprovada:

- categorias reais da Loja Integrada: 19 no canário atual;
- marcas: endpoint suportado, loja atualmente sem marcas retornadas;
- localizar produto por SKU;
- ler produto por ID;
- reconciliar categoria por ID, aceitando `/v1/...` e `/api/v1/...` como o mesmo recurso.

## Grupo C — Ponte Make → GitHub para mídia — SUBSTITUTO E2E ATIVO E VALIDADO

Módulos candidatos:

`120, 121, 122`

### Estado atual

O Admin **não precisa mais do Make para solicitar a preparação da mídia**. A rota normal agora é:

`Admin → Firebase midia_fila → GitHub Actions → Sharp → canecas-media → Firebase → Loja Integrada → finalize da fila`

Substitutos ativos:

- `admin-canecas/storefront-media-v4.js` — grava diretamente `canecas/integracoes/loja_integrada/midia_fila`;
- `scripts/fila-midia-loja-integrada-v1.mjs` — enqueue, claim e finalize;
- `.github/workflows/processar-fila-midia-loja-integrada.yml` — worker automático a cada 5 minutos;
- `scripts/processar-midia-loja-integrada-v16.mjs` — gera a horizontal quadrada;
- `scripts/migrar-imagens-loja-integrada-v1.mjs` — substitui a galeria da Loja Integrada pelas 3 imagens oficiais.

### E2E confirmado

Canário: `CANP-4J4SCE` / produto LI `403584611`.

Resultado:

- enqueue Firebase: OK;
- claim GitHub: OK;
- Sharp: OK;
- origem `2400×960` → derivada LI `1200×1200`: OK;
- Firebase: `vitrine=3 imagens`: OK;
- Loja Integrada: `removidas=3 · novas=3`: OK;
- finalize: OK;
- erros: 0;
- Make: não utilizado.

O canário E2E ficou **manual-only** após a validação para nunca regravar uma galeria por acidente.

### Desempenho

O primeiro E2E mostrou que o processamento real é rápido, mas o checkout antigo com `fetch-depth: 0` desperdiçava quase 3 minutos buscando todas as branches do repositório. Os workflows de mídia foram alterados para checkout **raso + sparse**, mantendo apenas `scripts` no checkout inicial e adicionando a mídia gerada com `git add --sparse`.

O workflow legado de mídia perdeu o schedule periódico. Ele permanece como fallback/manual e reação a alterações da branch `canecas-media`.

### Critério para desligar 120/121/122 no Make

O substituto GitHub está tecnicamente pronto e já passou por E2E real. O cenário Make ainda permanece intacto por decisão de cutover. Quando o corte formal for feito, os módulos 120/121/122 podem ser desativados como um único grupo, mantendo o blueprint original disponível para rollback.

## Grupo D — E-mail Resend — AINDA NÃO CORTAR

Módulos:

`115, 116`

Código substituto já existe no GitHub Ops, porém o secret `RESEND_API_KEY` ainda não está configurado no GitHub Actions.

**Regra:** manter esses módulos no Make até:

1. configurar `RESEND_API_KEY` no GitHub Secrets;
2. executar um envio canário controlado;
3. confirmar entrega;
4. registrar resultado no Firebase.

Só depois desativar 115/116.

## Grupo E — OpenAI — PERMANECE NO MAKE

Módulos OpenAI identificados:

`6, 12, 14, 18, 34`

Funções:

- criação de arte;
- mockup 1;
- mockup 2;
- catalogação/análise visual;
- personalização.

Não há motivo operacional para mover essas funções agora. O Make continuará sendo o motor de IA.

## Grupo F — módulos auxiliares próximos da IA — MANTER NESTA FASE

Manter por enquanto:

`7, 11, 13, 15, 16, 30, 31, 32, 35, 37, 114`

Motivos:

- recebem ou persistem imediatamente o binário gerado pela IA;
- fornecem contexto privado para o prompt;
- registram estado imediato `processando/pronto/erro` no Firebase;
- evitam adicionar armazenamento intermediário apenas para retirar operações pequenas do Make.

O módulo 16 pode ser simplificado futuramente para apenas fazer o handoff ao Firebase/GitHub.

## Estado objetivo atual

O workflow `.github/workflows/verificar-prontidao-corte-make.yml` publica o estado em:

`canecas/integracoes/github_ops/prontidao_corte_make`

O Admin lê esse estado e deve mostrar:

- núcleo GitHub pronto/total;
- tempos de busca SKU e leitura de produto;
- e-mail Resend pronto ou bloqueado;
- indicação de que OpenAI continua no Make.

## Ordem recomendada do futuro cutover

1. **Grupo B** — consultas e catálogo.
2. **Grupo C** — pontes Make → GitHub de mídia; substituto já validado E2E.
3. **Grupo A** — escrita operacional da Loja Integrada.
4. Observar operações reais e manter fallback Make disponível.
5. **Grupo D** somente depois do canário Resend.
6. **Grupos E/F permanecem no Make.**

## Rollback

O rollback não deve recriar lógica nem desfazer dados. Basta reativar temporariamente a rota Make correspondente, porque:

- Firebase permanece como estado/fila;
- IDs da Loja Integrada ficam persistidos;
- categorias são identificadas por ID;
- GitHub continua auditando o estado;
- o cenário Make original ainda não foi apagado durante o cutover inicial.
