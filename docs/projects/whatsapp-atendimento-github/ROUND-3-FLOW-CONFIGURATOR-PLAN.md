# Rodada 3 — Configurador Meta Flow

**Objetivo:** criar rascunhos Flow distintos para os canais 0975 e 1018, gerados a partir de uma cesta versionada e persistidos no branch de desenvolvimento por um operador autorizado.

**Arquitetura:** um módulo de domínio puro gera e valida um subconjunto local de Flow JSON; dois documentos versionados guardam o rascunho de cada canal. A Admin API existente ganha rotas estritas de leitura e gravação nos caminhos fixos `flows/channel-0975.json` e `flows/channel-1018.json`. A tela guiada seleciona canal, cesta e nome, apresenta o JSON e permite exportá-lo. Nenhuma chamada Meta ou envio é incluído.

**Stack:** Vite e TypeScript existentes, sem novas dependências.

**Especificação:** `IMPLEMENTATION-PLAN-LUNA-MAX.md`, tabela Rodada 3; `FLOW-RESEARCH.md`.

## Limites

- Trabalhar somente em `projetos/whatsapp-atendimento-github/` e na documentação deste projeto.
- Não alterar aplicações, funções, dados ou configurações em produção.
- Não copiar código ou esquemas do Vitrine Admin.
- Não criar senha própria; usar a sessão GitHub OAuth já validada pela Admin API.
- O repositório é público: nenhum ID oficial de telefone, segredo, token ou dado pessoal entra nos arquivos.
- Usar somente as referências de Flow JSON/componentes da Meta; a saída desta etapa é rascunho local e não atesta validação da Meta.
- Não chamar a Meta, testar em WhatsApp, publicar Flow ou enviar mensagens.
- Não criar nem executar suítes de testes; conferir a entrega com `pnpm build` e revisão do diff.

## Arquivos

- Criar `src/domain/flows.ts`: tipos, gerador e validador para os campos e componentes usados pelo wizard.
- Criar `flows/channel-0975.json` e `flows/channel-1018.json`: estado inicial vazio, com identificadores oficiais nulos.
- Criar `src/admin/flows-panel.ts`: HTML seguro do wizard, JSON gerado, validações locais e exportação.
- Alterar `src/admin/api.ts` e `supabase/functions/whatsapp-admin-api/index.ts`: leitura/gravação autenticada por canal, allowlist estrita de caminhos e controle otimista de revisão.
- Alterar `src/admin/main.ts` e `src/admin/styles.css`: nova área Flows, estado independente por canal e ações de revisão/exportação.
- Atualizar `README.md` e `CONTRACTS.md` com o estado e os limites do rascunho.

## Etapas

1. Definir o contrato `ChannelFlowDraft`, estado inicial dos dois canais, `generateBasketFlow(basket)` e `validateBasketFlow(basket, flowJson)`; erros locais devem identificar cesta, tela ou campo.
2. Adicionar rotas `GET /flow-drafts/{channel}` e `PUT /flow-drafts/{channel}`; autorizar como a API atual, validar os campos e o JSON no servidor, comparar `expectedCommit` e escrever somente o arquivo fixo do canal.
3. Construir o wizard com canal 0975/1018, cesta, nome e status; gerar JSON visível, oferecer download e gravação versionada apenas quando o operador estiver autorizado. Exibir que telefone oficial, endpoint, validação Meta e teste real ainda não foram configurados.
4. Documentar as limitações e conferir com `pnpm build`, `git diff --check` e revisão dos caminhos gravados.

## Revisão de entradas e falhas

- Campo extra ou tipo incorreto no documento salvo: rejeitar no cliente e no servidor.
- Canal desconhecido ou caminho fornecido pelo cliente: rejeitar; o servidor deriva o caminho de uma enumeração fixa.
- Revisão do catálogo divergente: responder conflito sem gravar.
- Cesta removida/inativa ou JSON alterado incompatível com o wizard: marcar inválido e impedir a gravação.
- IDs oficiais e endpoint ausentes: deixar o canal em rascunho, sem sugerir que foi testado ou publicado.

## Critério de saída desta rodada

Cada canal tem seu próprio arquivo e pode gerar/exportar um rascunho associado à revisão de uma cesta. A tela diferencia claramente rascunho, validação local e estados Meta desconhecidos. A gravação só ocorre pelo backend autenticado e nunca publica ou envia o Flow.

## Referências

- [Meta — documentação de WhatsApp Flows](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows)
- [Meta — referência de componentes](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/components)
- [Meta — changelog de Flows](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/changelogs)
- [Repositório oficial WhatsApp Flows Tools](https://github.com/WhatsApp/WhatsApp-Flows-Tools)

As páginas Meta responderam `429` durante esta execução. O validador local, portanto, é limitado ao formato e componentes usados pelo wizard; a aprovação oficial do JSON segue pendente para Flow Builder/Meta API em homologação.
