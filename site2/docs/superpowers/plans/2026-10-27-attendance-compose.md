# Atendimento: composer de mídia e respostas rápidas — Plano

> Execução inline conforme `superpowers:writing-plans` e `superpowers:executing-plans`.

**Objetivo:** conectar as capacidades existentes do gateway ao composer da inbox, mantendo revisão e envio explícito pelo atendente.

**Arquitetura:** Server Actions autenticadas preparam/finalizam uploads e enviam itens; o navegador transfere os bytes diretamente ao Storage Supabase usando upload assinado. Respostas rápidas são somente texto e preenchem a caixa atual.

**Spec:** `docs/superpowers/specs/2026-10-27-attendance-compose-design.md`.

## Tarefa 1 — adaptar os contratos existentes

- [x] Criar tipos/projeções seguras para resposta rápida, item de biblioteca, upload assinado e resultado de envio em `src/lib/supabase/admin-attendance.ts`.
- [x] Adicionar leituras `quick_replies` e `library_list`.
- [x] Adicionar funções de Server Action para preparar/finalizar upload, listar biblioteca e enviar item pronto.
- [x] Validar UUIDs, nomes, MIME, tamanho, caminho esperado e bucket fixo do upload assinado, legenda e resposta sem expor erros brutos.
- [x] Exigir sessão de administrador em cada Server Action; preservar `canSendText` e controles finais do gateway.

## Tarefa 2 — conectar respostas rápidas e mídia à inbox

- [x] Carregar respostas rápidas apenas quando uma conversa enviável estiver selecionada.
- [x] Seletor de resposta rápida preenche o `textarea`; não submete o formulário.
- [x] Criar componente cliente de anexo com escolha de arquivo, miniatura JPEG obrigatória para imagem, upload direto com `uploadToSignedUrl`, finalização e botão explícito de envio.
- [x] Listar itens recentes da biblioteca e permitir reutilizar item pronto, sem preview não validado.
- [x] Proteger contra duplo clique/transições concorrentes; gerar idempotency key por envio.
- [x] Mapear estados e erros para linguagem simples, sem exibir payload/URL/token do gateway.
- [x] Manter desabilitado quando janela/homologação não permitem envio; incluir instrução de conferência após status incerto.

## Tarefa 3 — estilos, notas e verificação

- [x] Integrar o novo componente ao composer atual sem alterar Flow, confirmação de pedido, Catálogo ou ingestão de pedidos.
- [x] Usar os tokens/estilos já usados na inbox e garantir operação por teclado.
- [x] Registrar resultado, limites e gates restantes no caderno/ledger e plano de execução.
- [x] Executar `pnpm typecheck`, Biome nos arquivos TS/TSX/CSS alterados, `pnpm build` e `git diff --check`.
- [x] Não rodar testes automatizados, publicar/deployar gateway, enviar mensagem real, escrever no Bling ou aplicar migration.
