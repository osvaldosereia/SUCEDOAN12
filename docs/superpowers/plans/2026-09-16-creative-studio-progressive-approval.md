# Estúdio Criativo Progressive Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar briefing variável, revisão textual e geração/aprovação sequencial de frames no Estúdio Criativo.

**Architecture:** Reusar projetos/keyframes atuais, ampliar o contrato do Diretor para fases de revisão e tornar a UI uma máquina de estados. Imagens permanecem em função separada e só aceitam como referência um frame aprovado.

**Tech Stack:** HTML/CSS/JS Admin, Supabase Edge Functions/Deno, PostgreSQL, OpenAI.

**Spec:** `docs/superpowers/specs/2026-09-16-creative-studio-progressive-approval-design.md`

## Global Constraints
- Durações: 10,20,30,40,50,60 segundos.
- Frame a cada 5 segundos: duration/5 + 1.
- Nunca gerar imagens em lote.
- Próxima imagem usa somente frame anterior aprovado.
- Mobile-first e desktop responsivo.

---

### Task 1: Contrato e testes
**Files:** Modify `tests/creative-studio-admin-contract.test.mjs`; test Edge Functions.
- [ ] Escrever testes falhando para duração variável, áudio, tema, revisão, descrição textual e aprovação frame a frame.
- [ ] Executar testes e confirmar falha.
- [ ] Definir contratos de ações `create_story`, `revise_story`, `approve_story`, `revise_storyboard`, `approve_storyboard`, `revise_frame_plan`.
- [ ] Executar testes de contrato.
- [ ] Commit.

### Task 2: Diretor criativo multiestágio
**Files:** Modify `supabase/functions/creative-storyboard-director/index.ts`.
- [ ] Validar duration_seconds e audio_mode.
- [ ] Gerar história proporcional à duração e keyframes dinâmicos.
- [ ] Implementar revisão de história por comentário sem imagens.
- [ ] Implementar storyboard textual detalhado.
- [ ] Implementar revisão de continuidade futura por comentário de frame.
- [ ] Testar JSON e limites.
- [ ] Commit.

### Task 3: Persistência do workflow
**Files:** Modify `supabase/functions/creative-storyboard-projects/index.ts`; add migration if required.
- [ ] Persistir briefing, workflow_state, aprovações, comentários e métricas de geração.
- [ ] Garantir leitura de projetos antigos com defaults compatíveis.
- [ ] Implementar ações de aprovação idempotentes.
- [ ] Testar retomada de projeto.
- [ ] Commit.

### Task 4: Geração visual sequencial
**Files:** Modify `supabase/functions/creative-storyboard-image/index.ts`.
- [ ] Recusar geração de frame N quando N-1 não estiver aprovado.
- [ ] Gerar somente um frame por chamada.
- [ ] Registrar tentativa/regeneração.
- [ ] Fixar Visual Bible após aprovação do primeiro frame e usar nos posteriores.
- [ ] Testar continuidade e erro seguro.
- [ ] Commit.

### Task 5: Tela única responsiva
**Files:** Modify `admin/creative-studio.html`, `admin/creative-studio.css`, `admin/creative-studio.js`.
- [ ] Criar briefing com duração, áudio, IA/manual, tema e comentários.
- [ ] Criar revisão/aprovação da história.
- [ ] Exibir storyboard textual antes de qualquer imagem.
- [ ] Criar card destacado do próximo frame com Aprovar, Regenerar e Sugerir alteração.
- [ ] Criar progresso `Frame X de Y` e métricas de custo/gerações.
- [ ] Adaptar layout mobile/desktop e manter busca explícita.
- [ ] Commit.

### Task 6: Pacotes Gemini dinâmicos
**Files:** Modify Diretor/UI.
- [ ] Gerar duration/10 pacotes de 10s.
- [ ] Adaptar prompt para locução ou trilha/SFX.
- [ ] Liberar pacote apenas com referências aprovadas.
- [ ] Testar 10s e 60s.
- [ ] Commit.

### Task 7: Verificação e publicação
- [ ] Rodar contrato do Estúdio e suíte Admin.
- [ ] Compilar Edge Functions.
- [ ] Publicar funções no Supabase.
- [ ] Abrir PR, revisar diff e CI.
- [ ] Mesclar somente após verificação objetiva.
