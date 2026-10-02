# Vitrine/Admin — Central de Atendimento v2

Data: 2026-10-02
Status: design aprovado em conversa; especificação para revisão antes do plano de implementação

## 1. Objetivo

Evoluir a Central de Atendimento do `Vitrine/Admin` para ser a estação operacional principal da Dona Antônia, com experiência próxima ao WhatsApp para o atendente, mantendo o PapoAI como infraestrutura atual de WhatsApp/ANA onde ele já é necessário.

A Central deve reduzir troca de telas, leitura confusa de histórico e operações repetitivas. Ela deve integrar conversa, cliente, pedidos, produtos e ferramentas de atendimento sem virar um CRM genérico.

Arquitetura aprovada:

- **Vitrine Admin / Supabase**: interface do atendente, organização, histórico canônico, etiquetas internas, respostas rápidas, cliente, pedidos, produtos, copiloto e estados operacionais locais.
- **PapoAI**: conexão atual dos números oficiais, ANA e recursos específicos do provedor.
- **Meta / WhatsApp Business Platform**: plataforma subjacente. Não introduzir transporte paralelo direto pela Meta enquanto o PapoAI continuar como provedor dos dois canais, salvo decisão futura explícita e homologada.

## 2. Princípios e restrições

1. Supabase permanece fonte canônica da operação interna do Admin.
2. Não criar segunda base de clientes, pedidos ou conversas.
3. Etiquetas da Central são internas da Dona Antônia e não têm relação com tags do PapoAI.
4. Não usar Make.
5. Não expor segredo, token ou URL sensível no navegador.
6. Não afirmar envio, leitura, autoria ou estado da IA sem evento/contrato confiável.
7. Respeitar janela de atendimento e regras oficiais da Meta.
8. Não permitir que ação visual local finja ter pausado ou reativado a ANA.
9. Não criar transporte humano direto pelo Admin enquanto não houver contrato oficial homologado para os dois canais.
10. A interface não deve depender de scroll horizontal escondido para ações principais.
11. A lista de conversas deve se comportar como WhatsApp: atividade real de mensagem mais recente no topo.
12. IA interna funciona como copiloto; nunca envia nem altera pedido/cadastro automaticamente.

## 3. Estado atual observado

Já existem:

- `whatsapp_accounts` com os dois números oficiais;
- `conversations` com canal, cliente, telefone, modo e timestamps;
- `whatsapp_messages_v1` como histórico canônico local;
- `customers`, `customer_addresses`, `orders`, `order_items`;
- `papoai_webhook_inbox_v2` para captura do PapoAI;
- `admin-whatsapp-ops-v1` como gateway privado da Central;
- busca de produtos com foto, preço, oferta e estoque vendável;
- emissão de link de catálogo personalizado;
- pontes do iframe para abrir cliente, pedido, orçamento e nova venda;
- cálculo local da janela de atendimento;
- interface atual com duas filas lado a lado, conversa central e painel contextual.

Limitações confirmadas:

- histórico local recente contém principalmente mensagens inbound;
- webhook de saída atual do PapoAI está configurado somente para `Mensagem recebida`;
- PapoAI expõe também `Mensagem enviada` e `Mensagem atualizada`, mas payload outbound ainda não foi homologado;
- `Parar resposta do assistente` existe, porém isolamento exato por sessão/canal ainda não foi comprovado;
- ação oficial para reativar a IA daquela conversa não foi confirmada;
- API pública de histórico do PapoAI não foi confirmada;
- listagem de templates é visível na interface, mas contrato de API do PapoAI para carga inicial não foi confirmado;
- `whatsapp_templates_v1` existe no Supabase e está sem carga útil para esta Central;
- mídia recebida pode incluir URL temporária, MIME, filename e dados de localização;
- URLs de mídia observadas podem expirar e não servem como armazenamento permanente.

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

A captura evolui para aceitar com segurança:

- mensagem recebida;
- mensagem enviada;
- mensagem atualizada, somente quando necessária para status confiável.

