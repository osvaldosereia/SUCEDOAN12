# Vitrine/Admin — Central de Atendimento v2

Data: 2026-10-02
Status: design aprovado em conversa; especificação para revisão antes do plano de implementação

## 1. Objetivo

Evoluir a Central de Atendimento do `Vitrine/Admin` para ser a estação operacional principal da Dona Antônia, com experiência próxima ao WhatsApp para o atendente, mantendo o PapoAI como infraestrutura atual de WhatsApp/ANA onde ele já é necessário.

A Central deve reduzir troca de telas, leitura confusa de histórico e operações repetitivas. Ela deve integrar conversa, cliente, pedidos, produtos e ferramentas de atendimento sem virar um CRM genérico.

A arquitetura aprovada é híbrida:

- **Vitrine Admin / Supabase**: interface do atendente, organização, histórico canônico, etiquetas internas, respostas rápidas, contexto do cliente, pedidos, produtos, copiloto e estados operacionais locais.
- **PapoAI**: conexão atual dos números oficiais, ANA e recursos específicos do provedor.
- **Meta / WhatsApp Business Platform**: plataforma subjacente; não introduzir transporte paralelo direto pela Meta enquanto o PapoAI continuar como provedor dos dois canais, salvo decisão futura explícita e homologada.

## 2. Princípios e restrições

1. Supabase permanece fonte canônica da operação interna do Admin.
2. Não criar uma segunda base de clientes, pedidos ou conversas.
3. Etiquetas da Central são **internas da Dona Antônia** e não têm relação com tags do PapoAI.
4. Não usar Make.
5. Não expor segredo, token ou URL sensível no navegador.
6. Não afirmar envio, leitura, autoria ou estado da IA sem evento/contrato confiável.
7. Respeitar janela de atendimento e regras oficiais da Meta.
8. Não permitir que uma ação visual local finja ter pausado/reativado a ANA.
9. Não criar transporte humano direto pelo Admin enquanto não houver contrato oficial homologado para os dois canais.
10. A interface deve evitar scroll horizontal escondido para ações principais.
11. A lista de conversas deve se comportar como WhatsApp: atividade real mais recente no topo.
12. Recursos de IA internos são sempre copiloto; nunca enviam ou alteram pedido/cadastro automaticamente.

## 3. Estado atual observado

O sistema já possui:

- `whatsapp_accounts` com os dois números oficiais;
- `conversations` com canal, cliente, telefone, modo e timestamps operacionais;
- `whatsapp_messages_v1` como histórico canônico local;
- `customers`, `customer_addresses`, `orders`, `order_items`;
- `papoai_webhook_inbox_v2` para captura do PapoAI;
- `admin-whatsapp-ops-v1` como gateway privado da Central;
- busca de produtos com foto, preço, oferta e estoque vendável;
- emissão de link de catálogo personalizado;
- pontes do iframe para abrir cliente, pedido, orçamento e nova venda no Admin;
- cálculo local da janela de atendimento;
- interface atual com duas filas lado a lado, conversa central e painel contextual.

Limitações confirmadas:

- o histórico local recente contém principalmente mensagens **inbound**;
- o webhook de saída atual do PapoAI está configurado somente para `Mensagem recebida`;
- PapoAI expõe também eventos `Mensagem enviada` e `Mensagem atualizada`, mas o payload outbound ainda não foi homologado;
- `Parar resposta do assistente` existe no PapoAI, porém o isolamento exato por sessão/canal ainda não foi comprovado;
- ação oficial para **reativar** a IA daquela conversa não foi confirmada;
- API pública de histórico do PapoAI não foi confirmada;
- listagem de templates é visível na interface, mas o contrato de API do PapoAI para carga inicial não foi confirmado;
- `whatsapp_templates_v1` existe no Supabase e está atualmente sem carga útil para esta Central;
- mídia recebida do PapoAI pode incluir URL temporária, MIME, filename e dados de localização;
- algumas URLs de mídia observadas são temporárias e não devem ser tratadas como armazenamento permanente.

## 4. Arquitetura-alvo

### 4.1 Entrada de mensagens

```text
Cliente WhatsApp
→ Meta / canal oficial
→ PapoAI
→ webhook de saída do PapoAI
→ papo-external-agent-v1
→ normalização canônica
→ conversations + whatsapp_messages_v1
→ Central Vitrine/Admin
```

A captura deve evoluir para aceitar com segurança:

