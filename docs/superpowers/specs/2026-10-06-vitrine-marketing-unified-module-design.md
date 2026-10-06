# Vitrine Admin — módulo Marketing unificado

**Data:** 2026-10-06  
**Status:** especificação para revisão do usuário  
**Repositório:** `osvaldosereia/SUCEDOAN12`  
**Área:** Vitrine Admin → Marketing  
**Supabase canônico:** `ssbesxgaijknwsjbsbcz`

## 1. Objetivo

Reorganizar o módulo Marketing existente do Vitrine Admin para que a operação diária aconteça em uma única tela, com quatro áreas claras: Templates, Campanhas, Públicos e Consentimentos. O ponto de entrada padrão será Templates. A pessoa deve conseguir trabalhar sem precisar entender WABA, Meta Graph API ou UUIDs.

Este desenho substitui as decisões de navegação e operação de Templates/Campanhas em especificações anteriores quando elas divergirem deste documento. Ele mantém a arquitetura já existente no Vitrine Admin e no Supabase canônico.

## 2. Estado atual e arquitetura preservada

O repositório já contém implementações para as quatro áreas, mas cada módulo monta sua própria navegação. Isso cria títulos, links e estados repetidos. Templates e campanhas também possuem editores independentes.

O backend atual já fornece as bases que serão mantidas:

- Templates: `admin-whatsapp-templates-v1`, `whatsapp_templates_v1`, `whatsapp_template_events_v1` e os módulos compartilhados de integração Meta.
- Webhook Meta: `whatsapp-meta-webhook-v1`, que registra eventos de status.
- Campanhas: `admin-marketing-campaigns-v1`, tabelas `marketing_campaigns_v1`, snapshots, destinatários e filas existentes.
- Públicos e consentimentos: `admin-marketing-audiences-v1`, `marketing_customer_consent_current_v1` e `marketing_consent_events_v1`.
- Autorização do Admin: fluxo autenticado compartilhado pelo Vitrine Admin.

Não criar um segundo conjunto de tabelas para representar canais, templates Meta, campanhas ou consentimentos. A Meta é a fonte de verdade dos templates remotos; o Supabase canônico guarda o cache, eventos e estado operacional local.

O envio de campanhas continua submetido aos gates atuais do backend. A reformulação da interface não habilita campanhas reais nem altera o runtime dos canais.

## 3. Navegação e shell

Dentro de Marketing, renderizar uma única barra:

**Templates | Campanhas | Públicos | Consentimentos**

Requisitos:

- Templates é a área inicial.
- Não exibir Visão geral, Estratégia, Mais nem submenus repetidos dentro desta tela.
- Remover o texto fixo “Campanhas desligadas” duplicado; estados reais da campanha aparecem na própria lista e nos avisos de ação.
- Todas as áreas reutilizam o mesmo shell e navegação ativa.
- Os módulos não montam nem vinculam uma segunda navegação própria.
- Preservar identidade, componentes e comportamento responsivo do Vitrine Admin.

## 4. Templates

### Lista

Cabeçalho:

**Templates de mensagem**  
“Crie, edite e acompanhe seus modelos do WhatsApp.”

Ações:

- **Sincronizar com Meta**
- **Novo template**

Filtros em uma linha responsiva:

- busca por nome;
- canal;
- status;
- categoria;
- idioma.

Tabela:

| Template | Categoria | Canal | Status | Qualidade | Atualizado | Ações |
|---|---|---|---|---|---|---|

O estado remoto é apresentado em português:

| Meta | Interface |
|---|---|
| `APPROVED` | Aprovado |
| `PENDING` | Em análise |
| `REJECTED` | Rejeitado |
| `IN_APPEAL` | Em recurso |
| `FLAGGED` | Atenção |
| `DISABLED` | Desativado |
| `PENDING_DELETION` | Excluindo |
| Ausente ou desconhecido | Não informado |

Preservar o valor bruto recebido da Meta no cache. Estados não reconhecidos devem aparecer como “Não informado”, sem serem descartados. A qualidade e o motivo de rejeição aparecem quando fornecidos.