Não assumir que payload outbound tem o mesmo formato do inbound antes de observar payload real.

### 4.2 Saída humana

Enquanto não houver transporte homologado:

```text
Central
→ prepara resposta/produto/template
→ copiar conteúdo
→ abrir PapoAI
→ atendente envia no PapoAI
```

Envio direto no Admin permanece bloqueado.

### 4.3 Contexto operacional

```text
Central
→ admin-whatsapp-ops-v1
→ Supabase
→ cliente + endereços + pedidos + itens + produtos + estoque + consentimento + catálogo
```

### 4.4 Controle da ANA

Takeover somente após homologação por conversa:

```text
Admin: Assumir conversa
→ backend resolve canal + conversa + identificadores
→ PapoAI: Parar resposta do assistente
→ confirmação real
→ somente então Supabase grava estado manual
```

Release somente após existir ação oficial comprovada:

```text
Admin: Devolver para ANA
→ ação oficial de retomada no PapoAI
→ confirmação real
→ somente então Supabase grava estado IA
```

Como a retomada não foi confirmada, Release fica fora da implementação funcional inicial.

## 5. Layout desktop v2

Substituir quatro áreas por três:

```text
┌──────────────────┬────────────────────────────┬──────────────────────┐
│ CONVERSAS        │ CONVERSA                   │ CONTEXTO             │
│ [0975]  [1018]   │ Cliente        ANA ATIVA   │ Cliente              │
│ Buscar           │ timeline                   │ Pedidos              │
│ Etiquetas        │ texto / mídia / localização│ Produtos             │
│ lista            │                            │ Assistente           │
│                  ├────────────────────────────┤                      │
│                  │ ações + rascunho           │                      │
└──────────────────┴────────────────────────────┴──────────────────────┘
```

### 5.1 Coluna de conversas

Uma única coluna, aproximadamente da largura de uma fila atual.

Topo:

- botão grande `0975`;
- botão grande `1018`;
- busca por nome/telefone;
- filtro por etiqueta.

Remover filtros `Todos`, `Não lidos` e `Humano`.

Não lidas continuam como contador visual no card, sem alterar ordenação.

### 5.2 Ordenação

Definir `canonical_last_message_at` como a maior data entre mensagens canônicas persistidas da conversa, usando `received_at`, `sent_at` ou `created_at` conforme direção/fonte.

Ordenação:

1. `canonical_last_message_at desc`;
2. ID como desempate estável.

Não usar `conversations.updated_at` administrativo.
Não elevar conversa por modo humano ou contador não lido.

Quando outbound for persistido, mensagens recebidas e enviadas passam a mover a conversa.

### 5.3 Datas

Card:

- hoje: `HH:mm`;
- ontem: `Ontem`;
- mesmo ano: `dd/mm`;
- outro ano: `dd/mm/aa`.

Tooltip mostra data/hora completa.

## 6. Timeline

### 6.1 Texto

Inbound e outbound em lados distintos.

Autoria outbound somente quando comprovada:

- ANA;
- humano;
- template/sistema.

Sem autoria confiável, mostrar apenas `Enviado`.

### 6.2 Separadores de data

- Hoje;
- Ontem;
- data completa nas anteriores.

### 6.3 Paginação

Carregar lote recente e buscar anteriores ao chegar ao topo, preservando scroll.

### 6.4 Imagem

- miniatura na bolha;
- clique amplia;
- legenda quando existir;
- fallback se indisponível/expirada.

### 6.5 Áudio

- player HTML nativo;
- duração quando disponível;
- transcrição somente quando já vier de fonte confiável;
- não transcrever continuamente por padrão.

### 6.6 Documento

- ícone;
- filename;
- tipo amigável;
- abrir/baixar quando houver mídia válida.

### 6.7 Localização

Renderizar:

- nome, quando houver;
- endereço, quando houver;
- latitude/longitude;
- `Abrir no mapa`;
- `Copiar localização`;
- `Compartilhar link` gerado pelas coordenadas.

