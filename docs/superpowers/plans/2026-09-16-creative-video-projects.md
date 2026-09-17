# Creative Video Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o Estúdio Criativo em projetos editáveis com arsenal curável, versões e ajustes incrementais, preparando composição profissional.

**Architecture:** O projeto persistido vira a fonte de verdade e os jobs de render passam a representar versões. Assets são captados numa biblioteca global e vinculados/curados por projeto antes da composição. Feedback cria deltas sobre uma versão, preservando cenas e assets não afetados.

**Tech Stack:** Supabase PostgreSQL/Storage/Edge Functions, Admin HTML/CSS/JS, Node 22, FFmpeg; Remotion na etapa de compositor após validação do projeto/arsenal.

**Spec:** `docs/superpowers/specs/2026-09-16-creative-video-projects-design.md`

## Global Constraints
- Produto real nunca pode ser substituído por asset externo.
- Render final 1080x1920, 30 fps, 15–25 s.
- Pack IA 3x3 é complementar.
- Assets devem manter origem/licença/metadados.
- Ajustes criam nova versão e preservam partes não afetadas.
- Worker FFmpeg atual permanece operacional durante a evolução.

---

### Task 1: Persistência de projeto editável
**Files:** Create migration SQL; modify/create tests de contrato do schema.
**Interfaces:** Produces tabelas `creative_video_projects`, `creative_video_project_scenes`, `creative_video_project_assets`, `creative_video_versions`, `creative_video_feedback`.
- [ ] Escrever teste RED que consulta presença/colunas/constraints das cinco tabelas.
- [ ] Executar e confirmar falha por tabelas ausentes.
- [ ] Criar migration idempotente com UUIDs, timestamps, estados, JSONB de snapshots, FKs e índices.
- [ ] Aplicar migration no Supabase principal.
- [ ] Executar teste/SQL de verificação e confirmar tabelas/constraints.
- [ ] Commitar migration e teste.

### Task 2: API de projetos e versões
**Files:** Create `supabase/functions/creative-video-projects-v1/index.ts`; create contract test.
**Interfaces:** Consumes tabelas Task 1; Produces actions `create`, `get`, `update`, `add_assets`, `curate_asset`, `create_version`, `feedback`, `list_versions`.
- [ ] Escrever teste RED para autenticação Admin, ações e preservação de snapshots.
- [ ] Implementar Edge Function com validação owner/operator e service-role interno.
- [ ] Testar criação, leitura e versão incremental.
- [ ] Deploy no projeto `ssbesxgaijknwsjbsbcz`.
- [ ] Commitar.

### Task 3: Arsenal por projeto
**Files:** Modify `creative-studio-assets-v1`; modify Admin Creative Studio; tests.
**Interfaces:** Consumes project id; Produces candidatos classificados e persistidos em `creative_video_project_assets`.
- [ ] Escrever teste RED para `search_more`, score, origem/licença e proteção de packshot.
- [ ] Implementar busca em biblioteca interna primeiro e adaptadores web permitidos depois, deduplicando candidatos.
- [ ] Persistir metadados sem copiar conteúdo quando a licença não permitir armazenamento local.
- [ ] Implementar `Buscar mais` sem apagar seleção anterior.
- [ ] Testar proteção de produto e deduplicação.
- [ ] Commitar.

### Task 4: Curadoria visual no Admin
**Files:** Modify `admin/creative-studio.html`, `.css`, `.js`; modify admin contract test.
**Interfaces:** Consumes arsenal Task 3; Produces estados selected/rejected/candidate.
- [ ] Escrever teste RED para seção “Arsenal desta produção”, miniaturas e botões Buscar mais/Selecionar/Descartar/Gerar pack IA.
- [ ] Implementar cards mobile-first com status de busca e contadores.
- [ ] Bloquear Renderizar enquanto requisitos essenciais estiverem pendentes.
- [ ] Testar fluxo produto -> história -> arsenal -> curadoria.
- [ ] Commitar.

### Task 5: Pack IA 3x3 complementar
**Files:** Create Edge Function/helper de geração e processamento; tests.
**Interfaces:** Consumes lacunas semânticas do arsenal; Produces até 9 assets individualizados e descritos.
- [ ] Escrever teste RED para manifesto 3x3, nove slots e metadados semânticos.
- [ ] Implementar planejamento dos nove elementos sem incluir produto/logo.
- [ ] Gerar uma única folha quadrada quando aprovada/necessária.
- [ ] Separar quadrantes, validar transparência/qualidade e persistir cada asset com descrição/tags.
- [ ] Testar reaproveitamento em busca futura.
- [ ] Commitar.

### Task 6: Compositor Remotion + FFmpeg
**Files:** Create focused Remotion composition package; modify worker; tests.
**Interfaces:** Consumes project/version snapshot; Produces MP4 final e metadata de composição.
- [ ] Escrever teste RED para cenas, layers, easing, parallax, overlays, SFX e packshot protegido.
- [ ] Implementar composição vertical parametrizada sem remover fallback FFmpeg atual.
- [ ] Integrar assets selecionados e procedural layers.
- [ ] Renderizar piloto 1080x1920/30fps/15–25s.
- [ ] Comparar tecnicamente com fallback e confirmar arquivo reproduzível.
- [ ] Commitar.

### Task 7: Ajustes incrementais e histórico
**Files:** Modify projects API/Admin/worker; tests.
**Interfaces:** Consumes feedback sobre versão; Produces delta e nova versão.
- [ ] Escrever teste RED: feedback em cena 2 preserva cenas 1/3 e assets fixados.
- [ ] Implementar interpretação estruturada do feedback.
- [ ] Criar nova versão sem mutar snapshot anterior.
- [ ] Adicionar Admin “Pedir ajuste” + histórico de versões + assistir versões.
- [ ] Testar correção parcial e rollback visual por versão.
- [ ] Commitar.

### Task 8: Gate de qualidade e piloto publicável
**Files:** Create quality validator; modify Admin status; tests.
**Interfaces:** Consumes version/render metadata; Produces score factual por dimensão e blockers técnicos.
- [ ] Escrever teste RED para história, composição, movimento, áudio, produto e fechamento.
- [ ] Implementar checks determinísticos + revisão criativa assistida por IA dentro do orçamento.
- [ ] Bloquear status final quando houver falha técnica crítica; permitir revisão humana quando for estética.
- [ ] Renderizar piloto completo e revisar visualmente.
- [ ] Corrigir via fluxo incremental, não recriar projeto.
- [ ] Confirmar workflow/testes/deploy antes de marcar etapa concluída.
- [ ] Commitar.