Ações da linha:

- **Ver** abre o detalhe;
- **Editar** carrega primeiro o template remoto pelo `meta_template_id`;
- menu de ações inclui **Duplicar** e **Excluir** conforme as operações disponíveis.

### Criação

O seletor inicial contém:

- **Modelo padrão** — texto, mídia e botões;
- **Carrossel** — produtos/ofertas em cartões;
- **Catálogo / Produtos** — commerce, se disponível para a configuração Meta conectada;
- **Autenticação** — OTP/códigos, com componentes permitidos pela Meta.

Depois da seleção, abrir o editor correspondente. O editor de modelo padrão tem campos à esquerda e uma prévia persistente de WhatsApp à direita, adaptada para telas menores.

Campos do modelo padrão:

- nome, canal, idioma e categoria;
- cabeçalho: nenhum, texto, imagem, vídeo quando suportado, documento ou localização;
- corpo com inserção de variáveis numeradas (`{{1}}`, `{{2}}`, ...);
- exemplos obrigatórios para variáveis quando exigidos pela Meta;
- rodapé opcional;
- botões compatíveis com categoria e tipo: resposta rápida, site, telefonar, catálogo ou OTP quando aplicável.

A validação local explica erros de campo antes do envio. Erros da Meta passam por normalização para uma mensagem operacional em português, com detalhes técnicos expansíveis.

### Edição, exclusão e histórico

Editar sempre carrega a versão real pelo identificador Meta antes de preencher o editor. Ao salvar, a Edge Function chama a API Meta, atualiza o cache local e retorna o estado atualizado.

Excluir exige confirmação clara de que o template será removido também da Meta. A função de backend continua responsável pela chamada remota e sincronização do cache.

O drawer de detalhe mostra nome, status, categoria, idioma, canal, identificador Meta, cabeçalho, corpo, rodapé, botões, variáveis e histórico local de sincronização e eventos Meta. O histórico usa `whatsapp_template_events_v1` e os campos disponíveis no ledger; não inventar eventos quando eles não existem.

## 5. Campanhas

A lista contém pesquisa, situação, filtro de campanhas ativas e ação **Nova campanha**. Colunas visíveis: nome, data, público, template, canal, status e relatório.

O editor solicita nome, descrição opcional, canal, template aprovado, horário de início, público e janela de exclusão de conversas recentes. Um resumo de elegibilidade é exibido antes de salvar/criar, por exemplo: “529 clientes encontrados · 20 com consentimento comercial · 20 destinatários elegíveis”.

A UI oferece rascunho, agendamento e visualização de estado/relatório conforme as ações já suportadas pelo backend. Regras obrigatórias:

- só templates `APPROVED` entram na seleção;
- consentimento e opt-out são validados server-side;
- a elegibilidade é revalidada antes do despacho;
- destinatários e resultados continuam usando snapshots, outbox, idempotência e workers existentes;
- nenhum loop de disparo roda no navegador;
- os flags atuais de execução e os canários permanecem efetivos.

Se o gate de envio estiver fechado, a tela deve explicar que a campanha pode ser preparada, mas o disparo não está habilitado, e não deve aparentar sucesso de envio.

## 6. Públicos

Usar um fluxo progressivo:

1. nome do público;
2. filtros principais: cidade, bairro, etiqueta, produto comprado, categoria, marca e data da última compra;
3. resumo persistente da quantidade encontrada;
4. filtros avançados recolhidos em “Mais filtros”.

A contagem é informativa e deve vir da função de públicos. Regras de deduplicação, elegibilidade e consentimento continuam sendo aplicadas pelo backend de campanhas.

## 7. Consentimentos

Mostrar indicadores de total, consentidos, revogados e nunca consentidos, mais busca por nome ou telefone. O detalhe de um cliente mostra o estado atual e os eventos de auditoria existentes, incluindo data, decisão, origem e canal quando esses dados estiverem disponíveis.

