# Marketing Dona Antônia — UX simples inspirada no fluxo do PapoAI

**Data:** 2026-10-05  
**Status:** aprovado pelo usuário para implementação  
**Referência visual:** prints do PapoAI fornecidos pelo usuário nesta conversa.  
**Escopo:** Vitrine/Admin → Marketing.  

## 1. Objetivo

Transformar a área Marketing em uma ferramenta simples, objetiva e operacional, visualmente próxima do fluxo mostrado nos prints do PapoAI, sem copiar marca/identidade visual e sem substituir o backend já homologado.

O usuário deve conseguir executar o fluxo diário sem conhecer termos técnicos como snapshot, dispatch, WAMID, execution runtime ou UUID.

Fluxos principais esperados:

1. `Marketing → Templates → + Novo → escolher tipo → preencher → salvar/sincronizar`;
2. `Marketing → Campanhas → + Novo → nome → canal → template → público → iniciar/agendar → criar`;
3. público simples: `Todos os clientes` ou `Por etiquetas`;
4. relatório de campanha simples: enviados, entregues, lidos, falhas e destinatários.

## 2. Restrições e garantias

- Manter Supabase/Meta/backend atual como fonte canônica.
- Manter worker, snapshots, outbox, idempotência e gates existentes por baixo da UI.
- Nenhum envio direto do navegador para Graph API.
- PapoAI continua conectado nos dois números enquanto essa decisão permanecer vigente.
- Esta reformulação não remove o ledger de consentimento, mas consentimento deixa de ser navegação principal e não domina a experiência de criação de campanha.
- As proteções obrigatórias de envio do WhatsApp/Meta continuam sendo aplicadas no backend imediatamente antes da materialização/disparo; a UI não precisa expor essa complexidade no fluxo normal.
- A UI normal não deve expor UUIDs, WAMIDs, IDs de outbox, runtime mode ou detalhes de service role.
- Reaproveitar cores, tipografia, botões, cards, tabelas e modais já usados no Vitrine/Admin da Dona Antônia.

## 3. Navegação principal

A área Marketing terá navegação principal simples:

- **Visão geral**
- **Templates**
- **Campanhas**
- **Públicos** (secundário/apoio; pode ser acessado por campanha)

**Consentimentos** deixa a navegação principal e passa para uma ação administrativa discreta em `Mais` ou `Configurações`, sem apagar histórico ou funcionalidades do backend.

Não deve haver:
- título `Marketing` duplicado;
- dois badges repetidos `Campanhas desligadas`;
- textos técnicos extensos no topo;
- seções legadas misturadas com o fluxo principal.

## 4. Templates — lista

A tela segue a estrutura visual do print PapoAI:

### Cabeçalho

**Modelos de mensagem**  
`N modelo(s) encontrado(s)`

Ações à direita:
- `+ Novo`
- `Sincronizar`
- filtro avançado opcional

### Filtros

Uma linha apenas:
- busca por nome;
- tipo;
- canal;
- toggle `Apenas ativos`.

### Tabela

Colunas:
- Nome
- Tipo
- Canal
- Status
- Qualidade
- Criado/Atualizado em
- Ações

Ações por linha em formato discreto:
- Ver
- Editar
- Excluir, quando permitido

Status em chips simples: Aprovado, Em análise, Rejeitado, Inativo.

## 5. Templates — botão `+ Novo`

Abrir modal de seleção de tipo, semelhante ao print PapoAI:

1. **Resposta rápida** — uso durante atendimento; não é template Meta de campanha.
2. **Atendimento** — template utilitário para iniciar/reiniciar conversa.
3. **Campanha** — template de marketing.
4. **Carrossel** — template de marketing com 2–10 cartões.

A UI explica cada opção em uma frase curta.

## 6. Editor de template Campanha

Modal/tela simples com prévia do WhatsApp à esquerda quando houver espaço suficiente.

Campos principais visíveis:
- Nome;
- Canal;
- Categoria (Marketing / Utilidade quando aplicável);
- Mensagem;
- Rodapé opcional;
- botão opcional.

`Opções avançadas` recolhido por padrão:
- exemplos das variáveis;
- quick replies;
- múltiplos botões;
- parâmetros técnicos suportados pela Meta.

Ações:
- Cancelar
- Salvar modelo / Enviar para Meta

A interface deve validar nome, categoria, limites de texto e estrutura antes do submit.

## 7. Editor de template Carrossel

Seguir o fluxo mostrado no print do PapoAI:

### Informações gerais
- Nome do template
- Canal do WhatsApp
- Idioma
- Mensagem principal
- Formato da mídia: Imagem ou Vídeo

### Prévia
- Preview grande do WhatsApp;
- cards horizontais;
- navegação entre cards.

### Cartões
- de 2 a 10 cartões;
- mídia por cartão;
- texto do cartão;
- botão;
- link;
- `Adicionar cartão`;
- opção de remover/reordenar.

Todos os cartões devem respeitar a estrutura exigida pela Meta.

## 8. Campanhas — lista

Estrutura próxima ao print do PapoAI:

### Cabeçalho

**Campanhas**  
`N campanhas encontradas`

Ação principal:
- `+ Novo`

### Filtros
- Pesquisar
- Situação
- `Apenas ativas`

### Tabela
Colunas:
- Nome
- Data de disparo
- Destinatários
- Canal
- Status
- Ações
- Relatório

Status simples:
- Rascunho
- Agendada
- Em execução
- Pausada
- Concluída
- Cancelada
- Falhou

Ações simples:
- editar, quando permitido;
- iniciar/retomar, quando permitido;
- pausar;
- cancelar;
- visualizar relatório.

## 9. Nova Campanha — modal simples

O modal segue o fluxo visual do print PapoAI em duas colunas.

