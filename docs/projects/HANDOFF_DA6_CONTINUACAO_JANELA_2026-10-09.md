# HANDOFF ATUALIZADO — DA6 Etiquetas Térmicas e Balanço Fotográfico
**Data:** 09/10/2026 — continuação em outra janela  
**Repositório:** `osvaldosereia/SUCEDOAN12`  
**Branch de trabalho:** `agent/gondola-labels-balance-20261009`  
**PR:** [#987](https://github.com/osvaldosereia/SUCEDOAN12/pull/987) — OPEN, DRAFT, **não mesclado**  
**Supabase canônico:** `ssbesxgaijknwsjbsbcz`  
**Estado de publicação:** **BLOQUEADO; DA6 NÃO ESTÁ PUBLICADO NA PRODUÇÃO.**

> ESTE é o documento de retomada atualizado. O arquivo `HANDOFF_ETIQUETAS_BALANCO_DA6_2026-10-09.md` contém um estado inicial desatualizado (citava ausência de worker/aba e dependência de CDN); não usar aquele documento como checkpoint atual.

## 1. Estado conferido ao registrar este handoff
- Último HEAD conferido: `0e379997b29a3ffb1506a80e92d9bbee3d59bccf`. **Sempre refaça a leitura de HEAD/SHA**, porque há programação concorrente e uma automação horária ativa.
- Diferença frente à `main` nessa consulta: **201 commits à frente e 1 atrás**; diff de 82 arquivos. O GitHub informou `mergeable=true` naquele instante, mas isso pode mudar; não assumir merge sem nova inspeção.
- DA6 CI da versão do HEAD acima: **run #37970953744 em andamento** (5 jobs aprovados, `local-supabase-storage` ainda em execução ao consultar).
- Último CI **inteiramente** aprovado documentado: [run #37970603286](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37970603286), **6/6 jobs SUCCESS, 74/74 testes determinísticos** no commit `773274c57bf181066bf4ee016d6dd92f65765f0f`. Confirmar resultado do run mais novo antes de concluir qualquer nova rodada.
- O CI **Admin and Baskets Guard** do mesmo HEAD estava `failure`; o relatório da R7 explica falha preexistente `channel_origin` em `pedido/index.html`, com SHA igual na main e na branch. Não alterar pedidos/cestas sem examinar o projeto responsável.
- **NÃO** há fotos ou impressora reais homologadas nem Edge/cron remotos em staging. A inexistência dessas provas mantém o PR draft e a publicação bloqueada.

## 2. Escopo funcional aprovado
- Impressão térmica vertical **100 × 150 mm**: produto individual, selecionados, lote e gôndola; GTIN válido como código real ou Code128 interno; QR DA6 da etiqueta; quatro marcadores; seis registros independentes (ATIVAR + dezenas 0–9 + unidades 0–9), sem data pré-agendada.
- Cards e edição rápida de gôndolas 1–9999; preserve carregamento e UX mobile.
- `Estoque > Balanço`: manter o balanço A4 e a aba de fotos. Fotos em lote para Storage privado, hash SHA-256, confirmação por arquivo, recuperação de upload, fila independente do navegador, até **3 tentativas por foto**, OMR geométrico clássico **SEM IA**, revisão humana com auditoria e progresso/erros.
- Fotos produzem **contagens históricas**, não sobrescrevem o estoque vigente. **Nenhuma atualização automática no Bling** sem confirmação explícita pelo fluxo canônico.

## 3. Trabalho já feito — NÃO refazer
- **R1:** impressão/cards/gôndolas; Code128, QR, quatro fiduciais, seis balanços e leitura digital 203 dpi.
- **R2:** OMR digital com rotação, perspectiva, sombras e desfoque, fallback QR no raster completo, rejeição segura de leituras incertas.
- **R3:** envio 10/50/100, upload assinado, retomada no mesmo lote e função transacional de reserva sem ultrapassar capacidade.
- **R4:** worker Deno, processamento independente, locks `SKIP LOCKED`, lease/token, recuperação e máximo três tentativas, 100 registros com quatro workers PostgreSQL simultâneos.
- **R5:** revisão e auditoria com valores 0–99, rejeição/correção, histórico sob demanda, ACL/RLS, indicadores e controles mobile.
- **R6:** Supabase CLI **local** real e descartável: Auth, Storage privado/PostgREST, 10+50+100=160 uploads reais assinados, deduplicação, fila processada pelo worker, QR e seis OMR reais em imagem DIGITAL, um evento de revisão. Isso **não é homologação física ou Edge hospedado**.
- **R7:** regressões de balanço A4, alternância com a aba de fotos e corrida de polling; confirmação de upload CAS concorrente, Chrome mobile, Deno e CI 6/6 verde na evidência [#37954882564](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37954882564).
- **R8 (EM PREPARAÇÃO, não publicada):** bibliotecas QR/Code128 locais (sem CDN), testes de impressão offline, plano de migração/rollback, manifesto de gates, fingerprint do código que invalida evidências físicas/remotas após mudanças. Os testes cresceram para 74 determinísticos na última execução concluída. **Nunca converter preparação em deploy por conta própria.**

## 4. DOCUMENTOS MAIS IMPORTANTES
1. `docs/projects/DA6_RODADA_07_REGRESSOES_SEGURANCA_CONCLUIDA_2026-10-09.md` — auditoria/regressões A4/concorrência.
2. `docs/projects/DA6_RODADA_08_PREPARACAO_RELEASE_2026-10-09.md` — procedimentos, riscos, reversão.
3. `docs/projects/DA6_RODADA_08_FINGERPRINT_RELEASE_SEGURO_2026-10-09.md` — SHA/fingerprint e últimas evidências 74 testes.
4. `docs/projects/DA6_RELEASE_GATES_2026-10-09.json` — **fonte de verdade do bloqueio de release**; `release_status: blocked`, `release_candidate_fingerprint: null`.
5. `docs/projects/DA6_QA_PROTOCOLO_FISICO_PENDENTE_2026-10-09.md` — ensaio físico 203 dpi e fotos reais, critérios zero falso positivo.
6. `.github/workflows/da6-inventory-labels-ci.yml`, `scripts/da6-release-gate.mjs`, `scripts/da6-release-fingerprint.mjs` — testes e proteções.
7. Checkpoints detalhados R1–R6 sob `docs/projects/DA6_RODADA_0*.md`.

## 5. Pendências reais antes de publicar
- **Gate físico:** imprimir em impressora térmica real **203 dpi**, papel 100×150 mm; fotografar etiquetas com celular real, anotar quantidades 0/1/7/10/23/99; testar sombra, inclinação, rotação, dupla marca e QR ilegível. Exigir **zero falsas identidades/contagens** e documentar evidências sem dados pessoais.
- **Staging remoto separado:** homologar Edge Function hospedada, Storage, Vault/URL por ambiente, `pg_cron+pg_net`, timeout/memória com lote 100 e teste de rollback. Não usar o Supabase canônico como staging; não criar ambiente pago sem a devida condição/autorizações.
- **Release:** inspecionar a `main` atual; resolver possíveis conflitos concorrentes sem sobrescrever trabalho; tratar CI geral de cestas/pedidos no projeto responsável; confirmar backup, reversão e fingerprint exato da versão física/remotamente homologada.
- **Produção:** só após TODOS os gates aprovados de maneira verificável: aplicar migrações em ordem segura, distribuir Edge/Admin com liberação gradual, observar logs/erros/consumo, confirmar A4 e estoque/Bling intactos. Depois relatório final e **desativar a automação horária**, nunca antes.

## 6. Procedimento para a próxima janela / próximo agente
1. Leia integralmente ESTE handoff e os documentos do item 4 via conector GitHub.
2. Consulte `main`, HEAD da branch, PR #987 e CI #37970953744 (ou execução mais recente); recupere SHA **antes de qualquer gravação**.
3. **Não continue da R7 como se estivesse pendente:** R7 já foi encerrada; R8 é preparação de release com bloqueios físicos/remotos. Priorize concluir as verificações seguras possíveis, corrigir regressões encontradas e preparar homologação, sem afirmar que o sistema está publicado.
4. Faça commits pequenos na branch `agent/*`; não substituir arquivos enormes de outros projetos e não fazer deploy/migrações de produção prematuras.
5. Rode os seis jobs do CI até verde; confira `node scripts/da6-release-gate.mjs --report` e saiba que `--enforce` **deve falhar** enquanto faltarem provas. Não forjar evidências nem marcar o manifesto como aprovado.
6. Mantenha a tarefa horária ativa, preservando o estado para a próxima execução; só desative quando o release estiver plenamente homologado/publicado e entregar relatório final.

## 7. Comando de retomada
> Continue o projeto DA6 Etiquetas e Balanço da Dona Antônia no repositório GitHub `osvaldosereia/SUCEDOAN12`. **Primeiro leia INTEIRAMENTE** `docs/projects/HANDOFF_DA6_CONTINUACAO_JANELA_2026-10-09.md` na branch `agent/gondola-labels-balance-20261009`; leia também R7, R8, manifesto de gates e protocolo de QA físico, confira main/PR #987/CI. Atue como engenheiro sênior autônomo, trabalhe com commits pequenos, teste e documente. **R1–R7 já concluídas em código e CI; R8 em preparação, release bloqueado por fotos/impressão físicas e staging Edge/cron hospedado. Não publicar nem mexer em estoque/Bling sem homologação segura.** Continue os ajustes seguros e informe impedimentos reais, sem pedir confirmações operacionais intermediárias.

**Nota:** valores de ahead/behind, SHA e CI são fotografia do instante do handoff; sempre revalidar, porque há automação e outras gravações.