### 6.8 Retenção de mídia

Não persistir URL temporária do PapoAI como solução permanente.

Quando a mídia for necessária para histórico operacional:

1. backend baixa por URL validada/allowlist;
2. salva em armazenamento próprio privado;
3. guarda referência interna e metadata canônica;
4. gera acesso temporário ao Admin;
5. arquivo é retido por **30 dias por padrão**;
6. metadata textual da mensagem permanece no histórico depois da remoção do arquivo;
7. período deve ficar configurável no backend para futura mudança sem migration.

A primeira implementação não fará backfill de mídia antiga cuja URL já expirou.

## 7. Etiquetas internas

Criar:

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

Regras:

- cores vêm de pequena paleta predefinida, não hex livre;
- uma conversa aceita várias etiquetas;
- filtro aceita uma ou mais etiquetas;
- excluir na UI significa **desativar** (`is_active=false`), preservando histórico;
- etiqueta desativada sai dos seletores, mas vínculos antigos permanecem auditáveis;
- não sincronizar com tags PapoAI;
- nunca usar etiqueta para controlar ANA.

## 8. Respostas rápidas

Remover `QUICK_REPLIES` hardcoded.

Criar `attendance_quick_replies_v1`:

- id;
- title;
- body;
- is_active;
- is_favorite;
- sort_order;
- created_at;
- updated_at.

Operações:

- criar;
- editar;
- desativar;
- reativar;
- ordenar;
- marcar favorita.

Não fazer hard delete na primeira versão.

Na conversa:

- favoritas em acesso rápido;
- `Mais respostas` abre todas ativas;
- seleção apenas preenche rascunho.

## 9. Barra de ações

Ações sempre visíveis:

- Catálogo;
- Respostas;
- Produtos;
- Mais `…`.

`Mais`:

- Criar orçamento;
- Nova venda;
- Marcar retorno;
- Preferência de marketing;
- futuras ações aprovadas.

No desktop, ações principais devem caber sem scroll horizontal.

## 10. Templates WhatsApp

### 10.1 Cache local

Reutilizar `whatsapp_templates_v1` para:

- conta/canal;
- WABA;
- ID Meta;
- nome;
- idioma;
- categoria;
- status;
- components;
- quality rating;
- last_synced_at;
- metadata.

Preferência de atendimento será armazenada em `metadata.attendance`:

```json
{
  "show_in_attendance": true,
  "favorite_order": 10
}
```

Não criar tabela extra só para esta preferência.

### 10.2 Sincronização

Não afirmar sync automático via PapoAI enquanto contrato não estiver homologado.

Preparar consumo futuro de:

- `Modelo de mensagem criado`;
- `Modelo de mensagem alterado`.

Carga inicial automatizada somente quando houver contrato confiável para os dois canais.

A Meta possui APIs oficiais de listagem de templates por WABA e envio por `Phone-Number-ID`, mas não usar integração direta parcial enquanto os dois canais não estiverem igualmente provisionados e o PapoAI continuar como provedor definido.

### 10.3 Uso

Gerenciador permite escolher templates exibidos no atendimento.

Enquanto não houver transporte externo homologado:

- mostrar prévia;
- preparar parâmetros;
- abrir PapoAI para envio manual.

## 11. Produtos

### 11.1 Busca

Reutilizar busca por nome/EAN.

Resultado:

- foto;
- nome;
- preço;
- oferta ativa;
- estoque vendável;
- quantidade.

### 11.2 Seleção múltipla

Permitir vários produtos e quantidades antes da ação.

```text
[x] Arroz 5kg      qtd 2
[x] Óleo 900ml     qtd 3
[ ] Açúcar 2kg
```

### 11.3 Preparar para cliente

Enquanto envio direto estiver bloqueado:

- gerar rascunho organizado com produtos, quantidades e preços;
- disponibilizar foto/link quando apropriado;
- copiar e abrir PapoAI.

### 11.4 Venda/orçamento

