# Resumo de respostas interativas na inbox — Plano

> Execução inline autorizada no contexto do projeto; sem teste automatizado ou side effect externo.

**Objetivo:** mostrar respostas de lista e de Flow sem abrir payload bruto na conversa.

**Arquitetura:** o adapter server-only converte metadados em resumo escalar allowlisted; a UI server-rendered usa esse resumo quando aplicável. O adapter mascara `text_body` de `interactive`, `button` e `order` nas bolhas e na fila. Para `nfm_reply`, entrega somente texto fixo.

**Tech stack:** TypeScript, Server Component Next.js já existente, Supabase Edge/RPC apenas para leitura.

**Spec:** `docs/superpowers/specs/2026-10-27-attendance-interactive-summary-design.md`.

## Restrições globais

- Nunca passar `metadata`, `response_json`, IDs ou payloads de resposta para a UI.
- Renderizar `list_reply.title` somente como texto React, removendo `Cc`/`Cf` e limitando em 160 caracteres.
- Renderizar NFM com a string constante “Resposta do Flow recebida”; descartar `text_body` nessa resposta.
- No adapter, mascarar `text_body` para `interactive`, `button` e `order` antes do RSC payload; na fila decidir pelo tipo antes de qualquer texto livre.
- Não alterar envio interativo, pedidos, RPC remota, schema, Edge Functions ou integrações.

## Foco da revisão

- `metadata` nulo/malformado: não falha; mantém rótulo genérico.
- `list_reply` sem título: mantém rótulo genérico, sem expor ID.
- `nfm_reply` com corpo textual: nenhum conteúdo de resposta aparece na bolha.
- Preview com tipo `interactive`, `button` ou `order`: não inclui `last_message_text` bruto.
- Interação desconhecida: não é inferida como Flow/lista.
- Fluxos, produtos e origens diferentes permanecem separados em “Pedidos pelo WhatsApp”.

## Tarefa 1 — projeção segura no adapter

**Arquivos:** modificar `src/lib/supabase/admin-attendance.ts`.

- [x] Acrescentar `interactiveSummary: string | null` a `AttendanceMessage`.
- [x] Implementar helper privado que reconhece somente `metadata.interactive.type === "list_reply"` (título higienizado, máximo 160) e `type === "nfm_reply"` (texto fixo).
- [x] Em `toMessage`, projetar `row.metadata` via helper; para NFM/lista e tipos `interactive/button/order`, omitir `text_body`; nunca devolver o objeto de metadata.
- [x] Em `toQueueItem`, substituir `last_message_text` por sentinel para tipos `interactive/button/order` antes de passar props ao componente.

## Tarefa 2 — renderização simples na inbox

**Arquivos:** modificar `src/app/(admin)/atendimento/workspace.tsx`.

- [x] Dentro da bolha, manter `message.text` como prioridade; quando vazio, usar `interactiveSummary`; caso ambos vazios, preservar `messageTypeLabel` atual.
- [x] Na prévia da conversa, priorizar rótulo seguro por tipo (`order`, `interactive`, `button`) antes de texto livre.
- [x] Não adicionar componentes clientes, ações ou novos estados.

## Tarefa 3 — registro e validação estática

**Arquivos:** modificar `docs/planning/pesquisa-e-plano.md`, `docs/planning/implementation-ledger.md`, `docs/planning/caderno-tecnico.md` e `docs/planning/plano-execucao.md`.

- [x] Registrar observações estruturais (sem dados de conversas), decisão de projeção e limites de suporte de envio Meta.
- [x] Executar `pnpm typecheck`, Biome nos dois arquivos TS/TSX e `git diff --check`.
- [x] Não executar testes automatizados, build, envio Meta, gravação no Storage, DDL, deploy ou escrita Bling.
