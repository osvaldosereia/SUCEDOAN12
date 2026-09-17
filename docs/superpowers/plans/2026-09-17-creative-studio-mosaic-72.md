# Mosaico 72 Frames por 10s Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir o modo `mosaic_6x6` para 72 frames por 10 segundos, usando dois mosaicos 6x6 sequenciais por bloco, resolução quadrada máxima suportada e microtransições muito menores.

**Architecture:** O Diretor planeja `duration/5` mosaicos; cada mosaico contém 36 microframes e representa 5 segundos. O gerador cria os mosaicos em sequência e recebe o mosaico anterior como referência de continuidade, usando sua célula 36 como âncora para a célula 1 seguinte. O Admin persiste as URLs no plano, recorta cada grade com limites inteiros, concatena todos os frames e monta um vídeo silencioso de 7,2 fps efetivos.

**Tech Stack:** JavaScript do Admin, Supabase Edge Functions, OpenAI GPT Image 2.5 Sunburst Low, Supabase Storage, Canvas/MediaRecorder.

**Spec:** Aprovado em chat em 2026-09-17.

## Global Constraints
- 72 frames a cada 10 segundos.
- 36 frames por mosaico 6x6.
- 2 mosaicos sequenciais por bloco de 10 segundos.
- `quality=low`.
- maior resolução quadrada suportada; tentar 2160x2160 com fallback seguro.
- microtransições: nenhuma mudança brusca entre células vizinhas.
- mosaico anterior é referência visual do seguinte.
- vídeo final sem áudio.
- projetos precisam reabrir com mosaicos já gerados.
- modos `full`, `product_only` e `institutional` não podem regredir.

---

### Task 1: Contrato 72/10
**Files:** Modify `tests/creative-studio-admin-contract.test.mjs`.
- [ ] Escrever contrato para 72 frames/10s, 2 mosaicos/10s, resolução máxima e continuidade.
- [ ] Confirmar RED em CI.

### Task 2: Diretor
**Files:** Modify `supabase/functions/creative-storyboard-director/index.ts`.
- [ ] Planejar `mosaic_count=duration/5`.
- [ ] Gerar 36 microframes por mosaico, com `global_frame`, `start_second`, `end_second`.
- [ ] Reforçar microtransições e continuidade entre mosaicos.

### Task 3: Gerador de imagem
**Files:** Modify `supabase/functions/creative-storyboard-image/index.ts`.
- [ ] Aceitar `mosaic_index` e `previous_mosaic_url`.
- [ ] Tentar 2160x2160, depois fallbacks quadrados.
- [ ] Usar célula 36 do mosaico anterior como âncora conceitual para a próxima grade.
- [ ] Preservar integralmente o fluxo normal de frames.

### Task 4: Admin e persistência
**Files:** Modify `admin/creative-studio.js`; Modify `admin/creative-studio-mosaic.js`; Modify `admin/creative-studio-persistence.js`; Modify `admin/creative-studio-ui-helpers.js`; Modify `admin/creative-studio.html`.
- [ ] Gerar mosaicos um por vez e salvar cada URL no plano.
- [ ] Retomar projeto do ponto salvo.
- [ ] Recortar com limites `Math.round` para evitar falhas de 1024/6 e equivalentes.
- [ ] Concatenar todos os frames e montar vídeo silencioso em 1080x1080.
- [ ] Ocultar pacotes Gemini no modo mosaico.

### Task 5: Exclusão e produção
**Files:** Modify `supabase/functions/creative-storyboard-projects/index.ts`.
- [ ] Limpar arquivos do projeto no bucket ao excluir.
- [ ] Manter todas as ações atuais da função.

### Task 6: Verificação e deploy
- [ ] Rodar CI completa no PR.
- [ ] Integrar somente com todos os workflows verdes.
- [ ] Publicar as três Edge Functions completas com `verify_jwt=true`.
- [ ] Verificar versões ACTIVE no Supabase.
