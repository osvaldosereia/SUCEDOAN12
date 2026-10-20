# Marketing Admin — diário de execução

## Rodada 12:08 Cuiabá — banco de imagens e criador de templates

- Base: branch local `marketing-purchase-journeys-review`, HEAD `fe40e63238963c6e16547fb3d34b87aab64a5e17` (main de 20/10); worktree isolado. O repositório de trabalho original continua com alterações do usuário e não foi alterado nesta rodada.
- Código: adicionado banco de imagens usando nove fotos reais de cestas já presentes na vitrine; integrado aos templates de imagem e cartões do carrossel; preset editável de cinco tamanhos D+20; carregamento via endpoint Admin autenticado com validação local de formato/tamanho; validação do `header_handle` de mídia em templates Meta. Cache-busting atualizado apenas nos módulos de Marketing envolvidos.
- Testes aprovados: `test-marketing-image-library-v1`, `test-whatsapp-marketing-template-simple-ui-v1`, `test-whatsapp-marketing-template-admin-v1`, `test-whatsapp-marketing-template-carousel-v1`, `test-admin-whatsapp-template-carousel-v1`, `test-marketing-strategy-carousel-media-v1`, `test-whatsapp-marketing-repurchase-worker-v1`; `node --check` nos módulos tocados; `git diff --check`.
- Estado remoto consultado, sem escrita: Supabase canônico `ssbesxgaijknwsjbsbcz` ativo; cron Marketing continua apenas `marketing-campaign-worker-v1` a cada minuto. Fila agregada mostra 58 `ready` (todos atrasados >24h) e 19 `scheduled` (9 >24h); não alterar nem enviar esses registros. Há quatro templates aprovados de recompra, todos D+30; nenhum D+28 nem carrossel aprovado. A última migração aplicada já está em `20261020155738`, posterior às três migrações locais de jornada; elas não podem ser aplicadas com os nomes/timestamps atuais.
- PR principal aberto #1176 permanece não mergeável e com CI falhando; o status combinado de `main` não retornou checks. Nenhum commit/PR/deploy foi criado nesta rodada. Nenhuma migração, submissão Meta, campanha ou mensagem real executada.
- Próxima etapa: revisão de UX/runtime do banco de imagens e do fluxo de template no navegador sem submeter nada; em seguida revisar com cuidado o diff de integração e preparar branch/PR isolado. Aguardando também a resolução dos gates de aprovação D+20/D+28 antes de qualquer runtime de jornada.

## Complemento 13:03 Cuiabá — tentativa de smoke visual

- Reconfirmei `HEAD` e worktree isolado; não alterei o checkout original. Reexecutei a validação de diff sem erros.
- Tentei abrir o Admin local com Playwright, bloqueando todo tráfego externo para impedir chamadas de produção. Não foi possível iniciar o navegador: o ambiente não tem executável Chromium instalado; não tentei baixar ou instalar dependências. O servidor local temporário foi encerrado.
- Estado do banco permanece sem alterações nesta tentativa; smoke visual precisa ser executado em um navegador disponível ou num runner com Chromium antes de afirmar validação de UX.

## Complemento 13:10 Cuiabá — contrato da aba Marketing e revisão remota

- Revalidei a base de `main` em `8f3d5b22af144b2fb21fc8b1784c58f720a14a53`; as mudanças recentes de EAN não alteram os arquivos Marketing desta PR. Branch isolado `agent/marketing-image-bank-20261020`; worktree original com mudanças pré-existentes permanece intocado.
- Reproduzi falha do workflow `WhatsApp Meta Central CI`: o teste legado procurava `renderMarketing()` e constantes somente em `vitrine/admin/index.html`, mas a implementação atual está em `vitrine/admin/admin-runtime.js` e é `async function renderMarketing()`. Ajustei apenas `scripts/test-marketing-intelligence-contract.py` para validar o módulo correto; o teste passou localmente (`marketing intelligence contract OK`) e `git diff --check` passou.
- Commit local de correção `81b98e496a5a888d7ed1a70699a64a2ef9dfbaf6`. Pelo conector GitHub, a mesma correção está no branch remoto da PR #1192, commit `de74d1c9790fc0cd834f1791ffc20ba56adf2c0c`; PR segue aberta, draft e mergeable, sem merge/deploy. Workflows do novo SHA iniciaram e ainda estavam `in_progress` no último polling.
- A verificação de pedidos/separação também falhou por contrato de botões neutros em `scripts/test-admin-orders-clean-flow-v3.mjs`, fora do escopo Marketing; mantida sem alterações.
- Próxima etapa: recolher conclusão dos workflows do SHA `de74d1c...`; se o teste de Marketing ficar verde, manter PR draft até smoke visual ser validado em Chromium. Resolver falha fora de escopo e gates Meta separadamente. Sem alterações no Supabase, sem submissões Meta e sem mensagens/campanhas enviadas.
