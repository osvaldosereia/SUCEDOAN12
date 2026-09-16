# Stop Motion Asset Bank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um banco reutilizável de elementos gratuitos/CC0 para o motor de vídeos stop motion em massinha, cobrindo os segmentos reais dos produtos ativos da Dona Antônia.

**Architecture:** O Supabase mantém catálogo normalizado de fontes, packs, segmentos e assets. O pipeline importa somente fontes com licença comercial clara, priorizando CC0; os binários permanecem associados por URL/path e podem ser materializados para Storage quando o ingestor estiver ativo. O motor de vídeo consulta esse catálogo para reutilizar assets antes de pedir geração por IA.

**Tech Stack:** Supabase PostgreSQL, TypeScript/Deno, GitHub, fontes CC0 (Kenney, Quaternius, Poly Haven, OpenGameArt selecionado).

**Spec:** Este plano.

## Global Constraints

- Estilo-alvo inicial: `massinha_v1`.
- Não importar automaticamente assets com licença ambígua ou que exija atribuição sem registro explícito.
- Dados comerciais reais de produto/preço nunca devem ser gerados visualmente por IA; entram programaticamente no card final.
- Reutilizar asset existente antes de gerar novo asset por IA.

---

### Task 1: Catálogo SQL

**Files:**
- Supabase migration: `create_stopmotion_asset_catalog`

**Interfaces:**
- Produces: tabelas `stopmotion_asset_sources`, `stopmotion_asset_packs`, `stopmotion_product_segments`, `stopmotion_asset_segment_map`, `stopmotion_assets`.

- [x] **Step 1:** Criar tabelas e índices.
- [x] **Step 2:** Ativar RLS nas novas tabelas.
- [x] **Step 3:** Popular fontes e packs CC0 iniciais.
- [x] **Step 4:** Derivar segmentos diretamente de `public.products` ativos.

### Task 2: Manifesto de fontes aprovadas

**Files:**
- Create: `marketing/stopmotion/assets/sources.json`
- Create: `marketing/stopmotion/assets/README.md`

**Interfaces:**
- Consumes: fontes aprovadas no Supabase.
- Produces: manifesto versionado para o ingestor.

- [ ] **Step 1:** Registrar Kenney Food Kit e Mini Market.
- [ ] **Step 2:** Registrar Quaternius Ultimate Food e Junk Food.
- [ ] **Step 3:** Registrar OpenGameArt Cooking Assets.
- [ ] **Step 4:** Registrar Poly Haven como fonte complementar CC0.
- [ ] **Step 5:** Documentar regras de licença e cache local.

### Task 3: Ingestor e normalizador

**Files:**
- Create: `marketing/stopmotion/assets/ingest.ts`
- Create: `marketing/stopmotion/assets/types.ts`
- Test: `marketing/stopmotion/assets/ingest.test.ts`

**Interfaces:**
- Consumes: `sources.json`.
- Produces: registros normalizados para `stopmotion_assets` e arquivos baixados quando houver destino de Storage configurado.

- [ ] **Step 1:** Escrever teste de rejeição para licença não aprovada.
- [ ] **Step 2:** Implementar whitelist `CC0`.
- [ ] **Step 3:** Escrever teste de normalização de tags/categorias.
- [ ] **Step 4:** Implementar normalização.
- [ ] **Step 5:** Escrever teste de idempotência por `asset_key`.
- [ ] **Step 6:** Implementar upsert idempotente.

### Task 4: Cobertura por segmento

**Files:**
- Create: `marketing/stopmotion/assets/segment-coverage.ts`
- Test: `marketing/stopmotion/assets/segment-coverage.test.ts`

**Interfaces:**
- Consumes: segmentos derivados dos produtos e assets catalogados.
- Produces: cobertura `primary`, `supporting`, `missing` por grupo.

- [ ] **Step 1:** Mapear Mercearia para food/cooking/market.
- [ ] **Step 2:** Mapear Casa e Utilidades para cooking/market.
- [ ] **Step 3:** Mapear Limpeza/Lavanderia para household/market e marcar embalagem específica como `missing`.
- [ ] **Step 4:** Mapear Beleza/Higiene/Cabelos/Bebê/Pets/Calçados para props/cenários e assets próprios de produto.
- [ ] **Step 5:** Gerar relatório de lacunas antes de qualquer geração por IA.

### Task 5: Integração com Motor Massinha V1

**Files:**
- Create: `marketing/stopmotion/assets/resolver.ts`
- Test: `marketing/stopmotion/assets/resolver.test.ts`

**Interfaces:**
- Produces: `resolveAssetsForScene(sceneRequirements)` com prioridade: asset local > pack CC0 > asset de produto > geração IA.

- [ ] **Step 1:** Testar prioridade de reutilização.
- [ ] **Step 2:** Implementar resolver.
- [ ] **Step 3:** Testar fallback para IA apenas quando não houver cobertura.
- [ ] **Step 4:** Registrar telemetria de asset reutilizado vs. gerado.

### Task 6: Verificação

- [ ] **Step 1:** Rodar testes do módulo.
- [ ] **Step 2:** Conferir contagem de segmentos e packs no Supabase.
- [ ] **Step 3:** Validar URLs e licenças das fontes aprovadas.
- [ ] **Step 4:** Rodar advisors do Supabase após mudanças de schema.
- [ ] **Step 5:** Abrir PR com relatório de cobertura e lacunas.
