# Remoção completa do Admin V3 — Design

## Objetivo

Transformar `/admin/` no único Admin ativo da Dona Antônia, removendo todas as dependências de runtime de `/admin-v3/` e, somente depois da validação, excluir a pasta `admin-v3/` sem quebrar as funções atuais.

## Contexto confirmado

A aba **Imagens IA** do Admin oficial ainda apontava para `/admin-v3/imagens-ia.html`. A primeira etapa já moveu essa tela e seus assets necessários para `/admin/`, trocou a chave de sessão da tela para `da_admin_auth` e adicionou um teste específico que impede regressão para `admin-v3`.

A auditoria seguinte mostrou que a dependência é mais ampla. O `admin/index.html` ainda importa estilos e módulos de `/admin-v3/`; `admin/pedidos.html` ainda usa `styles.css`, `pedidos-v2.css`, `pedidos-v2.js`, além de links para Atendimento e Nomes dos produtos dentro de `/admin-v3/`; e `admin/aprendizados.html` ainda usa estilos, guard e `agent-learning.js` da pasta antiga.

## Estratégia escolhida

Migrar apenas o que está efetivamente em uso pelo `/admin/`, em blocos testáveis, preservando comportamento e contratos existentes. Não haverá redesign funcional nesta etapa. Arquivos antigos que não são consumidos por nenhum fluxo ativo não serão copiados por padrão; serão removidos junto com `admin-v3/` depois que a auditoria de referências confirmar que ficaram órfãos.

A alternativa de simplesmente copiar toda a pasta `admin-v3/` para `admin/` foi rejeitada porque perpetuaria código morto e nomes antigos. A alternativa de reescrever o Admin sobre outra arquitetura agora também foi rejeitada porque aumentaria muito o risco e o escopo da limpeza.

## Arquitetura alvo

`/admin/` será autossuficiente. O shell visual, configuração, autenticação, rotas principais e subpáginas ficarão todos no mesmo namespace. Nenhum HTML, CSS, JavaScript, teste de produção ou carregador ativo poderá conter URL ou import para `/admin-v3/`.

As funções de negócio continuam apontando para os mesmos serviços Supabase/Edge Functions já usados hoje. A migração é de frontend/runtime e organização de arquivos; não altera tabelas, regras de negócio ou endpoints sem necessidade específica descoberta durante os testes.

## Blocos de migração

### 1. Shell principal do Admin

Mover para `/admin/` os estilos e módulos ainda carregados por `admin/index.html`, ajustando imports relativos e referências de assets. O `admin/index.html` passará a carregar apenas caminhos locais de `/admin/` e rotas públicas já existentes, como `/comprar/` e `/contagem/`.

### 2. Pedidos

Mover `pedidos-v2.css` e `pedidos-v2.js` para `/admin/`, ajustar `admin/pedidos.html` para o shell local e manter filtros, paginação, detalhes e ações atuais. Os links laterais para Nomes dos produtos e Atendimento também passarão para páginas locais do Admin.

### 3. Atendimento, Inteligência e Aprendizados

Migrar as subpáginas ativas e seus módulos auxiliares para `/admin/`, incluindo os guards de sessão necessários. A chave de sessão oficial será `da_admin_auth`. Imports internos serão relativos ao novo namespace.

### 4. Nomes dos produtos

Migrar a tela ativa de padronização de nomes, seus estilos/scripts e qualquer helper necessário para `/admin/`, preservando o comportamento atual e removendo nomenclatura `v3` do caminho público sempre que isso não quebrar contratos internos.

### 5. Módulos condicionais do shell

Auditar e migrar somente os módulos realmente carregados pelas flags atuais de `admin/config.js`, como Central comercial, Logística e Automation Builder, caso ainda sejam dependências do shell oficial. Flags desativadas ou módulos sem consumidor serão classificados como órfãos antes de serem removidos.

### 6. Auditoria final e exclusão

Adicionar um teste global que falha se houver referências runtime a `/admin-v3/` em entradas ativas. Depois de todos os testes de Admin e Comprar passarem, excluir `admin-v3/` e rodar novamente a suíte completa relevante.

## Regras de compatibilidade

- O Admin continua acessível em `/admin/`.
- Nenhuma função atualmente disponível no menu oficial deve desaparecer por causa da limpeza.
- Não alterar contratos Supabase/Edge Functions apenas para mudar a localização dos arquivos.
- Não alterar a experiência do Comprar, salvo links administrativos que hoje apontem para o namespace antigo.
- A autenticação das subpáginas deve convergir para `da_admin_auth`.
- O rótulo visual deve ser apenas `Admin`, nunca `Admin V3`.
- A pasta `admin-v3/` só pode ser apagada depois que a busca de referências ativas e os testes automatizados estiverem verdes.

## Testes

A migração seguirá TDD por bloco. Cada bloco ganha primeiro uma asserção que reproduz a dependência antiga ou exige o novo caminho. O teste deve falhar antes da migração e passar depois.

A verificação mínima final inclui:

- teste dedicado de independência de `admin-v3`;
- `Testar Admin Dona Antônia`;
- `Testar Admin V2 definitivo` apenas para regressões realmente relacionadas ao Admin, separando falhas preexistentes de módulos não tocados;
- `Testar Sala de Compra`;
- testes específicos das páginas migradas;
- busca final por referências runtime a `admin-v3`;
- inspeção dos assets públicos após merge/deploy antes de afirmar que a remoção está em produção.

## Critério de conclusão

A limpeza só é considerada concluída quando:

1. `/admin/` funciona sem carregar nenhum arquivo de `/admin-v3/`;
2. as subpáginas ativas abrem dentro do namespace `/admin/`;
3. os testes específicos das páginas migradas passam;
4. nenhuma referência runtime ativa aponta para `admin-v3`;
5. a pasta `admin-v3/` foi removida do repositório;
6. o site publicado serve os novos arquivos de `/admin/` após o merge.