A tela é uma projeção legível dos registros canônicos. Ações de consentimento devem continuar registrando eventos no ledger existente; nunca editar ou apagar o histórico para simular uma decisão anterior.

## 8. Serviços, dados e fluxo

O frontend chama apenas funções Supabase autenticadas já existentes ou novas ações autenticadas adicionadas às Edge Functions existentes quando uma capacidade estiver ausente. Nenhuma chamada Graph API sai do navegador.

Fluxo de escrita de template:

```
Vitrine Admin autenticado
  → Edge Function de templates
  → Meta Graph API
  → cache/eventos no Supabase canônico
  → resposta normalizada para a interface
```

Fluxo de webhook:

```
Meta webhook
  → verificação e normalização
  → deduplicação
  → evento de template no Supabase
  → atualização do estado local exibido
```

Não adicionar tabelas até que o inventário dos contratos confirme uma lacuna concreta. Se uma migração for necessária, ela será aditiva, terá RLS e grants revisados, preservará as linhas existentes e será apresentada no plano antes de execução.

## 9. Erros, estados e acessibilidade

- Distinguir carregando, vazio, sucesso e falha.
- Sincronização não perde a lista anterior quando a chamada falha.
- Mensagens voltadas ao operador usam português simples.
- Detalhes técnicos ficam sob “Ver detalhes do erro”.
- Botões têm estados ocupados, foco visível e rótulos acessíveis.
- Modais/drawers fecham por botão e teclado e mantêm foco.
- Layout utilizável em desktop, tablet e celular.
- Nenhum erro pode converter um status desconhecido em aprovação.

## 10. Etapas de implementação

1. Unificar o shell e remover navegações duplicadas.
2. Refazer a lista de Templates, traduções de status e estados de carregamento/erro.
3. Unificar o seletor de tipo, editor, prévia, edição, exclusão e detalhe/histórico.
4. Reorganizar Campanhas usando o contrato atual e mantendo os gates.
5. Simplificar Públicos e integrar o resumo à criação de campanha.
6. Reestruturar Consentimentos sobre o estado atual e o ledger existente.
7. Corrigir dependências e remover código legado apenas depois que cada fluxo novo estiver coberto.
8. Atualizar documentação operacional e handoff.

Cada etapa será validada com os comandos e verificações do repositório, revisão das permissões e RLS quando houver mudança de banco, além de verificação manual dos fluxos e tamanhos de tela. Nenhuma campanha real será disparada como parte de testes.

## 11. Critérios de aceite

- Marketing apresenta uma única navegação com exatamente as quatro áreas e abre Templates por padrão.
- Não há navegação duplicada em templates, campanhas, públicos ou consentimentos.
- Estados Meta listados são traduzidos corretamente e estados desconhecidos aparecem como “Não informado”.
- Sincronização continua paginada e mostra falhas de forma compreensível.
- Edição carrega o estado remoto por `template_id`; frontend nunca contém token Meta.
- Criação exibe prévia atualizada e valida exemplos de variáveis obrigatórios.
- Exclusão requer confirmação e reflete o resultado remoto.
- Webhooks atualizam o estado e o histórico sem duplicar eventos.
- Campanhas só aceitam templates aprovados, mostram elegibilidade e mantêm validação server-side de consentimento/opt-out.
- Públicos e Consentimentos continuam consultando seus contratos canônicos.
- Nenhuma tabela paralela de templates, canais, campanhas ou consentimentos é criada.
- Nenhum gate existente de produção, canário ou envio é alterado pela reformulação.

## 12. Fora de escopo desta rodada

- Alterar a fonte de verdade do Vitrine Admin ou mover Marketing para outro repositório.
- Criar um projeto Supabase separado.
- Habilitar envio real de campanhas, trocar o provider inbound ou retirar números do PapoAI.
- Aprovar templates dentro do produto; a decisão de aprovação pertence à Meta.
- Adicionar funcionalidades Meta não suportadas pelo ativo conectado ou pela versão homologada da API.