- mensagem recebida;
- mensagem enviada;
- mensagem atualizada, somente quando necessária para status/atualização confiável.

A implementação não deve assumir formato outbound igual ao inbound antes de observar payload real.

### 4.2 Saída humana

Enquanto não houver transporte humano homologado:

```text
Central
→ prepara resposta / produto / template
→ copiar conteúdo
→ abrir PapoAI
→ atendente envia no PapoAI
```

O botão de envio direto no Admin permanece bloqueado.

### 4.3 Contexto operacional

```text
Central
→ admin-whatsapp-ops-v1
→ Supabase
→ cliente + endereços + pedidos + itens + produtos + estoque + consentimento + catálogo
```

### 4.4 Controle da ANA

Só haverá controle ativo depois de homologação de contrato por conversa:

```text
Admin: Assumir conversa
→ backend resolve canal + conversa + identificadores
→ PapoAI: Parar resposta do assistente
→ confirmação real
→ somente então Supabase grava estado manual
```

Para devolução:

```text
Admin: Devolver para ANA
→ ação oficial de retomada no PapoAI
→ confirmação real
→ somente então Supabase grava estado IA
```

Como a ação de retomada não foi confirmada, **Release fica fora da implementação funcional inicial**.

## 5. Layout desktop v2

Substituir o layout de quatro áreas por três áreas principais:

```text
┌──────────────────┬────────────────────────────┬──────────────────────┐
│ CONVERSAS        │ CONVERSA                   │ CONTEXTO             │
│                  │                            │                      │
│ [0975]  [1018]   │ Cliente        ANA ATIVA   │ Cliente              │
│ Buscar           │                            │ Pedidos              │
│ Etiquetas        │ timeline                   │ Produtos             │
│                  │                            │ Assistente           │
│ lista            │ texto / mídia / localização│                      │
│                  │                            │                      │
│                  ├────────────────────────────┤                      │
│                  │ ações + rascunho           │                      │
└──────────────────┴────────────────────────────┴──────────────────────┘
```

### 5.1 Coluna de conversas

Uma única coluna, mesma largura aproximada de uma das filas atuais.

Topo:

- botão grande `0975`;
- botão grande `1018`;
- busca por nome/telefone;
- filtro por etiqueta.

Remover os filtros atuais:

- Todos;
- Não lidos;
- Humano.

O contador de não lidas continua no card, mas não altera o critério cronológico.

### 5.2 Ordenação

Regra padrão:

1. `last_message_at` real mais recente desc;
2. empate por ID/timestamp estável.

Não usar `updated_at` administrativo para recência.
Não elevar artificialmente conversa somente porque está marcada como humana ou não lida.

Quando o outbound passar a ser capturado, tanto mensagem recebida quanto enviada atualizam a posição da conversa.

### 5.3 Data no card

- hoje: `HH:mm`;
- ontem: `Ontem`;
- mesmo ano: `dd/mm`;
- outro ano: `dd/mm/aa`.

Tooltip pode mostrar data/hora completa.

## 6. Timeline da conversa

### 6.1 Texto

Mostrar bolhas inbound e outbound em lados distintos.

Quando autoria outbound estiver comprovada:

- ANA;
- humano;
- template/sistema, quando identificável.

Se a origem não for confiável, mostrar apenas `Enviado`, sem inventar autor.

### 6.2 Separadores de data

Usar separadores visíveis:

- Hoje;
- Ontem;
- data completa nas anteriores.

### 6.3 Paginação

Carregar lote recente e buscar lotes anteriores ao chegar ao topo, preservando a posição de scroll.

### 6.4 Imagem

Quando a mídia estiver disponível:

- miniatura dentro da bolha;
- clique abre visualização maior;
- legenda/conteúdo, se houver;
- fallback claro se o arquivo expirou ou não estiver disponível.

### 6.5 Áudio

- player HTML nativo;
- botão play/pause;
- duração se disponível;
- texto/transcrição somente quando vier de fonte confiável; não gerar transcrição contínua por padrão.

### 6.6 Documento

- ícone;
- filename;
- MIME/tipo amigável;
- ação `Abrir`/`Baixar` quando houver URL válida.

### 6.7 Localização

Reconhecer payload de localização e renderizar:

- nome do local, quando disponível;
- endereço, quando disponível;
- latitude/longitude;
- `Abrir no mapa`;
- `Copiar localização`;
- `Compartilhar link` usando URL de mapa gerada a partir das coordenadas.

### 6.8 Retenção de mídia

