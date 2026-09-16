# Creative Studio Render Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Processar jobs `queued` do Estúdio Criativo e produzir MP4 vertical real em `creative-studio-renders`.

**Architecture:** Um worker Node executado por GitHub Actions chama as RPCs transacionais já existentes para claim/complete/fail, baixa o packshot real, compõe um vídeo 1080x1920/30fps com FFmpeg e SFX procedurais locais, envia o MP4 ao Supabase Storage e conclui o job. O worker processa no máximo um job por execução para manter custo e concorrência previsíveis.

**Tech Stack:** Node.js 22, FFmpeg no GitHub Actions, Supabase REST/RPC/Storage, GitHub Actions.

**Spec:** `docs/superpowers/plans/2026-09-16-creative-studio-render-worker.md`

## Global Constraints

- Duração do vídeo: 15–25 segundos.
- Resolução: 1080x1920.
- FPS: 30.
- Sem narração/voz.
- Produto real sempre usa o packshot cadastrado.
- Efeitos e SFX procedurais não usam API paga.
- Chaves Supabase somente via GitHub Actions secrets.
- Um job por execução; RPC de claim com lease para evitar corrida.

---

### Task 1: Contrato do worker

**Files:**
- Create: `tests/creative-studio-render-worker.test.mjs`
- Create: `scripts/creative-studio-render-worker.mjs`

**Interfaces:**
- Consumes: `creative_studio_claim_job(p_worker_id text,p_lease_seconds integer)`.
- Produces: helpers exportados `sanitizeText`, `buildOutputPath`, `buildFfmpegArgs`, `pickPackshotUrl`.

- [ ] **Step 1: Write the failing test**

Validar resolução, FPS, duração, ausência de voz, packshot e caminho MP4 determinístico.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/creative-studio-render-worker.test.mjs`
Expected: FAIL porque o módulo ainda não existe.

- [ ] **Step 3: Write minimal implementation**

Criar helpers puros e CLI que só executa trabalho quando chamado diretamente.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/creative-studio-render-worker.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat: adicionar núcleo do worker do Estúdio Criativo`.

### Task 2: Renderização e ciclo Supabase

**Files:**
- Modify: `scripts/creative-studio-render-worker.mjs`
- Modify: `tests/creative-studio-render-worker.test.mjs`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, RPC claim/complete/fail.
- Produces: MP4 em `creative-studio-renders/<job-id>/final.mp4` e job `completed`.

- [ ] **Step 1: Write the failing test**

Validar que as URLs REST/RPC e payloads usam exatamente os nomes `p_worker_id`, `p_lease_seconds`, `p_job_id`, `p_output_path`, `p_output_metadata`, `p_actual_cost_brl` e `p_error`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/creative-studio-render-worker.test.mjs`
Expected: FAIL nos helpers de payload ainda ausentes.

- [ ] **Step 3: Write minimal implementation**

Implementar claim, download do packshot, FFmpeg com movimento e SFX procedurais, upload Storage, complete e fail.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/creative-studio-render-worker.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat: renderizar jobs do Estúdio Criativo com FFmpeg`.

### Task 3: Automação GitHub Actions

**Files:**
- Create: `.github/workflows/creative-studio-render-worker.yml`
- Modify: `tests/creative-studio-render-worker.test.mjs`

**Interfaces:**
- Consumes: GitHub Secrets `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
- Produces: execução manual e agendada do worker.

- [ ] **Step 1: Write the failing test**

Validar que o workflow possui `workflow_dispatch`, schedule, Node 22, verificação do FFmpeg e chamada ao script com secrets por `env`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/creative-studio-render-worker.test.mjs`
Expected: FAIL porque workflow ainda não existe.

- [ ] **Step 3: Write minimal implementation**

Criar workflow com timeout curto e concurrency única para o worker.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/creative-studio-render-worker.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `ci: ativar worker de renderização do Estúdio Criativo`.

### Task 4: Homologação do primeiro MP4

**Files:**
- No code change required unless evidence reveals a defect.

**Interfaces:**
- Consumes: job criado no Admin e colocado em `queued`.
- Produces: `status='completed'`, `output_path` e arquivo MP4 no bucket privado.

- [ ] **Step 1: Confirm deployment and CI**

Verificar o workflow de testes e o deploy do GitHub Pages no commit atual.

- [ ] **Step 2: Queue a real job**

Usar o fluxo real do Admin ou um job de homologação com o mesmo contrato.

- [ ] **Step 3: Run worker**

Confirmar transições `queued -> rendering -> completed`.

- [ ] **Step 4: Verify artifact**

Confirmar arquivo `video/mp4`, tamanho não zero, metadata de 1080x1920, 30fps e duração 15–25s.

- [ ] **Step 5: Only then mark stage complete**

Não declarar a primeira etapa concluída antes da evidência do MP4 real.
