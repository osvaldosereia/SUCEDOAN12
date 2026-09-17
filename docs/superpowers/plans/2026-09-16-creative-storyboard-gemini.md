# Creative Storyboard Gemini Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o Estúdio Criativo em diretor de histórias sociais que gera keyframes 9:16 encadeados e três pacotes de prompts para uso manual no Gemini.

**Architecture:** Reaproveitar projetos editáveis existentes, acrescentando seleção múltipla e persistência de keyframes/pacotes. Uma Edge Function de storyboard orquestra conceito e prompts; uma Edge Function de imagem chama GPT Image 2.5 Sunburst low e usa o frame anterior como referência. O Admin deixa de enfileirar MP4 e passa a editar/baixar storyboard.

**Tech Stack:** HTML/CSS/JavaScript Admin, Supabase PostgreSQL + Edge Functions Deno/TypeScript, OpenAI Images API, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-16-creative-storyboard-gemini-design.md`

## Global Constraints
- GPT Image 2.5 Sunburst em qualidade `low`.
- Keyframes verticais 9:16, padrão 30s em 0/5/10/15/20/25/30.
- Cada frame N>0 usa o frame N-1 como referência.
- Nenhuma chave OpenAI no browser.
- Não chamar API de vídeo Gemini/Veo.
- Preservar tabelas/worker MP4 antigos para rollback nesta fase.

---

### Task 1: Persistência de produtos, keyframes e pacotes
**Files:** Create `supabase/migrations/20260916223000_creative_storyboards.sql`; Test `tests/creative-storyboard-schema.test.mjs`.
**Interfaces:** Produces project products, keyframes and Gemini packages addressable by project id and timestamp.
- [ ] Escrever teste de contrato exigindo tabelas/colunas, índices e RLS para seleção múltipla, keyframes e pacotes.
- [ ] Rodar `node --test tests/creative-storyboard-schema.test.mjs` e confirmar falha.
- [ ] Criar migração aditiva: `creative_video_project_products(project_id, product_id, product_snapshot, role, sort_order)`, `creative_storyboard_keyframes(project_id, second_mark, prompt, continuity_lock, image_path, image_url, status, provider_usage, actual_cost_brl)` com unique `(project_id,second_mark)`, e `creative_storyboard_gemini_packages(project_id, package_index, start_second, middle_second, end_second, prompt)` com unique `(project_id,package_index)`; habilitar RLS e índices por projeto.
- [ ] Rodar teste e confirmar PASS.
- [ ] Commit `feat: persist creative storyboard keyframes`.

### Task 2: Diretor social e contrato de história
**Files:** Create `supabase/functions/creative-storyboard-director/index.ts`; Test `tests/creative-storyboard-director.test.mjs`.
**Interfaces:** Consumes `{products, duration_seconds, alternate, recent_memory}`; Produces `{concept, continuity_bible, keyframes, gemini_packages}`.
- [ ] Escrever teste exigindo múltiplos produtos, três candidatos internos, hook, emotion, payoff, organic CTA, craft style, 7 keyframes para 30s e três pacotes sobrepostos.
- [ ] Confirmar teste FAIL.
- [ ] Implementar prompt de sistema que prioriza história/retention, proíbe estética publicitária convencional como padrão, exige integração natural de produto e estilos artesanais não realistas; validar JSON estruturalmente antes de responder.
- [ ] Implementar composição determinística dos timestamps `0..duration` em passos de 5 e pacotes de 10s sobrepostos.
- [ ] Rodar teste e confirmar PASS.
- [ ] Commit `feat: add social creative storyboard director`.

### Task 3: Gerador de keyframes Image 2.5 Low
**Files:** Create `supabase/functions/creative-storyboard-image/index.ts`; Test `tests/creative-storyboard-image.test.mjs`.
**Interfaces:** Consumes `{project_id, second_mark, visual_prompt, continuity_lock, previous_image_url?, product_images[]}`; Produces persisted keyframe with provider usage.
- [ ] Escrever teste que rejeita model/quality diferentes do contrato, exige 9:16 e exige referência anterior quando `second_mark > 0`.
- [ ] Confirmar teste FAIL.
- [ ] Implementar chamada server-side ao modelo GPT Image 2.5 Sunburst com `quality: low`; primeiro frame usa briefing/produtos, demais incluem frame anterior como referência e continuity lock.
- [ ] Salvar imagem em storage do projeto, persistir status/URL/uso/custo retornado e mensagens de erro sem expor segredo.
- [ ] Rodar teste e confirmar PASS.
- [ ] Commit `feat: generate chained low-cost storyboard frames`.

### Task 4: Seleção múltipla no Admin
**Files:** Modify `admin/creative-studio.html`, `admin/creative-studio.js`, `admin/creative-studio.css`; Test `tests/creative-studio-admin-contract.test.mjs`.
**Interfaces:** Consumes product search from `admin-core-v1`; Produces `selectedProducts[]` and director request.
- [ ] Atualizar teste para exigir busca persistente, cards removíveis de múltiplos produtos e ausência da antiga limitação de produto único.
- [ ] Confirmar FAIL.
- [ ] Trocar estado `product` por `selectedProducts`, permitir adicionar resultados sem fechar busca, impedir duplicados e permitir remover individualmente.
- [ ] Atualizar direção criativa para enviar snapshots de todos os selecionados.
- [ ] Rodar teste e confirmar PASS.
- [ ] Commit `feat: select multiple products in creative studio`.

### Task 5: Timeline de 7 keyframes
**Files:** Modify `admin/creative-studio.html`, `admin/creative-studio.js`, `admin/creative-studio.css`; Test `tests/creative-studio-admin-contract.test.mjs`.
**Interfaces:** Consumes director keyframe plan and image endpoint; Produces interactive storyboard timeline.
- [ ] Escrever contrato exigindo timestamps, estados planned/generating/ready/error, gerar storyboard e regenerar frame individual.
- [ ] Confirmar FAIL.
- [ ] Implementar timeline 0/5/10/15/20/25/30, geração sequencial (nunca paralela) para garantir referência anterior e atualização visual de progresso.
- [ ] Implementar regeneração unitária e marcação visual dos frames posteriores como continuidade a revisar.
- [ ] Rodar teste e confirmar PASS.
- [ ] Commit `feat: add chained storyboard timeline`.

### Task 6: Três pacotes Gemini
**Files:** Modify `admin/creative-studio.html`, `admin/creative-studio.js`, `admin/creative-studio.css`; Test `tests/creative-studio-admin-contract.test.mjs`.
**Interfaces:** Consumes ready keyframes + package prompts; Produces packages 0/5/10, 10/15/20, 20/25/30.
- [ ] Escrever teste exigindo exatamente três pacotes para 30s, três imagens em cada, botão copiar prompt e ações de imagem.
- [ ] Confirmar FAIL.
- [ ] Renderizar cartões de pacote com labels Início/Meio/Fim e prompt completo; usar Clipboard API com fallback seguro.
- [ ] Remover da ação principal `Renderizar vídeo`, player MP4 e polling de render do novo fluxo; manter código/worker legado fora do caminho principal para rollback.
- [ ] Rodar teste e confirmar PASS.
- [ ] Commit `feat: deliver Gemini storyboard packages`.

### Task 7: Projetos recentes e retomada
**Files:** Modify/create project API used by Studio; Modify `admin/creative-studio.js`; Test `tests/creative-storyboard-projects.test.mjs`.
**Interfaces:** Consumes persisted project state; Produces resumable storyboard projects.
- [ ] Escrever teste para criar/listar/abrir projeto preservando produtos, conceito, keyframes e prompts.
- [ ] Confirmar FAIL.
- [ ] Adaptar projetos recentes para exibir história/storyboard, status e custo acumulado em vez de jobs MP4.
- [ ] Permitir retomar projeto sem regenerar imagens prontas.
- [ ] Rodar teste e confirmar PASS.
- [ ] Commit `feat: resume creative storyboard projects`.

### Task 8: Verificação integrada
**Files:** Modify `.github/workflows/test-v3.yml` somente se necessário para incluir novos testes.
**Interfaces:** Consumes all prior tasks; Produces deployable main branch state.
- [ ] Rodar `node --test tests/creative-storyboard-schema.test.mjs tests/creative-storyboard-director.test.mjs tests/creative-storyboard-image.test.mjs tests/creative-studio-admin-contract.test.mjs tests/creative-storyboard-projects.test.mjs`.
- [ ] Rodar a suíte Creative Studio existente e verificar que compatibilidade/rollback não foi quebrada.
- [ ] Verificar estaticamente que `admin/` não contém chave OpenAI e que o novo fluxo não chama Veo/Gemini API.
- [ ] Conferir manualmente no Admin: buscar dois produtos, criar história, gerar 7 frames sequenciais, regenerar um frame e copiar os três prompts.
- [ ] Commit final somente se houver ajustes de verificação: `test: verify Gemini storyboard creative studio`.