URLs temporárias do PapoAI não podem ser persistidas como solução permanente.

Desenho:

1. receber metadata/URL temporária;
2. backend decide se materializa a mídia em armazenamento próprio;
3. armazenar somente o necessário à operação/histórico;
4. guardar metadata canônica e referência interna;
5. nunca expor credenciais do provedor.

Política de retenção deve ser pequena e operacional, evitando crescimento ilimitado.

## 7. Etiquetas internas

Criar módulo próprio no Supabase.

### 7.1 Entidades

`attendance_labels_v1`

- id;
- name;
- color_key;
- is_active;
- sort_order;
- created_at;
- updated_at.

`attendance_conversation_labels_v1`

- conversation_id;
- label_id;
- assigned_at;
- assigned_by.

### 7.2 Operações

O Admin permite:

- criar;
- renomear;
- alterar cor;
- ativar/desativar;
- excluir quando seguro;
- atribuir várias etiquetas a uma conversa;
- remover;
- filtrar fila por uma ou mais etiquetas.

### 7.3 Regra de isolamento

Etiquetas internas não são sincronizadas para PapoAI e nunca são usadas para controlar ANA.

## 8. Respostas rápidas

Remover `QUICK_REPLIES` fixo do JavaScript.

Criar armazenamento editável:

`attendance_quick_replies_v1`

- id;
- title;
- body;
- is_active;
- is_favorite;
- sort_order;
- created_at;
- updated_at.

Admin simples para:

- criar;
- editar;
- excluir/desativar;
- ordenar;
- marcar favoritas.

Na conversa:

- favoritas aparecem como acesso rápido;
- `Mais respostas` abre a lista completa;
- selecionar sempre preenche o rascunho, nunca envia automaticamente.

## 9. Barra de ações

Evitar sequência longa de chips/botões com scroll horizontal escondido.

Ações principais sempre visíveis:

- Catálogo;
- Respostas;
- Produtos;
- Mais `…`.

Menu `Mais` contém ações menos frequentes:

- Criar orçamento;
- Nova venda;
- Marcar retorno;
- Preferência de marketing;
- outras operações futuras aprovadas.

Em desktop, controles principais devem caber sem depender de scroll horizontal.

## 10. Templates WhatsApp

### 10.1 Fonte local

Reutilizar `whatsapp_templates_v1` como cache canônico local.

Campos existentes permitem guardar:

- conta/canal;
- WABA;
- ID Meta;
- nome;
- idioma;
- categoria;
- status;
- componentes;
- quality rating;
- last_synced_at;
- metadata.

Adicionar configuração de atendimento em metadata ou tabela própria, por exemplo:

- `show_in_attendance`;
- `favorite_order`.

### 10.2 Sincronização

Não afirmar sync automático via PapoAI enquanto o contrato não estiver homologado.

Estratégia:

- suportar cadastro/cache local;
- preparar consumo futuro dos eventos `Modelo de mensagem criado` e `Modelo de mensagem alterado`;
- carga inicial automatizada somente quando houver API/contrato confiável para os dois canais.

A plataforma oficial da Meta possui APIs de listagem de templates por WABA e envio de templates por `Phone-Number-ID`, mas não usar integração direta parcial enquanto os dois canais não estiverem igualmente configurados/provisionados e a decisão de arquitetura continuar sendo PapoAI como provedor.

### 10.3 Uso na conversa

Gerenciador permite escolher quais templates aparecem no atendimento.

Enquanto transporte externo não estiver homologado:

- mostrar prévia;
- preparar parâmetros;
- abrir PapoAI para envio manual.

## 11. Produtos no atendimento

### 11.1 Busca

Reutilizar busca atual por nome/EAN e dados do Supabase.

Resultado:

- foto;
- nome;
- preço atual;
- oferta, se ativa;
- estoque vendável;
- seletor de quantidade.

### 11.2 Seleção múltipla

Permitir selecionar vários produtos antes de executar ação.

Exemplo:

```text
[x] Arroz 5kg      qtd 2
[x] Óleo 900ml     qtd 3
[ ] Açúcar 2kg
```

### 11.3 Preparar para cliente

Enquanto o envio direto estiver bloqueado:

- gerar rascunho organizado com nomes, quantidades e preços;
- disponibilizar fotos/links quando apropriado;
- copiar/abrir PapoAI.

Quando transporte homologado existir, avaliar envio de mídia/produtos sem quebrar as regras do provedor.

### 11.4 Adicionar a venda/orçamento

