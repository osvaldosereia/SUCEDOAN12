# WhatsApp Atendimento GitHub

Aplicação nova para catálogo de cestas, atendimento e operação de pedidos pelo WhatsApp.

## Limite desta pasta

Este é o único diretório de código do projeto novo: `projetos/whatsapp-atendimento-github/`. O repositório também contém aplicações em produção e iniciativas paralelas; nenhuma delas é dependência desta aplicação. O código, os tipos, o modelo transacional, os endpoints e os conectores serão escritos do zero.

## Etapa atual

Rodada 0: definição dos contratos mínimos em [CONTRACTS.md](CONTRACTS.md). Ainda não há tela, runtime, migration, catálogo importado, credencial configurada ou chamada de produção.

## Regras de segurança

- O repositório é público. Tudo que for commitado aqui, inclusive produtos e imagens, será público.
- Não versionar credenciais, dados de clientes, pedidos, mensagens, sessão ou ajuste interno de preço.
- Não criar senha própria. A autenticação do operador usará uma identidade GitHub autorizada; toda ação administrativa será validada no backend.
- Nenhum token de escrita do GitHub, chave Meta/Bling ou chave `service_role` pode aparecer no navegador.
- As gravações de catálogo ficam limitadas à branch `project/whatsapp-atendimento-github-20261025`.
- Não publicar Flow, enviar mensagem real, implantar função ou mudar produção durante desenvolvimento.

## Organização prevista

- `src/domain/`: regras puras e contratos do domínio, sem dependência de Vitrine Admin.
- `src/admin/`: interface administrativa nova.
- `src/server/`: serviços e portas do backend novo.
- `supabase/functions/`: funções novas deste projeto, isoladas das funções existentes.
- `supabase/migrations/`: modelo transacional novo, somente depois de o contrato de checkout ser fechado.
- `catalog/` e `images/`: catálogo público e imagens compactadas, a partir da Rodada 1.

Leia também o [handoff](../../docs/projects/whatsapp-atendimento-github/HANDOFF.md), a [pesquisa complementar](../../docs/projects/whatsapp-atendimento-github/ORDER-ADMIN-AND-IMAGE-RESEARCH.md) e o [plano greenfield](../../docs/projects/whatsapp-atendimento-github/IMPLEMENTATION-PLAN-LUNA-MAX.md).