### Coluna esquerda — Informações básicas
- Nome da campanha
- Descrição opcional
- Canal
- Template de mensagem

A seleção de canal filtra apenas templates válidos daquele canal.

### Coluna direita — Configurações de envio

**Início do disparo**
- Iniciar agora
- Agendar para

Quando `Agendar para`, exibir data/hora.

**Público-alvo**
Duas opções principais:
- `Todos os clientes`
- `Por etiquetas`

Se `Por etiquetas`:
- busca por nome da etiqueta;
- lista com checkboxes;
- seleção múltipla;
- contador de clientes encontrados.

Não mostrar no fluxo principal:
- filtros de valor histórico;
- mín./máx. de compras;
- produto por UUID;
- datas avançadas;
- campos de snapshot;
- detalhes técnicos de elegibilidade.

Esses recursos permanecem disponíveis em `Segmentação avançada`, recolhida e secundária.

### Rodapé do modal
- Cancelar
- Salvar rascunho
- Criar campanha

Antes de criar, mostrar uma linha simples:
`X clientes selecionados · Canal 0975 · Template <nome>`.

## 10. Regra de público

### Todos os clientes

Na interface, seleciona toda a base de clientes cadastrados como público comercial, sem exigir filtros manuais.

O total mostrado na montagem da campanha representa o público selecionado. No momento da materialização/envio, o backend calcula quantos estão tecnicamente aptos a receber a mensagem conforme as regras vigentes do WhatsApp/Meta e os gates internos. A eventual diferença é mostrada apenas na revisão/execução, de forma simples, sem transformar consentimento em etapa principal da UX.

### Por etiquetas

A campanha seleciona clientes associados a qualquer uma das etiquetas escolhidas, com deduplicação por telefone canônico.

A UI permite múltiplas etiquetas e informa o total selecionado antes da criação. No envio, aplicam-se os mesmos gates server-side usados em `Todos os clientes`.

### Proteções server-side

Antes de materializar/enviar, o backend continua aplicando:
- telefone válido;
- deduplicação;
- cliente ativo;
- consentimento/opt-in quando exigido pelas regras vigentes do WhatsApp/Meta;
- bloqueio/revogação/supressão explícita;
- gates de canal e runtime;
- template aprovado e compatível com canal;
- idempotência.

Essas proteções não devem poluir a tela normal. Quando reduzirem o público efetivamente enviável, a revisão da campanha informa apenas a quantidade final e, opcionalmente, um resumo de motivos em `Detalhes`.

## 11. Públicos — tela de apoio

A tela Públicos deixa de ser o principal caminho para criar campanha.

Uso:
- visualizar segmentos avançados;
- montar filtros complexos quando necessário;
- botão `Criar campanha com este público`.

Por padrão mostrar somente:
- Cliente
- Cidade
- Bairro
- Etiquetas

`Mais filtros` abre:
- marca;
- categoria;
- produto;
- data de compra;
- inatividade;
- quantidade de compras;
- valor histórico.

## 12. Visão geral

Tela compacta e operacional.

Cards:
- Campanhas
- Templates
- Clientes
- Entregas

Abaixo:
- últimas campanhas;
- oportunidades/radar em bloco secundário.

Links/campanhas legados, allowlists e explicações técnicas não aparecem no primeiro nível.

## 13. Relatório de campanha

Ao clicar `Visualizar relatório`, exibir:
- público total;
- enviados;
- entregues;
- lidos;
- falhas;
- taxa de entrega;
- taxa de leitura;
- tabela de destinatários com status final.

Não exibir WAMID ou IDs técnicos por padrão; podem aparecer em `Detalhes técnicos` quando necessário para suporte.

## 14. Responsividade e estilo

- Desktop: tabelas e modais largos como os prints fornecidos.
- Mobile/tablet: filtros e colunas empilham; ações principais permanecem visíveis.
- Ação principal sempre destacada; ações perigosas discretas.
- Espaçamento consistente com Admin existente.
- Máximo de uma explicação curta por bloco.
- Sem duplicação de cabeçalhos/status.

## 15. Implementação técnica prevista

Reaproveitar os módulos atuais, reduzindo superfície de regressão:

- `vitrine/admin/marketing/template-center.js`
- `vitrine/admin/marketing/template-center.css`
- `vitrine/admin/marketing/audience-center.js`
- `vitrine/admin/marketing/audience-center.css`
- `vitrine/admin/marketing/campaign-center.js`
- `vitrine/admin/marketing/campaign-center.css`
- `vitrine/admin/marketing/campaign-entry.js`
- camada compartilhada `marketing-polish.*` apenas se ainda fizer sentido após simplificação.

Backend a reutilizar:
- `admin-whatsapp-templates-v1`
- `admin-marketing-audiences-v1`
- `admin-marketing-campaigns-v1`
- worker/agendamento atual.

Para carrossel, adicionar apenas os contratos/ações Meta que realmente não existirem; não criar transporte paralelo.

## 16. Testes e rollout

TDD por blocos pequenos:

1. navegação/layout simplificado;
2. lista + criação de templates;
3. campanha simples com Todos/Por etiquetas;
4. carrossel;
5. relatório;
6. responsividade/regressão.

Cada PR deve provar:
- RED específico;
- GREEN específico;
- Central CI verde;
- nenhum segredo no frontend;
- nenhum Graph direto no browser;
- gates de produção preservados até homologação específica.

## 17. Critério de conclusão

A reformulação está concluída quando um operador consegue, sem conhecer o backend:

1. criar/sincronizar um template;
2. criar uma campanha;
3. escolher todos os clientes ou etiquetas;
4. iniciar ou agendar;
5. pausar/retomar quando permitido;
6. abrir relatório;
7. entender o status da operação sem termos técnicos internos.