Nunca alterar silenciosamente pedido confirmado.

- orçamento/venda editável: adicionar itens após ação explícita;
- sem operação editável: criar nova venda/orçamento pré-preenchido com cliente e itens;
- pedido em separação/faturamento mantém regras atuais e não é mutado diretamente pelo chat.

Reutilizar pontes existentes do Admin.

## 12. Painel contextual

Quatro abas:

### Cliente

- nome;
- telefone;
- endereço/cidade;
- cadastro completo/incompleto;
- documento mascarado;
- pedidos;
- valor comprado;
- consentimento marketing;
- etiquetas da conversa.

### Pedidos

- pedidos recentes;
- data;
- status;
- total;
- itens;
- abrir pedido;
- criar orçamento/venda.

### Produtos

Conforme seção 11.

### Assistente

Ações:

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
- não inventar estado de entrega/pagamento/cadastro;
- não rodar continuamente em todas as conversas.

Automação futura útil: ao assumir manualmente conversa longa, gerar resumo curto uma única vez, mas somente depois de takeover homologado.

## 13. Controle ANA / humano

### 13.1 Estado visual

Cabeçalho mostra um destes estados:

- `ANA ativa`;
- `Atendimento manual`;
- `Estado desconhecido`.

### 13.2 Takeover

`Parar resposta do assistente` existe no PapoAI, mas isolamento por sessão/canal ainda não foi comprovado.

Até homologação:

- exibir `Assumir atendimento` **desabilitado** com tooltip `Aguardando homologação do PapoAI`;
- não alterar `mode` local como se a IA tivesse parado.

Para habilitar:

1. adapter recebe identificador suficiente;
2. conversa correta é afetada;
3. canal correto é preservado;
4. teste controlado comprova isolamento;
5. confirmação real chega ao backend.

### 13.3 Release

Nenhuma ação oficial de retomada foi confirmada.

Na primeira entrega:

- não mostrar botão ativo `Devolver para ANA`;
- pode existir indicador informativo de que a função aguarda homologação;
- não usar `Concluir atendimento` como sinônimo;
- não criar workaround por tag, etiqueta ou flag local.

## 14. Outbound e histórico completo

PapoAI expõe na interface:

- `Mensagem recebida`;
- `Mensagem enviada`;
- `Mensagem atualizada`.

Antes de ativar outbound em produção:

1. capturar payload real em teste controlado;
2. validar canal;
3. validar sessão/conversa;
4. validar ID externo;
5. validar direção;
6. validar texto/tipo/timestamp;
7. validar autoria se existir;
8. validar mídia se existir;
9. garantir idempotência.

Sem autoria no payload, não inferir ANA/humano por heurística.

Após persistência confiável, outbound passa a atualizar `canonical_last_message_at` e a posição na fila.

## 15. Backend

Manter `admin-whatsapp-ops-v1` como gateway fino.

Separar responsabilidades em RPCs/tabelas/serviços específicos:

- fila e conversa;
- etiquetas;
- respostas rápidas;
- templates/cache;
- produtos selecionados e handoff;
- copiloto;
- mídia.

Integrações PapoAI ficam em adapters próprios atrás de feature gates.

## 16. Segurança

1. APIs da Central exigem autenticação Admin.
2. Browser nunca recebe service role ou segredo PapoAI.
3. IDs de cliente/canal/destino são resolvidos server-side a partir da conversa.
4. Mídia externa passa por allowlist e validação de tamanho/MIME antes de cache.
5. Mídia armazenada é privada; acesso por URL temporária.
6. Ações mutáveis registram usuário e horário.
7. Pedido continua obedecendo estoque/status canônicos.
8. Etiquetas/respostas rápidas não alteram estado do PapoAI.

## 17. Responsividade

Desktop:

- três colunas;
- scroll vertical independente em lista, timeline e contexto;
- sem scroll horizontal ocultando ações principais;
- conversa ocupa maior área útil.

Tablet:

