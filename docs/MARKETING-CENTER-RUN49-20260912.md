# Marketing Center — Run 49 — 2026-09-12

## Escopo desta rodada

Somente Marketing. Nenhum Make, rollout, deploy, publicação real, credencial social, aumento de canary, IA paga ou gasto externo foi ativado.

## Auditoria antes de alterar

- `docs/RETOMADA-DONA-ANTONIA.md` e `docs/MARKETING-CENTER-RUN48-20260912.md` relidos.
- `main` auditada no SHA `3b6fdc0ec5c49213717bd17aa10fd564c04d8853`; atividade recente concentrada em Admin/Vitrine, fora do Marketing.
- PRs recentes auditadas; mantida a branch isolada `feat/marketing-center-clean-20260911` / PR #276, sem rebase, merge ou force-push automático.
- Supabase real auditado antes de alterar e novamente ao final: runtime Marketing OFF, `execution_mode=off`, canary 0%, kill switch ON, geração/render/IA/publicadores OFF, aprovação obrigatória e budgets zero.
- Contagens finais: 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests, 0 channel accounts, 8 eventos internos e 0 eventos com `external_side_effect=true`.
- Todas as tabelas `marketing_%` auditadas continuam com RLS ligado.
- Funções `marketing_%` auditadas continuam `SECURITY INVOKER`, sem EXECUTE para `anon`/`authenticated` e com EXECUTE para `service_role`.
- Security Advisor continua com avisos preexistentes fora do Marketing (WhatsApp/Agent Workflow e leaked-password protection); nenhum deles foi alterado nesta rodada.

## Bloco 1 — pacote efêmero de render em memória

Arquivos:

- `scripts/marketing-render-preview-buffer-v1.mjs`
- `scripts/test-marketing-render-preview-buffer-v1.mjs`
- `.github/workflows/marketing-center-clean-v1.yml`

Foi fechada a cadeia local de imagem para preview sem Storage:

`manifesto seguro -> SVG bytes -> PNG Buffer -> preview metadata`

O novo `buildMarketingRenderPreviewBuffer()`:

- aceita apenas manifesto `marketing-render-manifest-v1` seguro e de imagem;
- valida `asset_id` e `revision` contra o manifesto;
- reutiliza o rasterizador PNG em memória já homologado;
- mantém o PNG apenas em `Buffer`, sem filesystem ou Storage;
- expõe para a aprovação somente metadados: perfil, dimensões, MIME, tamanho, SHA-256 e chaves de idempotência;
- não inclui `png_bytes` nos metadados de aprovação;
- mantém `preview_only=true`, `external_side_effect=false`, `network_allowed=false`, `provider_call_allowed=false` e `storage_write_allowed=false`;
- rejeita manifesto de vídeo, identidade divergente ou manifesto adulterado;
- gera chaves de idempotência determinísticas.

### TDD

- RED: commit `deafb1c7f7790bc1948577eb915655318cb06599`, run `34676339703`, falhou no syntax-check porque o builder de produção ainda não existia.
- GREEN: commit funcional `0b0f387b374b2aaf1ba956a1f07b429e609f9be9`, run `34676365524`, `completed/success`; todos os contratos Marketing passaram, inclusive `Validate ephemeral render preview buffer`.

## Bloco 2 — integridade do render dentro do preview de aprovação

Arquivos:

- `scripts/marketing-approval-preview-v1.mjs`
- `scripts/test-marketing-approval-preview-v1.mjs`
- `admin-v3/marketing-approval-preview-readonly-v1.js`
- `scripts/test-marketing-approval-preview-readonly-ui-v1.mjs`

O pacote de aprovação agora recebe somente `marketing-render-preview-metadata-v1` e valida fail-closed:

- schema/versionamento;
- `preview_only=true`;
- ausência de efeito externo, rede, provider e Storage;
- `asset_id` e `revision` coerentes;
- dimensões positivas e MIME `image/png`;
- SHA-256 válido;
- vínculo com a idempotency key do manifesto e do raster;
- perfil real compatível com o manifesto e com o canal de destino.

Estados ausente, inválido ou incompatível viram blockers explícitos. O preview continua incondicionalmente com `ready_for_real_publish=false` e sem mutações.

A UI privada/dormente passou a mostrar, por destino:

- perfil esperado -> perfil atual;
- dimensões do PNG local;
- prefixo do SHA-256;
- tamanho em bytes;
- sem carregar bytes do PNG, sem upload, sem fetch e sem qualquer botão de publicar/executar/aprovar.

### TDD

- RED: commit de testes `336ea631cb093aa10772ec0b6e0d2f600a7505bb`, run `34676430400`, falhou exatamente em `Validate local-only Marketing approval preview contract` antes da implementação.
- GREEN: commit funcional `e82cd71bbf0a6d5a6ee70c8d4fa8d4b60a185fd4`, run `34676495086`, `completed/success`; todos os passos do workflow Marketing passaram.

## Segurança / Supabase

Nenhuma migration, Edge Function, credencial ou integração foi implantada/reimplantada.

Estado final preservado:

- Marketing OFF;
- `execution_mode=off`;
- canary 0%;
- kill switch ON;
- geração determinística OFF;
- IA de imagem/vídeo OFF;
- publicação global OFF;
- WhatsApp Status OFF;
- Instagram Stories OFF;
- Facebook Stories OFF;
- Instagram Carrossel OFF;
- Pinterest OFF;
- Google Perfil da Empresa OFF;
- aprovação obrigatória;
- attribution/triage/requeue OFF;
- budgets zero;
- 0 efeitos externos registrados.

Security Advisor mantém avisos preexistentes fora do Marketing: `route_whatsapp_active_basket_address_guard_v52()` executável como `SECURITY DEFINER`, algumas funções Agent Workflow executáveis por `authenticated`, e leaked-password protection desativado. Permaneceram intocados por estarem fora do escopo desta PR.

## Decisões de segurança

- O PNG rasterizado continua estritamente efêmero; não há upload para Storage.
- A aprovação recebe apenas hash/metadados, nunca os bytes do PNG.
- A superfície continua fora do Admin público e não cria caminho de mutação/publicação.
- Não criar executor de vídeo enquanto não houver runtime pinado/homologado equivalente.
- Não reconciliar a PR automaticamente com `main` enquanto houver forte atividade concorrente fora do Marketing.

## Próximo bloco seguro

1. Evoluir o renderer SVG para uma variante totalmente em memória, eliminando o filesystem também na etapa SVG antes do PNG.
2. Encadear `spec -> SVG bytes -> manifesto -> PNG Buffer -> preview metadata -> approval preview` em um orquestrador local único e fail-closed, ainda sem Storage/rede/provider.
3. Reforçar limites de memória/tamanho e hashes de entrada/saída para imagens.
4. Manter vídeo apenas como manifesto/plano até existir runtime pinado e homologado.
5. Continuar com IA real, publishers, dispatch, requeue, canary e gastos pagos totalmente OFF.

## Estado

Marketing ainda não está integralmente concluído/homologado. A execução recorrente deve continuar.