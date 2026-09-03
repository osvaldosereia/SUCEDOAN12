# CanecaFácil — mapa de corte Make → GitHub Actions V1

> Estado: preparação concluída no lado GitHub. **Nenhum módulo do cenário Make deve ser removido antes do corte controlado.**

## Regra de arquitetura

- **GitHub Actions**: motor operacional padrão para Loja Integrada, catálogo, categorias, SKU, produto, preço, estoque, SEO, galeria, mídia, auditoria, fila e retries.
- **Make**: motor de IA e contingência.
- **OpenAI no Make**: permanece.
- O corte deve ser feito por grupos, nunca desligando tudo de uma vez.

## Evidências de prontidão

- Sincronização real V4: produto criado/atualizado pelo GitHub, categoria específica preservada, preço/estoque/SEO/alias e auditoria concluídos.
- Produto canário: `CANP-WTM83S` → Loja Integrada `403584796`.
- Galeria canário: 3/3 imagens oficiais confirmadas e IDs Firebase ↔ Loja Integrada correspondentes.
- Busca por SKU e leitura por ID: canários somente leitura concluídos com sucesso.
- Check objetivo: 11/11 funções do núcleo GitHub prontas, 0 bloqueios de núcleo.
- Make não participou desses testes.

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

## Grupo C — Ponte Make → GitHub para mídia — PODE SER ELIMINADO NO CUTOVER

Módulos candidatos:

`120, 121, 122`

Motivo:

O trabalho real já é executado diretamente por GitHub Actions. Não há benefício em manter a sequência `Admin/Firebase → Make → GitHub`.

Substitutos:

- `.github/workflows/processar-midia-loja-integrada-canecas.yml`
- `scripts/processar-midia-loja-integrada-v16.mjs`
- `scripts/migrar-imagens-loja-integrada-v1.mjs`

A mídia roda automaticamente em horários escalonados e a galeria oficial foi validada com 3 imagens.

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
2. **Grupo C** — pontes Make → GitHub de mídia.
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
