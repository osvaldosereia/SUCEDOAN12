# Mosaico 6x6 Econômico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ao Estúdio Criativo um modo econômico que gere uma única imagem quadrada 6x6, recorte seus 36 quadros em ordem e monte um vídeo simples sem áudio.

**Architecture:** O modo `mosaic_6x6` reutiliza briefing, produto e Diretor existentes. O Diretor produz uma sequência de 36 microframes coerentes; o gerador visual usa Image 2.5 Low para produzir um sprite sheet quadrado. O Admin recorta a imagem em 36 células na ordem esquerda→direita, cima→baixo e monta um vídeo silencioso simples com duração igual à escolhida. O MVP gera um mosaico por projeto; múltiplos mosaicos ficam para evolução posterior.

**Tech Stack:** Admin HTML/CSS/JavaScript existente, Supabase Edge Functions, OpenAI Image 2.5 Low, Canvas/MediaRecorder do navegador quando suportado.

**Spec:** Design aprovado em chat em 2026-09-17.

## Global Constraints
- Grade fixa 6x6 = 36 células.
- Imagem fonte quadrada.
- Qualidade de geração `low`.
- Vídeo final sem áudio.
- Ordem row-major: esquerda→direita e cima→baixo.
- MVP deliberadamente simples: um mosaico por projeto.
- Duração final segue a duração escolhida no Estúdio.
- Não alterar os modos existentes.

---

### Task 1: Contrato do modo mosaico
**Files:** Modify `tests/creative-studio-admin-contract.test.mjs`; Modify `admin/creative-studio.html`; Modify `admin/creative-studio.js`.
- [ ] Escrever teste falhando para `mosaic_6x6`, grade 36 e vídeo silencioso.
- [ ] Confirmar RED.
- [ ] Adicionar opção no seletor e estado mínimo.
- [ ] Confirmar GREEN e commit.

### Task 2: Diretor cria sequência 6x6
**Files:** Modify `supabase/functions/creative-storyboard-director/index.ts`; Test `tests/creative-studio-admin-contract.test.mjs`.
- [ ] Escrever teste falhando para 36 microframes e ordem row-major.
- [ ] Confirmar RED.
- [ ] Fazer o Diretor retornar plano de mosaico com 36 descrições curtas, continuidade e product lock.
- [ ] Confirmar GREEN e commit.

### Task 3: Gerar sprite sheet em Low
**Files:** Modify `supabase/functions/creative-storyboard-image/index.ts`; Modify `admin/creative-studio.js`; Test `tests/creative-studio-admin-contract.test.mjs`.
- [ ] Escrever teste falhando para geração quadrada, `quality=low` e prompt 6x6.
- [ ] Confirmar RED.
- [ ] Adicionar ação de geração de mosaico reutilizando autenticação, Vault, produto e storage existentes.
- [ ] Persistir URL do mosaico e exibir preview/download no Admin.
- [ ] Confirmar GREEN e commit.

### Task 4: Recortar 36 células
**Files:** Create `admin/creative-studio-mosaic.js`; Modify `admin/creative-studio.html`; Test `tests/creative-studio-admin-contract.test.mjs`.
- [ ] Escrever teste falhando para `GRID_SIZE=6`, 36 células e ordem row-major.
- [ ] Confirmar RED.
- [ ] Implementar recorte via Canvas em 36 frames e preview sequencial.
- [ ] Confirmar GREEN e commit.

### Task 5: Montar vídeo silencioso simples
**Files:** Modify `admin/creative-studio-mosaic.js`; Modify `admin/creative-studio.js`; Modify `admin/creative-studio.css`; Test `tests/creative-studio-admin-contract.test.mjs`.
- [ ] Escrever teste falhando para duração escolhida e ausência de áudio.
- [ ] Confirmar RED.
- [ ] Montar vídeo no navegador com Canvas + MediaRecorder, distribuindo os 36 frames uniformemente pela duração.
- [ ] Exibir player e botão de download do vídeo.
- [ ] Confirmar GREEN e commit.

### Task 6: Verificação e integração
- [ ] Rodar contratos do Estúdio e workflows existentes.
- [ ] Confirmar que modos completo, rápido e institucional continuam funcionando.
- [ ] Revisar mobile.
- [ ] Abrir PR e só integrar com CI verde.
