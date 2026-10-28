# Configurações de respostas rápidas — Plano

> Execução inline conforme `superpowers:writing-plans` e `superpowers:executing-plans`.

**Objetivo:** administrar os atalhos de texto usados pelo composer da inbox.

**Arquitetura:** adaptador server-only usa as ações allowlisted do Edge Function existente; Server Actions autenticadas fazem save/pausa; a tela server-rendered lê ativos e pausados.

**Spec:** `docs/superpowers/specs/2026-10-27-quick-replies-management-design.md`.

## Tarefa 1 — contrato

- [x] Ler respostas ativas/pausadas e projetar IDs, título, texto, favorito, ordem e estado.
- [x] Implementar save/reactivate e pause pelo gateway com validação de UUID, tamanho e códigos de erro permitidos.
- [x] Revalidar sessão em todas as Server Actions; manter conteúdo fora de URLs/logs.

## Tarefa 2 — interface

- [x] Criar `/configuracoes/respostas-rapidas` com uma seção curta de cadastro e itens recolhíveis para edição.
- [x] Integrar link na tela principal de configurações.
- [x] Pausar preserva texto; salvar item pausado reativa; favoritos/ordem são editáveis.
- [x] Exibir resultado/confito em linguagem simples; nenhuma ação envia mensagem.

## Tarefa 3 — verificação e anotação

- [x] Registrar a implementação e limites no ledger, caderno e plano de execução.
- [x] Executar typecheck, Biome focado, build e diff whitespace.
- [x] Não executar testes automatizados nem escrever no Supabase remoto durante a implementação.