Não alterar silenciosamente pedido confirmado.

Fluxo:

- se existe orçamento/venda editável: adicionar itens após ação explícita;
- se não existe: `Criar nova venda` ou `Criar orçamento` já com cliente e produtos selecionados;
- pedidos em separação/faturamento seguem regras existentes e não são mutados diretamente pelo chat.

A implementação deve reutilizar as pontes já existentes do Admin em vez de duplicar o módulo de pedidos.

## 12. Painel contextual

Manter quatro abas principais:

### 12.1 Cliente

- nome;
- telefone;
- endereço;
- cidade;
- cadastro completo/incompleto;
- documento mascarado;
- total de pedidos;
- valor comprado;
- consentimento de marketing;
- etiquetas da conversa em área dedicada.

### 12.2 Pedidos

- pedidos mais recentes do cliente;
- data;
- status;
- total;
- itens;
- abrir pedido;
- criar orçamento/venda.

### 12.3 Produtos

Conforme seção 11.

### 12.4 Assistente

Copiloto manual.

Ações iniciais:

- Resumir conversa;
- Sugerir resposta;
- O que o cliente está pedindo?;
- O que falta resolver?;
- Identificar produtos mencionados.

Regras:

- nunca enviar automaticamente;
- sugestão preenche rascunho editável;
- não alterar pedido/cadastro sem ação explícita;
- preço/estoque sempre vêm da fonte operacional;
- não inventar estado de entrega, pagamento ou cadastro;
- não rodar continuamente em todas as conversas.

Automação útil aprovada em desenho:

- ao assumir manualmente uma conversa longa, gerar um resumo curto uma única vez, somente quando o takeover estiver homologado.

## 13. Controle ANA / humano

### 13.1 Estado visual desejado

Cabeçalho da conversa:

- `ANA ativa`;
- `Atendimento manual`;
- `Estado desconhecido`, quando não houver confirmação suficiente.

### 13.2 Takeover

PapoAI possui ação `Parar resposta do assistente`, mas ainda falta comprovar isolamento por sessão/canal.

Enquanto isso:

- botão `Assumir atendimento` permanece desabilitado ou marcado como indisponível;
- não mudar `mode` localmente como se a IA tivesse parado.

Critério para habilitar:

1. endpoint/automação recebe identificador suficiente;
2. conversa correta é afetada;
3. canal correto é preservado;
4. teste controlado comprova que outra conversa/canal não é afetado;
5. confirmação do PapoAI chega ao backend.

### 13.3 Release

Nenhuma ação oficial de retomada foi confirmada.

Portanto:

- `Devolver para ANA` não será funcional na primeira entrega;
- `Concluir atendimento` do PapoAI não será tratado como sinônimo sem evidência;
- não implementar workaround por tag, etiqueta ou flag local.

## 14. Outbound / histórico completo

### 14.1 PapoAI

A interface do PapoAI confirma eventos:

- `Mensagem recebida`;
- `Mensagem enviada`;
- `Mensagem atualizada`.

O atual webhook usa apenas mensagem recebida.

### 14.2 Regra de implementação

Antes de habilitar captura outbound em produção:

1. obter payload real de teste controlado;
2. validar canal;
3. validar sessão/conversa;
4. validar ID externo;
5. validar direção;
6. validar texto/tipo/timestamp;
7. validar autoria se existir;
8. validar mídia se existir;
9. garantir idempotência.

Se autoria não existir no payload, não inferir ANA/humano por heurística frágil.

### 14.3 Fila

Somente após persistir outbound de forma confiável, qualquer mensagem enviada também passa a atualizar `last_message_at` e a subir a conversa para o topo.

## 15. Backend

Manter `admin-whatsapp-ops-v1` como gateway fino da Central, mas evitar transformá-lo em monólito.

Separar responsabilidades em RPCs/tabelas específicas:

- fila e conversa;
- etiquetas;
- respostas rápidas;
- templates/cache;
- produtos selecionados / handoff para venda-orçamento;
- copiloto;
- mídia.

Ações que dependem do PapoAI devem ficar em adapters próprios e atrás de feature gates.

## 16. Segurança

1. Todas as APIs da Central exigem autenticação Admin válida.
2. Browser nunca recebe service role ou segredo PapoAI.
3. IDs de cliente/canal/destino sensíveis são resolvidos server-side a partir da conversa.
4. Mídia externa deve passar por validação/allowlist antes de proxy/cache.
5. Ações mutáveis registram auditoria mínima de usuário e horário.
6. Operações de pedido continuam usando regras canônicas de estoque/status.
7. Etiquetas e respostas rápidas não podem conceder permissões nem alterar estado PapoAI.

