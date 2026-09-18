# Prompt para retomar em nova aba

Copie e cole exatamente este texto na nova conversa:

> Acesse o GitHub `osvaldosereia/SUCEDOAN12` e o Supabase `ssbesxgaijknwsjbsbcz`. Este trabalho é do projeto **Dona Antônia — Customer & Marketing OS** e não deve ser misturado com Marketing Admin/Organic Social, Studio Criativo, Caneca Fácil ou etapas gerais antigas da Dona Antônia.
>
> Leia primeiro, nesta ordem:
> 1. `docs/projects/customer-marketing-os/HANDOFF.md` — use o checkpoint mais recente no final do arquivo;
> 2. `docs/projects/customer-marketing-os/CURRENT-STATE.md`;
> 3. `docs/projects/customer-marketing-os/CM1-HOMOLOGATION-META-WEBHOOK-V2.md`;
> 4. `docs/projects/customer-marketing-os/CM1-HOMOLOGATION-META-POLICY-PREFLIGHT-V1.md`.
>
> Não use `docs/RETOMADA-DONA-ANTONIA.md` como fonte principal deste projeto, porque ele contém etapas gerais/legadas e diretrizes antigas que podem conflitar com o Customer & Marketing OS atual.
>
> Estado salvo: **20 critérios = 14 verified, 6 implemented aguardando evidência/gate, 0 blocked**. Homologação interna liberada. `external_activation_authorized=false`.
>
> Arquitetura vigente: **Supabase-first**. Make serve somente como histórico/auditoria; não criar automação nova nem runtime no Make.
>
> Meta atual: Graph API v26.0 comprovada; Flow health webhook verificado; Meta Direct OFF; outbound OFF; `direct_ready_flag=false`. `admin-whatsapp-direct-v1` v7 e `whatsapp-meta-direct-v1` v3. O botão **Meta Foundation → Verificar Meta agora** executa diagnóstico read-only com o token do Supabase.
>
> Meta Policy Registry: 8/8 ativo, readiness=true, todas fail-closed; regra de bens regulados atualizada para v2 com `license_override=false`.
>
> Comprar: `shopping-chat-products-v1` v16; tracking de `catalog_search` e `product_view` implantado, mas ainda sem evento orgânico desses dois tipos. Não fabricar evidência.
>
> CI mais recente salvo: run `35388463946`, SHA `1f29354122f550c6aea0282c457740980ead3e33`, **SUCCESS com 38 validações**.
>
> Antes de programar, consulte o runtime atual do Supabase e os commits/CI mais recentes para detectar qualquer mudança desde o checkpoint. Não reinicie etapas concluídas e preserve todos os gates.
>
> Se eu disser que já executei as ações humanas, confira imediatamente as novas evidências no Supabase e reexecute `cm1_acceptance_checklist_v1()`, `cm1_homologation_readiness_v1()` e `evaluate_meta_direct_readiness_v1(...)`. Continue de onde parou e programe autonomamente tudo que não exija ativação externa ou decisão humana sensível.

## Último checkpoint

Salvo em 18/09/2026 às 16:56 America/Cuiaba.

Fonte canônica: `docs/projects/customer-marketing-os/HANDOFF.md`.