- lista + conversa;
- contexto em drawer.

Mobile:

- lista → conversa;
- botão voltar explícito;
- contexto em drawer/tela sobreposta;
- seletor 0975/1018 disponível na lista.

## 18. Testes obrigatórios

Fila:

- troca de canal não mistura conversas;
- última mensagem real define ordem;
- outbound homologado sobe conversa;
- busca/etiqueta preservam canal;
- datas corretas.

Timeline:

- inbound/outbound em lados distintos;
- paginação preserva scroll;
- mídia/localização possuem fallback;
- URL expirada não quebra conversa;
- duplicata não aparece duas vezes.

Etiquetas:

- CRUD lógico;
- várias por conversa;
- filtro;
- nenhuma integração PapoAI.

Respostas rápidas:

- CRUD lógico;
- favoritas;
- rascunho;
- nenhum autoenvio.

Produtos:

- busca nome/EAN;
- seleção múltipla;
- quantidade;
- preço/estoque atual;
- handoff sem mutação indevida de pedido confirmado.

Assistente:

- somente sugestão;
- não envia;
- não muta dados;
- não inventa preço/estoque.

Gates PapoAI:

- takeover indisponível sem homologação;
- release indisponível sem contrato;
- transporte humano indisponível sem homologação;
- templates não aparecem como sincronizados sem origem confiável.

## 19. Fases de entrega

### Fase 1A — Base independente do PapoAI outbound

- fila única;
- seletor 0975/1018;
- ordenação usando mensagens canônicas já existentes;
- datas;
- layout/scroll;
- renderização de mídia e localização já capturadas;
- preparação do pipeline de mídia.

### Fase 1B — Histórico outbound

Executar somente após payload controlado de `Mensagem enviada`:

- normalização outbound;
- idempotência;
- persistência;
- autoria quando comprovada;
- recência bidirecional na fila.

### Fase 2 — Organização

- etiquetas internas;
- editor de respostas rápidas;
- barra de ações simplificada.

### Fase 3 — Comercial

- produtos múltiplos;
- quantidades;
- preparar conteúdo;
- handoff para orçamento/venda;
- gerenciador/cache de templates.

### Fase 4 — Inteligência e controle da IA

- copiloto;
- resumo sob demanda;
- produtos mencionados;
- takeover somente após homologação;
- release somente após ação oficial comprovada.

## 20. Fora do escopo inicial

- CRM genérico;
- kanban/pipeline comercial;
- departamentos complexos;
- campanhas dentro do chat;
- sincronização de tags PapoAI com etiquetas internas;
- automações genéricas configuráveis pelo atendente;
- transcrição contínua de áudio;
- transporte humano paralelo direto pela Meta;
- ativar/desativar ANA somente por flag local;
- alterar pedido confirmado automaticamente;
- armazenamento ilimitado de mídia;
- backfill de mídia antiga já expirada.

## 21. Critérios de sucesso

1. Um único painel de conversas com troca rápida 0975/1018.
2. Conversa mais recente no topo pelo evento real de mensagem.
3. Datas claras.
4. Histórico bidirecional quando outbound estiver homologado.
5. Imagem, áudio, documento e localização úteis na timeline.
6. Etiquetas e respostas rápidas administráveis sem código.
7. Produtos selecionáveis em grupo e encaminháveis para venda/orçamento.
8. Nenhuma ação importante escondida lateralmente.
9. Copiloto reduz leitura/retrabalho sem agir sozinho.
10. Controle da ANA só aparece funcional com confirmação real do PapoAI.

## 22. Decisão arquitetural final

A Central v2 não espera todas as integrações do PapoAI para evoluir.

Tudo que é interno ao Vitrine Admin deve funcionar de forma independente e confiável. Integrações externas entram por adapters e feature gates somente depois de seus contratos serem comprovados.

Prioridade técnica antes de recursos cosméticos: histórico canônico fiel à conversa real — inbound, outbound, timestamps, tipo, mídia e autoria somente quando comprovada.
