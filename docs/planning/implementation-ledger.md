# Ledger de implementação — Admin WhatsApp Sucedoan

**Plano:** `docs/planning/plano-execucao.md`
**Base:** `e324e3c095f90be6cbda8dcdd3a89b3cecab7463` (`main`, repositório limpo)
**Branch:** `codex/whatsapp-admin-greenfield-20261026`

## Regras

- Aplicação greenfield; nenhum código de branches antigas é copiado.
- Documentos oficiais Meta prevalecem sobre achados de histórico; validações por WABA continuam gates.
- Segredos e dados reais não entram em código, Git, logs ou documentos.
- Não ativar escrita de produção, enviar mensagens comerciais nem emitir nota fiscal durante desenvolvimento.
- Manter verificação focada em integridade de pedido, acesso, webhook/Flow e build necessário.

## Estado e decisões

- `main` foi verificada no commit de limpeza e não contém arquivos de aplicação.
- Clonagem rasa somente da `main`; histórico de código não foi buscado para reaproveitamento.
- O histórico GitHub pesquisado permanece referência de requisitos/integrações; o aplicativo atual é greenfield e não importa código antigo.
- Uma busca de PRs confirmou a existência da draft PR histórica #1422 em outra branch; ela foi deixada intacta. Este trabalho mantém base `main` limpa e branch própria, sem duplicar PR nem trazer commits/código antigos.
- Ambiente: Next.js 16.4.3, React 19.3.0, Node 24.22.1 e pnpm 11.25.0. Biome substitui o ESLint inicial incompatível; Lucide fornece ícones simples.
- `flow_token` aleatório é correlator (hash persistido), não autenticação; validar echo no `nfm_reply` por WABA antes de fechar checkout.
- Fotos em todas as alternativas do Flow continuam obrigatórias; versões/limites ficam sujeitos a documentação e validação atuais da Meta.
- O painel não mostra métricas, produtos, pedidos ou clientes inventados. As conexões aparecem como pendentes até a validação real.

## Progresso

- [x] Preparação documental copiada e links internos ajustados em `docs/planning/`.
- [x] Aplicação Next.js criada na raiz; oito rotas iniciais: Visão geral, Atendimento, Pedidos, Cestas, Produtos, Clientes, ANA e Configurações.
- [x] Shell responsivo com navegação curta, estados de preparação claros e sem dados reais/mocks enganosos.
- [x] Scripts pnpm configurados: `format`, `lint`, `typecheck`, `build`.
- [x] Validação focada: `pnpm lint`, `pnpm typecheck` e `pnpm build` concluídos com sucesso; rotas do App Router renderizadas estaticamente.
- [x] Conferência visual no navegador local: layout mobile sem overflow horizontal; navegação e conteúdo inicial presentes.
- [x] Commit `6ed4c3e` publicado na branch remota `codex/whatsapp-admin-greenfield-20261026`; PR será aberto quando houver uma entrega funcional apropriada para revisão, evitando duplicar a draft histórica existente.
- [ ] Inicializar Supabase local com CLI após confirmar a disponibilidade do Docker e planejar a primeira migração a partir de um snapshot read-only atualizado.
- **Próxima fatia:** login interno, autorização por papel e proteção do shell; integrar Supabase somente com ambiente local e credenciais públicas/seguras devidamente separadas.

Nenhum segredo foi lido, registrado ou transmitido. Nenhuma chamada de escrita foi feita em Supabase, Meta ou Bling.