## 17. Responsividade e usabilidade

### Desktop

- três colunas;
- sem scroll horizontal escondido nas ações principais;
- scroll vertical independente para lista, timeline e contexto;
- conversa ocupa a maior área útil.

### Tablet

- lista + conversa;
- contexto abre em drawer.

### Mobile

- lista → conversa;
- botão voltar claro;
- contexto abre em drawer/tela sobreposta;
- seletor 0975/1018 permanece acessível na lista.

## 18. Testes obrigatórios

### Fila

- troca 0975/1018 não mistura conversas;
- última mensagem real define ordem;
- outbound novo sobe conversa após homologação;
- busca e etiqueta preservam canal selecionado;
- datas `Hoje/Ontem/dd/mm` corretas.

### Timeline

- inbound/outbound em lados distintos;
- paginação preserva scroll;
- imagem, áudio, documento e localização possuem fallback;
- URL de mídia expirada não quebra a conversa;
- mensagem duplicada não aparece duas vezes.

### Etiquetas

- CRUD;
- várias por conversa;
- filtro;
- nenhuma chamada/tag PapoAI.

### Respostas rápidas

- CRUD;
- favoritas;
- inserção no rascunho;
- nenhuma resposta é enviada sozinha.

### Produtos

- busca nome/EAN;
- seleção múltipla;
- quantidades;
- preço/estoque atuais;
- handoff para orçamento/venda sem alterar pedido confirmado indevidamente.

### Assistente

- saída somente como sugestão;
- não envia;
- não muta dados;
- não inventa estoque/preço.

### PapoAI gates

- takeover indisponível sem homologação;
- release indisponível sem contrato;
- transporte humano direto indisponível sem homologação;
- templates não são marcados como sincronizados sem origem confiável.

## 19. Fases de entrega

### Fase 1 — Base do chat

- fila única;
- seletor 0975/1018;
- ordenação cronológica correta;
- datas;
- outbound canônico após homologação de payload;
- mídia/localização;
- correção completa de scroll/layout.

### Fase 2 — Organização

- etiquetas internas;
- editor de respostas rápidas;
- barra de ações simplificada.

### Fase 3 — Comercial

- produtos múltiplos;
- quantidades;
- preparar envio;
- handoff para orçamento/venda;
- gerenciador/cache de templates.

### Fase 4 — Inteligência e controle de IA

- copiloto;
- resumo sob demanda;
- identificação de produtos;
- takeover somente após homologação;
- release somente após descobrir e homologar ação oficial.

## 20. Itens explicitamente fora do escopo inicial

- CRM genérico;
- kanban comercial;
- pipeline de lead;
- departamentos complexos;
- campanhas dentro da tela de chat;
- sincronização de tags PapoAI com etiquetas internas;
- automações genéricas criadas pelo atendente;
- transcrição contínua de todos os áudios;
- transporte humano paralelo direto pela Meta;
- ativar/desativar IA apenas por flag local;
- alterar pedido confirmado automaticamente a partir de mensagens;
- armazenar mídia ilimitadamente sem política de retenção.

## 21. Critérios de sucesso

A v2 será considerada bem-sucedida quando:

1. o atendente conseguir trabalhar normalmente sem manter duas filas simultâneas;
2. a conversa mais recente sempre aparecer no topo pelo evento real de mensagem;
3. datas forem claras;
4. histórico mostrar os dois lados quando outbound estiver homologado;
5. mídias e localização forem úteis diretamente na timeline;
6. etiquetas e respostas rápidas forem administráveis sem código;
7. produtos puderem ser selecionados em grupo e levados para venda/orçamento;
8. nenhuma ação importante desaparecer lateralmente;
9. o copiloto reduzir leitura/retrabalho sem agir sozinho;
10. controles de ANA só aparecerem como funcionais quando houver confirmação real do PapoAI.

## 22. Decisão arquitetural final

A Central v2 **não espera o PapoAI ficar perfeito para evoluir**.

Tudo que é interno ao Vitrine Admin deve ser implementado de forma independente e confiável. Integrações externas entram por adapters e gates, somente quando seus contratos forem comprovados.

A prioridade técnica antes de qualquer recurso cosmético é tornar o histórico canônico fiel à conversa real: inbound, outbound, timestamps, tipo e mídia quando disponíveis.
